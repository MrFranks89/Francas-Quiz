import logging
from pathlib import PurePosixPath

import pypdfium2 as pdfium
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from io import BytesIO

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
from .account.db import resolve_db_path
from .account.limiti import CourseLimitReached, slot_corso
from .account.spesa_scope import scope_spesa
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
        start, end = selected_pages(body.selection, document['pageCount'], document['kind'])
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
                blocks, warnings, status = native_extract(store.path(identifier, 'source'), document['kind'], start, end)
            else:
                from .docling_adapter import docling_extract
                blocks, warnings, status = docling_extract(store.path(identifier, 'source'), document['kind'], start, end)

            result = {'id': extraction_id, 'documentId': identifier, 'selection': body.selection.model_dump(), 'pageCount': end - start + 1 if start else None, 'blocks': blocks, 'warnings': warnings, 'status': status, 'engine': engine}
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
