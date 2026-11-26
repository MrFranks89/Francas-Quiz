"""Optional, offline PDF extraction. Models must be provisioned explicitly."""
import math
import os
import re
from io import BytesIO
from pathlib import Path

from .extractors import SOGLIA_PAGINA_BIANCA, scansioni
from .pagine_non_lette import avviso_ocr_vuoto, avviso_pagina_bianca, pagine_bianche

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DOCLING_PATH = REPO_ROOT / '.cache' / 'docling'
# Percorso standard della cache di Docling (download ufficiale dei modelli),
# usato come ripiego quando la env non è impostata e la cache di repo è assente.
USER_DOCLING_PATH = Path.home() / '.cache' / 'docling' / 'models'
DEFAULT_HF_HOME = REPO_ROOT / '.cache' / 'huggingface'

if 'HF_HOME' not in os.environ and DEFAULT_HF_HOME.is_dir():
    os.environ['HF_HOME'] = str(DEFAULT_HF_HOME)
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')

# Limite di tempo dell'OCR, proporzionale alle pagine selezionate. Misura reale sul corpus
# (docs/MISURE.md): 5 pagine di 02-dpr-547-1955 in 134 s, circa 27 s per pagina su CPU. Con il
# limite fisso di 120 s Docling consegnava 13 pagine su 50 (01, pp. 94-143) e 0 su 48 (02).
# 60 s per pagina è poco più del doppio della misura; il minimo copre il carico iniziale.
SECONDS_PER_PAGE = 60
# Versione dichiarata dell'adattatore, nella chiave della cache delle misure (measurement/corsa.py).
# Cambiarla quando cambiano configurazione di Docling, testo o avvisi prodotti.
VERSIONE = '2026-11-18-immagini'
MIN_TIMEOUT = 120

# Caratteri utili minimi che l'OCR deve leggere su una pagina «probabile scansione» oltre al suo
# testo nativo. Misura (docs/VERIFICHE.md, OCR a pagina intera del 29-30 ottobre 2026): prima della
# correzione 0 su tutte le 50 pagine di 01 pp. 94-143 (sola filigrana); dopo, minimo 72 (01 p. 98,
# pagina corta reale) e 262 (02 p. 46); sotto soglia solo le scansioni bianche di 02 (pp. 2, 47: 0;
# p. 48 «PREZZO L. 300»: 10).
SOGLIA_CARATTERI_UTILI = 50
# Una scansione con poco inchiostro può contenere meno di 50 caratteri (02 p. 48: «PREZZO L. 300»,
# 10 caratteri utili, inchiostro 0,00125). La soglia scende in proporzione all'inchiostro
# (extractors._inchiostro). Densità misurate, caratteri utili per unità di inchiostro (OCR
# reale in var/misure/estrazioni, docs/VERIFICHE.md): 02 da 2.297 (p. 46) e 4.351 (p. 1,
# frontespizio) a circa 42.000; 02 p. 48 7.981; 01 pp. 94-143 da 20.911 a 51.388. DENSITA_MINIMA è
# 2,3 volte sotto la più bassa: le pagine piene (inchiostro sopra 0,05) restano a 50. Il minimo di
# 5 caratteri vale per le pagine quasi vuote: la 48 ne legge il doppio, una pagina con contenuto
# su cui l'OCR non legge niente resta bloccata. Le pagine bianche non arrivano qui
# (extractors.SOGLIA_PAGINA_BIANCA).
DENSITA_MINIMA = 1000
MINIMO_CARATTERI_UTILI = 5


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


class _PercorsoInMemoria:
    def __init__(self, data: bytes):
        self._data = data

    def read_bytes(self) -> bytes:
        return self._data


def _pdf_da_immagine(path):
    from PIL import Image, ImageOps
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert('RGB')
        buf = BytesIO()
        img.save(buf, format='PDF', resolution=200.0)
        return _PercorsoInMemoria(buf.getvalue())


def resolve_artifacts_path():
    configured = os.environ.get('DOCLING_ARTIFACTS_PATH')
    if configured:
        if not Path(configured).is_dir():
            raise RuntimeError('Configurare DOCLING_ARTIFACTS_PATH con i modelli Docling già scaricati localmente.')
        return Path(configured)
    if DEFAULT_DOCLING_PATH.is_dir():
        return DEFAULT_DOCLING_PATH
    if USER_DOCLING_PATH.is_dir():
        return USER_DOCLING_PATH
    raise RuntimeError('Configurare DOCLING_ARTIFACTS_PATH con i modelli Docling già scaricati localmente.')


def docling_extract(path, kind, start, end):
    if kind not in ('pdf', 'image'):
        raise ValueError('Docling è disponibile in questa versione solo per PDF e immagini.')
    if kind == 'image':
        path = _pdf_da_immagine(path)
        start = 1
        end = 1
    artifacts_path = resolve_artifacts_path()
    try:
        from docling.datamodel.document import DocumentStream
        from docling.datamodel.base_models import ConversionStatus
        converter = _converter(artifacts_path, end - start + 1)
        # Source: installed Docling DocumentConverter.convert(page_range: PageRange).
        # DocumentStream supplies the real format; storage filenames deliberately have no extension.
        result = converter.convert(DocumentStream(name='source.pdf', stream=BytesIO(path.read_bytes())),
                                   page_range=(start, end), raises_on_error=True)
    except (FileNotFoundError, ImportError) as error:
        raise RuntimeError('Modelli o dipendenze Docling mancanti: completare il provisioning offline.') from error
    _require_all_pages(result, start, end, ConversionStatus.SUCCESS)
    blocks, warnings, status = _blocks(result.document, start, end)
    if kind == 'image':
        if not blocks:
            warnings = ['Nessun testo leggibile nella foto: controllare inquadratura e illuminazione.']
        return blocks, warnings, status
    avvisi = _scansioni_non_lette(path, start, end, blocks)
    # La pagina bianca senza testo riceveva anche l'avviso generico di _blocks: lo stesso caso detto
    # due volte, e «revisione necessaria» contraddiceva «ignorata». Sulle altre pagine resta.
    ridondanti = {avviso_senza_testo(page) for page in pagine_bianche(avvisi)}
    return blocks, avvisi + [w for w in warnings if w not in ridondanti], status


def avviso_senza_testo(page):
    """Pagina su cui l'OCR non ha prodotto nessun blocco di testo (_blocks)."""
    return f'Pagina {page} priva di testo estratto: revisione necessaria.'


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
    avvisi = []
    for page, scansione in scansioni(path, start, end).items():
        if scansione.inchiostro < SOGLIA_PAGINA_BIANCA:
            avvisi.append(avviso_pagina_bianca(page))
        elif caratteri_utili(letto.get(page, ''), scansione.testo) < caratteri_richiesti(scansione.inchiostro):
            avvisi.append(avviso_ocr_vuoto(page))
    return avvisi


def caratteri_richiesti(inchiostro):
    """Caratteri utili che l'OCR deve leggere su una scansione con questo inchiostro: proporzionali
    all'inchiostro, fra MINIMO_CARATTERI_UTILI e SOGLIA_CARATTERI_UTILI. Si blocca solo quando c'è
    contenuto visibile che l'OCR non ha letto: una riga isolata letta per intero non è un fallimento."""
    return min(SOGLIA_CARATTERI_UTILI, max(MINIMO_CARATTERI_UTILI, math.ceil(inchiostro * DENSITA_MINIMA)))


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
    current_section = None
    current_level = 1
    for item, level in document.iterate_items():
        pages = {p.page_no for p in getattr(item, 'prov', []) if start <= p.page_no <= end}
        if not pages:
            continue
        label = str(getattr(item, 'label', 'Contenuto'))
        raw_label = label.lower()
        if 'picture' in raw_label:
            warnings.append(f'Figura a pagina {min(pages)}: contenuto visivo da verificare.')
            continue
        text = getattr(item, 'text', None)
        if text is None and hasattr(item, 'export_to_markdown'):
            text = item.export_to_markdown(doc=document)
        if text and text.strip():
            if 'title' in raw_label or 'header' in raw_label:
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                clean_title = lines[0] if lines else text.strip()
                current_section = clean_title
                current_level = level if level is not None else 1
            for page in sorted(pages):
                covered.add(page)
                block = {
                    'id': f'b{len(blocks)+1}',
                    'text': text,
                    'page': page,
                    'label': f'Pagina {page} — {label}',
                    'kind': raw_label,
                    'level': level,
                }
                if current_section is not None:
                    block['section'] = current_section
                blocks.append(block)
    for page in range(start, end+1):
        if page not in covered:
            warnings.append(avviso_senza_testo(page))
    warnings.append('OCR e tabelle ricostruiti automaticamente: verificare accuratezza prima della pubblicazione.')
    return blocks, warnings, 'needs_review'
