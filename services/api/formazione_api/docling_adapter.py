"""Optional, offline PDF extraction. Models must be provisioned explicitly."""
import os
import re
from io import BytesIO
from pathlib import Path

from .extractors import testo_nativo_scansioni
from .pagine_non_lette import avviso_ocr_vuoto

# Limite di tempo dell'OCR, proporzionale alle pagine selezionate. Misura reale sul corpus
# (docs/MISURE.md): 5 pagine di 02-dpr-547-1955 in 134 s, circa 27 s per pagina su CPU. Con il
# limite fisso di 120 s Docling consegnava 13 pagine su 50 (01, pp. 94-143) e 0 su 48 (02).
# 60 s per pagina è poco più del doppio della misura; il minimo copre il carico iniziale.
SECONDS_PER_PAGE = 60
# Versione dichiarata dell'adattatore, nella chiave della cache delle misure (measurement/corsa.py).
# Cambiarla quando cambiano configurazione di Docling, testo o avvisi prodotti.
VERSIONE = '2026-10-29-ocr-pagina-intera'
MIN_TIMEOUT = 120

# Caratteri utili minimi che l'OCR deve leggere su una pagina «probabile scansione» oltre al suo
# testo nativo. Misura su 01 pp. 94-143 e 02 per intero in docs/VERIFICHE.md (OCR del 29-10-2026).
SOGLIA_CARATTERI_UTILI = 50


class OcrIncompleto(RuntimeError):
    """Docling ha restituito meno pagine di quelle selezionate. È un RuntimeError perché routes.py
    ne riporta il messaggio all'utente (503); un'eccezione generica diventerebbe un 422 muto."""


def _converter(artifacts, pages=1):
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import OcrMode, PdfPipelineOptions, RapidOcrOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except ImportError as error:
        raise RuntimeError('Docling non installato: installare requirements-ocr.txt.') from error
    # Docling 2.138 pipeline_options.artifacts_path and rapid_ocr_model.py:
    # a non-null artifacts directory enforces local weights, without fallback downloads.
    #
    # OcrMode.FULL_PAGE (Docling 2.138, datamodel/pipeline_options.py, OcrOptions.mode; sostituisce
    # il deprecato force_full_page_ocr). Con il predefinito (DEFAULT = PDF_AWARE_LAYOUT_REGIONS)
    # l'OCR legge le zone sopra un'immagine, ma poi BaseOcrModel.post_process_cells
    # (models/base_ocr_model.py) unisce con priorità PDF_FIRST: _merge_cells_by_priority scarta ogni
    # cella OCR che interseca una cella di testo nativo. In 01-dlgs-81-2008, pp. 94-325, la
    # filigrana nativa diagonale «COPIA TRATTA DA GURITEL…» ha un riquadro di 454×642 punti su
    # 595×842: tutte le celle OCR la intersecano e restava solo la filigrana (misurato: pp. 94-98,
    # 1429 caratteri letti dall'OCR a p. 94, 0 conservati). FULL_PAGE usa solo le celle OCR
    # («Any existing PDF cells are ignored», post_process_cells). Misure in docs/VERIFICHE.md: su
    # 01 pp. 94-98 legge quanto LAYOUT_REGIONS ma in meno tempo (52 s contro 84 s per 5 pagine);
    # sulle pagine native il testo diventa OCR (per quelle resta il motore nativo).
    options = PdfPipelineOptions(artifacts_path=artifacts, do_ocr=True,
                                 ocr_options=RapidOcrOptions(lang=['iso:it'], mode=OcrMode.FULL_PAGE),
                                 document_timeout=max(MIN_TIMEOUT, SECONDS_PER_PAGE * pages))
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
        from docling.datamodel.base_models import ConversionStatus
        converter = _converter(Path(configured), end - start + 1)
        # Source: installed Docling DocumentConverter.convert(page_range: PageRange).
        # DocumentStream supplies the real format; storage filenames deliberately have no extension.
        result = converter.convert(DocumentStream(name='source.pdf', stream=BytesIO(path.read_bytes())),
                                   page_range=(start, end), raises_on_error=True)
    except (FileNotFoundError, ImportError) as error:
        raise RuntimeError('Modelli o dipendenze Docling mancanti: completare il provisioning offline.') from error
    _require_all_pages(result, start, end, ConversionStatus.SUCCESS)
    blocks, warnings, status = _blocks(result.document, start, end)
    return blocks, _scansioni_non_lette(path, start, end, blocks) + warnings, status


def caratteri_utili(testo_ocr, testo_nativo):
    """Caratteri alfanumerici delle parole OCR che non compaiono nel testo nativo della pagina.
    Il confronto è per sottostringa sul testo nativo senza spazi né punteggiatura: l'OCR a pagina
    intera rilegge anche la filigrana nativa, spezzata in frammenti («IALE», «E ON-LIN»)."""
    nativo = re.sub(r'\W', '', testo_nativo).lower()
    parole = (re.sub(r'\W', '', parola) for parola in testo_ocr.split())
    return sum(len(parola) for parola in parole if parola and parola.lower() not in nativo)


def _scansioni_non_lette(path, start, end, blocks):
    """Un OCR completato non basta: sulle pagine che sono immagini (stesso criterio dell'avviso
    «probabile scansione» di extractors.py) deve aver letto più del testo nativo. Prima della
    correzione dell'OcrMode, 50 pagine su 50 di 01 erano «complete» con la sola filigrana."""
    letto = {}
    for block in blocks:
        letto[block['page']] = letto.get(block['page'], '') + ' ' + block['text']
    return [avviso_ocr_vuoto(page) for page, nativo in testo_nativo_scansioni(path, start, end).items()
            if caratteri_utili(letto.get(page, ''), nativo) < SOGLIA_CARATTERI_UTILI]


def _require_all_pages(result, start, end, success):
    """Docling 2.138: scaduto document_timeout, StandardPdfPipeline._integrate_results tiene in
    result.pages solo le pagine completate e imposta status PARTIAL_SUCCESS; convert() con
    raises_on_error=True non solleva per PARTIAL_SUCCESS (document_converter.py, convert_all).
    Si controllano entrambi: pagine assenti, oppure uno stato diverso da SUCCESS."""
    done = {page.page_no for page in result.pages}   # Page.page_no: 1-based, numerazione del file
    missing = [page for page in range(start, end + 1) if page not in done]
    if missing or result.status != success:
        total = end - start + 1
        raise OcrIncompleto(
            f'OCR incompleto: elaborate {total - len(missing)} di {total} pagine '
            f'(stato Docling: {getattr(result.status, "value", result.status)}); '
            f'pagine mancanti: {", ".join(map(str, missing)) or "nessuna, ma con errori"}. '
            'Nessun testo parziale è stato salvato: selezionare un intervallo più piccolo.')


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
