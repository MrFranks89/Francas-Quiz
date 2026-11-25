import json
import logging
from io import BytesIO
from pathlib import PurePosixPath

import pypdfium2 as pdfium
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from .account.auth import utente_corrente
from .account.config import is_auth_required
from .account.db import db_transaction, open_db, resolve_db_path
from .account.limiti import CourseLimitReached, slot_corso
from .account.modelli import Utente
from .account.spesa_scope import scope_spesa
from .documents import (
    MAX_BYTES,
    MESSAGGIO_FOGLI,
    extract_outline,
    fonte_ammessa,
    has_digital_text,
    inspect_document,
)
from .extractors import native_extract
from .generation.errors import GenerationError
from .models import ExtractionRequest, selected_pages
from .spesa_generazione import SpesaRifiuto, trascrivi_con_tetto

router = APIRouter()
logger = logging.getLogger(__name__)


def read_record(store, identifier, suffix):
    try:
        return store.read(identifier, suffix)
    except FileNotFoundError:
        raise HTTPException(404, 'Risorsa non trovata.')


public_router = APIRouter()


@public_router.get('/health')
def health():
    return {'status': 'ok', 'mode': 'local-single-operator'}


@router.post('/documents', status_code=201)
async def upload(request: Request, file: UploadFile = File(...)):
    store = request.app.state.store
    identifier = store.new_id()
    path = store.path(identifier, 'source')
    filename = PurePosixPath((file.filename or 'documento').replace('\\', '/')).name
    try:
        size = 0
        with path.open('wb') as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, 'Dimensione massima: 25 MB.')
                target.write(chunk)
        if not size:
            raise ValueError('Il file è vuoto.')
        kind, count = inspect_document(path, filename)
        chapters = extract_outline(path, count) if kind == 'pdf' else []
        has_digital = has_digital_text(path, count) if kind == 'pdf' else (False if kind in ('image', 'audio') else True)
        result = {
            'id': identifier,
            'name': filename,
            'kind': kind,
            'pageCount': count,
            'chapters': chapters,
            'hasDigitalText': has_digital,
        }
        store.save(identifier, 'document.json', result)
        return result
    except HTTPException:
        path.unlink(missing_ok=True)
        raise
    except Exception as error:
        path.unlink(missing_ok=True)
        logger.warning('Document upload rejected: %s', type(error).__name__)
        detail = str(error) if isinstance(error, ValueError) else 'File corrotto o non leggibile.'
        raise HTTPException(422, detail) from error
    finally:
        await file.close()


@router.delete('/documents/{identifier}', status_code=204)
def delete_document(
    identifier: str,
    request: Request,
    utente: Utente = Depends(utente_corrente),
):
    store = request.app.state.store
    if is_auth_required() and utente and utente.user_id != 'local':
        store = store.per_utente(utente.user_id)

    try:
        doc_path = store.path(identifier, 'document.json')
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, 'Documento non trovato.')

    if not doc_path.exists():
        raise HTTPException(404, 'Documento non trovato.')

    # 1. Trova tutte le estrazioni che referenziano questo documento
    extractions_to_delete = []
    for ext_file in store.root.glob('*.extraction.json'):
        try:
            ext_data = json.loads(ext_file.read_text(encoding='utf-8'))
            if isinstance(ext_data, dict) and ext_data.get('documentId') == identifier:
                ext_id = ext_data.get('id') or ext_file.name.split('.')[0]
                extractions_to_delete.append(ext_id)
        except (json.JSONDecodeError, OSError):
            continue

    # 2. Verifica se esiste un corso pubblicato collegato al documento o alle sue estrazioni
    for course_file in store.root.glob('*.course.json'):
        try:
            course_data = json.loads(course_file.read_text(encoding='utf-8'))
            course_obj = course_data.get('course') if isinstance(course_data, dict) else None
            doc_id = None
            if isinstance(course_obj, dict):
                doc_id = course_obj.get('documentId')
            elif isinstance(course_data, dict):
                doc_id = course_data.get('documentId')

            ext_id = None
            if isinstance(course_data, dict):
                ext_id = course_data.get('extractionId') or course_data.get('id')

            if doc_id == identifier or (ext_id and ext_id in extractions_to_delete):
                raise HTTPException(
                    409,
                    detail={
                        'code': 'DOCUMENT_HAS_COURSE',
                        'message': 'Impossibile eliminare: esiste un corso pubblicato collegato al documento.',
                    },
                )
        except HTTPException:
            raise
        except (json.JSONDecodeError, OSError):
            continue

    # 3. Elimina le estrazioni e pulisci DB corsi_utente
    base_dir = getattr(store, 'base_root', None)
    db_path = resolve_db_path(base_dir)
    conn = None
    if is_auth_required() and utente and utente.user_id != 'local':
        try:
            conn = open_db(db_path)
        except Exception:
            conn = None

    for ext_id in extractions_to_delete:
        for f in store.root.glob(f'{ext_id}.*'):
            f.unlink(missing_ok=True)
        if conn is not None:
            try:
                with db_transaction(conn):
                    conn.execute(
                        "DELETE FROM corsi_utente WHERE extraction_id = ? AND user_id = ?",
                        (ext_id, utente.user_id),
                    )
            except Exception as e:
                logger.warning('Errore pulizia corsi_utente per %s: %s', ext_id, e)

    # 4. Elimina file sorgente, document.json e correlati al documento
    for f in store.root.glob(f'{identifier}.*'):
        f.unlink(missing_ok=True)

    return Response(status_code=204)


@router.get('/documents/{identifier}/pages/{page}/preview')
def preview(identifier: str, page: int, request: Request):
    store = request.app.state.store
    document = read_record(store, identifier, 'document.json')
    if document['kind'] == 'image':
        if page != 1:
            raise HTTPException(422, "La foto è un documento di una sola pagina.")
        from PIL import Image, ImageOps
        with Image.open(store.path(identifier, 'source')) as img:
            img = ImageOps.exif_transpose(img).convert('RGB')
            output = BytesIO()
            img.save(output, 'PNG')
        return Response(output.getvalue(), media_type='image/png', headers={'X-Original-Page': '1'})
    if document['kind'] != 'pdf' or not 1 <= page <= document['pageCount']:
        raise HTTPException(422, 'Anteprima disponibile solo per pagine PDF valide.')
    try:
        with pdfium.PdfDocument(str(store.path(identifier, 'source'))) as pdf:
            selected = pdf[page - 1]
            try:
                width, height = selected.get_size()
                bitmap = selected.render(scale=min(1.5, 1400 / max(width, height)))
                try:
                    output = BytesIO()
                    bitmap.to_pil().save(output, format='PNG')
                finally:
                    bitmap.close()
            finally:
                selected.close()
        return Response(output.getvalue(), media_type='image/png', headers={'X-Original-Page': str(page)})
    except Exception as error:
        logger.error('PDF preview failed: %s', type(error).__name__)
        raise HTTPException(422, 'Impossibile generare anteprima PDF.') from error


@router.post('/documents/{identifier}/extract', status_code=201)
def extract(identifier: str, body: ExtractionRequest, request: Request):
    store = request.app.state.store
    document = read_record(store, identifier, 'document.json')
    if not fonte_ammessa(document):
        raise HTTPException(422, MESSAGGIO_FOGLI)
    try:
        pages_res = selected_pages(body.selection, document['pageCount'], document['kind'])
        if isinstance(pages_res, list):
            pages = pages_res
            start, end = (pages[0], pages[-1]) if pages else (None, None)
        else:
            start, end = pages_res
            pages = list(range(start, end + 1)) if start and end else None
    except ValueError as error:
        raise HTTPException(422, str(error)) from error

    utente = getattr(request.state, 'utente', None)
    base_dir = getattr(store, 'base_root', None)
    db_path = resolve_db_path(base_dir)
    extraction_id = store.new_id()

    try:
        with slot_corso(utente, extraction_id, db_path=db_path):
            if document['kind'] == 'audio':
                engine = 'trascrizione'
            elif document['kind'] == 'image':
                engine = 'docling'
            else:
                engine = body.engine
            scope = scope_spesa(utente)
            if engine == 'trascrizione':
                import mutagen
                from .trascrizione import trascrivi
                audio_path = store.path(identifier, 'source')
                audio_info = mutagen.File(audio_path)
                durata = getattr(audio_info.info, 'length', 0) if audio_info and audio_info.info else 0
                client_audio = getattr(request.app.state, 'groq_client', None)
                provider_audio = getattr(request.app.state, 'transcription_provider', None)
                blocks, warnings, status, _ = trascrivi_con_tetto(
                    store,
                    durata,
                    lambda: trascrivi(audio_path, nome=document.get('name'), client=client_audio, provider=provider_audio),
                    scope=scope,
                )
            elif engine == 'native':
                blocks, warnings, status = native_extract(store.path(identifier, 'source'), document['kind'], start, end, pages=pages)
            else:
                from .docling_adapter import docling_extract
                blocks, warnings, status = docling_extract(store.path(identifier, 'source'), document['kind'], start, end)

            page_count = len(pages) if pages is not None else (end - start + 1 if start else None)
            result = {'id': extraction_id, 'documentId': identifier, 'selection': body.selection.model_dump(), 'pageCount': page_count, 'blocks': blocks, 'warnings': warnings, 'status': status, 'engine': engine}
            store.save(extraction_id, 'extraction.json', result)
            return result
    except CourseLimitReached as limit_err:
        raise HTTPException(403, detail=limit_err.to_payload()) from limit_err
    except SpesaRifiuto as rifiuto:
        detail = {'code': rifiuto.code, 'message': str(rifiuto)}
        if getattr(rifiuto, 'scope', None):
            detail['scope'] = rifiuto.scope
        raise HTTPException(rifiuto.status, detail) from rifiuto
    except GenerationError as error:
        status_code = 503 if error.code == 'not_configured' else 422
        raise HTTPException(status_code, {'code': error.code, 'message': str(error)}) from error
    except RuntimeError as error:
        logger.warning('Extraction unavailable: %s', type(error).__name__)
        raise HTTPException(503, str(error)) from error
    except Exception as error:
        logger.error('Extraction failed: %s', type(error).__name__)
        raise HTTPException(422, 'Estrazione non riuscita; verificare il documento.') from error


@router.get('/extractions/{identifier}')
def get_extraction(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'extraction.json')
