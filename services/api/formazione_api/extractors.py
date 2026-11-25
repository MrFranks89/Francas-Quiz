import re
from typing import NamedTuple

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from docx import Document
from pypdf import PdfReader

from .pagine_non_lette import avviso_pagina_bianca, avviso_scansione

HEADING_PATTERN = re.compile(
    r'^(?:(?:\d+(?:\.\d+)*|[A-Z]\.|\b(?:Capitolo|Sezione|Parte|Paragrafo)\s+\d+)\b[^\n]{2,80})',
    re.MULTILINE | re.IGNORECASE,
)

# Criterio «probabile scansione», misurato sul corpus pubblico (tests/corpus/manifest.json, sha256
# verificati il 2026-10-29): una pagina con meno di SCAN_MAX_CHARS caratteri nativi e immagini
# leggibili che coprono almeno SCAN_MIN_COVERAGE della pagina.
# - 01-dlgs-81-2008: le scansioni 94-325 hanno 78-148 caratteri (la sola intestazione GURITEL) e
#   copertura da 0,075 (p. 305, scansione quasi vuota ritagliata sul contenuto) a 1: tutte segnalate.
#   Le pagine native 1-93 e 326-354 non sono segnalate; le quasi vuote (p. 3, 52 caratteri;
#   p. 354, 78 caratteri) non hanno immagini.
# - 03-gu-2025-119: segnalate solo 6, 9, 12, 16-20, 22, 24, relazione prefettizia allegata come
#   immagine (verificato a vista), dentro Form XObject, copertura da 0,43. Le pagine quasi
#   vuote 94 («pagina bianca», 55 caratteri) e 96 (25) hanno solo i quattro codici a piè di
#   pagina: copertura 0,024.
# - 04-istat-asi-2024-c08: nessuna pagina segnalata (copertura massima fra le pagine con poco
#   testo 0,008; p. 64 non ha né testo né oggetti).
# - 05-istat-ra-2025: segnalate solo le copertine 1 e 3, senza testo nativo: titolo in tracciati
#   vettoriali e una foto (copertura 0,109, inchiostro 0,10 e 0,028). È contenuto visibile che
#   l'estrazione nativa non legge. Le pagine 162, 206 e 241 non hanno né testo né oggetti.
# - 02-dpr-547-1955 non ha testo nativo: segnalate tutte le 48 pagine, tranne le bianche 2 e 47.
# Le pagine senza nessun testo nativo passano dallo stesso criterio (prima ricevevano solo
# l'avviso generico, che non blocca: test_scansioni_senza_testo.py).
# Il controllo grezzo a 400 caratteri, senza immagini, segnalava anche frontespizi e pagine finali.
SCAN_MAX_CHARS = 400
# Versione dichiarata dell'estrazione nativa: entra nella chiave della cache delle misure
# (measurement/corsa.py, estrai_con_cache). Cambiarla quando cambiano testo o avvisi prodotti.
VERSIONE = '2026-10-30-scansioni-senza-testo'
SCAN_MIN_COVERAGE = 0.05
# Un'immagine sotto i 50 punti per pollice non può contenere testo leggibile: sono sfondi o
# riempimenti (03, p. 9: un'immagine di 1×1 pixel estesa a tutta la pagina).
SCAN_MIN_DPI = 50

# Inchiostro di una scansione: frazione dei pixel con grigio sotto SOGLIA_GRIGIO, nella zona della
# pagina che esclude MARGINE_INCHIOSTRO per lato, sulla pagina renderizzata come le anteprime
# (routes.py) dopo aver tolto gli oggetti di testo nativo di primo livello (intestazione GURITEL).
# - Il margine esclude i difetti dei bordi della scansione: in 02-dpr-547-1955 la pagina bianca 2,
#   misurata intera, ha 0,0081 di inchiostro (bordo nero a destra, ombra in basso), più della
#   p. 48 «PREZZO L. 300» (0,0023) e di 01 p. 98 (0,0043).
# - La filigrana diagonale di 01 sta in un Form XObject e non si rimuove, ma è grigio chiaro: sopra
#   la soglia di grigio, non conta (01 p. 98 senza testo nativo: 0,0019 di inchiostro, tutto modulo).
# Misure con margine del 10% (docs/VERIFICHE.md, 30 ottobre 2026), su 02 pp. 1-48 e 01 pp. 94-325:
# - bianche, 02 p. 2: 0; 02 p. 47: 0,00034 (una piega verticale a sinistra, nella zona misurata);
# - 02 p. 48, una sola riga: 0,00125; 01 p. 98, il modulo più vuoto: 0,0019; 01 p. 105: 0,0034;
# - le altre di 02: da 0,068 (frontespizio) in su; le altre di 01: da 0,005 in su.
# SOGLIA_PAGINA_BIANCA sta a metà, in scala logaritmica, fra 02 p. 47 e 02 p. 48: 1,8 volte la
# pagina bianca più sporca, metà della pagina con una riga. L'errore pericoloso è dichiarare bianca
# una pagina con contenuto (che verrebbe ignorata): sotto la soglia sta meno di mezza riga isolata.
# L'errore opposto, una bianca più sporca della p. 47, lascia il blocco di prima.
SOGLIA_GRIGIO = 128
MARGINE_INCHIOSTRO = 0.10
SOGLIA_PAGINA_BIANCA = 0.0006


class Scansione(NamedTuple):
    testo: str          # testo nativo della pagina (intestazione, filigrana), anche vuoto
    inchiostro: float   # vedi SOGLIA_PAGINA_BIANCA


def _inchiostro(page):
    """Frazione di pixel scuri nella zona centrale della pagina, senza il testo nativo di primo
    livello. Modifica la pagina in memoria: chiamarla per ultima, il documento non si salva."""
    for oggetto in list(page.get_objects(max_depth=1)):
        if oggetto.type == pdfium_c.FPDF_PAGEOBJ_TEXT:
            page.remove_obj(oggetto)
    page.gen_content()
    width, height = page.get_size()
    # Stessa scala delle anteprime (routes.py, page_preview).
    image = page.render(scale=min(1.5, 1400 / max(width, height)), grayscale=True).to_pil().convert('L')
    dx, dy = int(image.width * MARGINE_INCHIOSTRO), int(image.height * MARGINE_INCHIOSTRO)
    centro = image.crop((dx, dy, image.width - dx, image.height - dy))
    return sum(centro.histogram()[:SOGLIA_GRIGIO]) / (centro.width * centro.height)


def _image_coverage(page):
    """Frazione della pagina coperta da immagini con risoluzione da testo (somma delle aree, max 1)."""
    left, bottom, right, top = page.get_bbox()
    covered = 0.0
    for image in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE]):
        # pypdfium2 5.14 PdfObject.get_bounds: per un oggetto annidato in un Form XObject i limiti
        # sono nello spazio del form, non della pagina (verificato in test_difetti_estrazione,
        # pagine 4 e 6 di pdf_misto): si applicano le matrici dei form che lo contengono.
        bounds = image.get_bounds()
        container = image.container
        while container is not None:
            bounds = container.get_matrix().on_rect(*bounds)
            container = container.container
        x0, y0, x1, y1 = bounds
        width_px, height_px = image.get_px_size()
        if x1 <= x0 or y1 <= y0 or min(width_px / (x1 - x0), height_px / (y1 - y0)) * 72 < SCAN_MIN_DPI:
            continue
        covered += max(0.0, min(x1, right) - max(x0, left)) * max(0.0, min(y1, top) - max(y0, bottom))
    return min(1.0, covered / ((right - left) * (top - bottom)))


def scansioni(path, start, end):
    """{pagina: Scansione} delle pagine PDF che sono immagini: meno di SCAN_MAX_CHARS caratteri
    nativi, anche zero, e copertura di immagini almeno SCAN_MIN_COVERAGE. Serve all'OCR per sapere
    dove deve aver letto qualcosa oltre al testo già presente (docling_adapter.py)."""
    reader = PdfReader(path)
    rendered = pdfium.PdfDocument(str(path))
    risultato = {}
    try:
        for page in range(start, end + 1):
            text = reader.pages[page - 1].extract_text() or ''
            if len(text.strip()) >= SCAN_MAX_CHARS:
                continue
            selected = rendered[page - 1]
            try:
                if _image_coverage(selected) >= SCAN_MIN_COVERAGE:
                    risultato[page] = Scansione(text, _inchiostro(selected))
            finally:
                selected.close()
    finally:
        rendered.close()
    return risultato


def native_extract(path, kind, start, end, *, pages=None):
    blocks, warnings = [], []
    current_section = None

    def detect_heading(text: str):
        if not text:
            return None
        match = HEADING_PATTERN.search(text)
        if match:
            return match.group(0).strip()
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if lines:
            first = lines[0]
            if 2 <= len(first) <= 80 and not first.endswith(('.', ':', ';', ',')):
                if len(lines) == 1 or first.isupper() or text.startswith(first + '\n\n'):
                    return first
        return None

    def add(text, page, label):
        nonlocal current_section
        if text.strip():
            found_heading = detect_heading(text)
            if found_heading:
                current_section = found_heading
            block = {
                'id': f'b{len(blocks) + 1}',
                'text': text,
                'page': page,
                'label': label,
                'kind': 'text',
            }
            if current_section is not None:
                block['section'] = current_section
            blocks.append(block)

    if kind == 'pdf':
        reader = PdfReader(path)
        rendered = pdfium.PdfDocument(str(path))
        try:
            page_iter = pages if pages is not None else range(start, end + 1)
            for page in page_iter:
                text = reader.pages[page - 1].extract_text() or ''
                add(text, page, f'Pagina {page}')
                if len(text.strip()) >= SCAN_MAX_CHARS:
                    continue
                # Anche la pagina senza nessun testo nativo passa da qui, come in scansioni(): con
                # il solo avviso generico, che non blocca, una scansione senza intestazione in un PDF
                # misto usciva dal corso in silenzio (test_scansioni_senza_testo.py).
                selected = rendered[page - 1]
                try:
                    if _image_coverage(selected) >= SCAN_MIN_COVERAGE:
                        bianca = _inchiostro(selected) < SOGLIA_PAGINA_BIANCA
                        warnings.append(avviso_pagina_bianca(page) if bianca else avviso_scansione(page))
                    elif not text.strip():
                        # Senza testo e senza immagini da testo: non c'è una scansione da leggere con
                        # l'OCR. Resta l'avviso generico, che non blocca: è la pagina vuota per
                        # costruzione (04 p. 64, 05 pp. 162, 206, 241: nessun oggetto). Non si dichiara
                        # «pagina bianca» perché l'inchiostro non è stato misurato: la pagina può avere
                        # grafica vettoriale, anche testo convertito in tracciati, che resta da rivedere.
                        warnings.append(f'Pagina {page} priva di testo estraibile: richiede OCR o revisione.')
                finally:
                    selected.close()
        finally:
            rendered.close()
        warnings.append('Estrazione nativa: immagini e contenuto visivo non interpretati; verificare tabelle e figure.')
    elif kind == 'docx':
        document = Document(path)
        # iter_inner_content preserves paragraph/table order in python-docx.
        for item in document.iter_inner_content():
            if hasattr(item, 'rows'):
                add('\n'.join('\t'.join(cell.text for cell in row.cells) for row in item.rows), None, 'Tabella')
            else:
                add(item.text, None, 'Paragrafo')
        if document.inline_shapes:
            warnings.append('Il documento contiene immagini non interpretate: revisione necessaria.')
    else:
        add(path.read_text(encoding='utf-8-sig'), None, 'Testo')
    if not blocks:
        warnings.append('Nessun testo estraibile nel materiale selezionato.')
    # Native PDF extraction cannot establish that visual content has been read.
    return blocks, warnings, 'needs_review' if warnings else 'ready'
