"""Optional, offline PDF extraction. Models must be provisioned explicitly."""
import os
from io import BytesIO
from pathlib import Path


def _converter(artifacts):
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except ImportError as error:
        raise RuntimeError('Docling non installato: installare requirements-ocr.txt.') from error
    # Docling 2.138 pipeline_options.artifacts_path and rapid_ocr_model.py:
    # a non-null artifacts directory enforces local weights, without fallback downloads.
    options = PdfPipelineOptions(artifacts_path=artifacts, do_ocr=True,
                                 ocr_options=RapidOcrOptions(lang=['iso:it']), document_timeout=120)
    return DocumentConverter(allowed_formats=[InputFormat.PDF],
                             format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})


def docling_extract(path, kind, start, end):
    if kind != 'pdf':
        raise ValueError('Docling è disponibile in questa versione solo per PDF.')
    configured = os.environ.get('DOCLING_ARTIFACTS_PATH')
    if not configured or not Path(configured).is_dir():
        raise RuntimeError('Configurare DOCLING_ARTIFACTS_PATH con i modelli Docling già scaricati localmente.')
    try:
        from docling.datamodel.document import DocumentStream
        converter = _converter(Path(configured))
        # Source: installed Docling DocumentConverter.convert(page_range: PageRange).
        # DocumentStream supplies the real format; storage filenames deliberately have no extension.
        result = converter.convert(DocumentStream(name='source.pdf', stream=BytesIO(path.read_bytes())),
                                   page_range=(start, end), raises_on_error=True)
    except (FileNotFoundError, ImportError) as error:
        raise RuntimeError('Modelli o dipendenze Docling mancanti: completare il provisioning offline.') from error
    return _blocks(result.document, start, end)


def _blocks(document, start, end):
    blocks, warnings, covered = [], [], set()
    for item, _level in document.iterate_items():
        pages = {p.page_no for p in getattr(item, 'prov', []) if start <= p.page_no <= end}
        if not pages:
            continue
        label = str(getattr(item, 'label', 'Contenuto'))
        if 'picture' in label.lower():
            warnings.append(f'Figura a pagina {min(pages)}: contenuto visivo da verificare.')
            continue
        text = getattr(item, 'text', None)
        if text is None and hasattr(item, 'export_to_markdown'):
            text = item.export_to_markdown(doc=document)
        if text and text.strip():
            for page in sorted(pages):
                covered.add(page)
                blocks.append({'id': f'b{len(blocks)+1}', 'text': text, 'page': page,
                               'label': f'Pagina {page} — {label}'})
    for page in range(start, end+1):
        if page not in covered:
            warnings.append(f'Pagina {page} priva di testo estratto: revisione necessaria.')
    warnings.append('OCR e tabelle ricostruiti automaticamente: verificare accuratezza prima della pubblicazione.')
    return blocks, warnings, 'needs_review'
