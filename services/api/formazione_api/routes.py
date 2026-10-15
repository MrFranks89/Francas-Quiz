import logging
from pathlib import PurePosixPath

import pypdfium2 as pdfium
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from io import BytesIO

from .documents import MAX_BYTES, inspect_document
from .extractors import native_extract
from .models import ExtractionRequest, selected_pages

router = APIRouter()
logger = logging.getLogger(__name__)


def read_record(store, identifier, suffix):
    try:
        return store.read(identifier, suffix)
    except FileNotFoundError:
        raise HTTPException(404, 'Risorsa non trovata.')


@router.get('/health')
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
        kind, count, sheets = inspect_document(path, filename)
        result = {'id': identifier, 'name': filename, 'kind': kind, 'pageCount': count, 'sheets': sheets}
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
    try:
        start, end = selected_pages(body.selection, document['pageCount'], document['kind'])
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    try:
        if body.engine == 'native':
            blocks, warnings, status = native_extract(store.path(identifier, 'source'), document['kind'], start, end)
        else:
            from .docling_adapter import docling_extract
            blocks, warnings, status = docling_extract(store.path(identifier, 'source'), document['kind'], start, end)
    except RuntimeError as error:
        logger.warning('Extraction unavailable: %s', type(error).__name__)
        raise HTTPException(503, str(error)) from error
    except Exception as error:
        logger.error('Extraction failed: %s', type(error).__name__)
        raise HTTPException(422, 'Estrazione non riuscita; verificare il documento.') from error
    extraction_id = store.new_id()
    result = {'id': extraction_id, 'documentId': identifier, 'selection': body.selection.model_dump(), 'pageCount': end - start + 1 if start else None, 'blocks': blocks, 'warnings': warnings, 'status': status, 'engine': body.engine}
    store.save(extraction_id, 'extraction.json', result)
    return result


@router.get('/extractions/{identifier}')
def get_extraction(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'extraction.json')
