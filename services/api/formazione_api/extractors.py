import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from docx import Document
from openpyxl import load_workbook
from openpyxl.cell.read_only import ReadOnlyCell
from pypdf import PdfReader

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
# - 04-istat-asi-2024-c08 e 05-istat-ra-2025: nessuna pagina segnalata (copertura massima fra
#   le pagine con poco testo 0,008). 02-dpr-547-1955 non ha testo: ha già l'avviso «priva di testo».
# Il controllo grezzo a 400 caratteri, senza immagini, segnalava anche frontespizi e pagine finali.
SCAN_MAX_CHARS = 400
SCAN_MIN_COVERAGE = 0.05
# Un'immagine sotto i 50 punti per pollice non può contenere testo leggibile: sono sfondi o
# riempimenti (03, p. 9: un'immagine di 1×1 pixel estesa a tutta la pagina).
SCAN_MIN_DPI = 50


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


def native_extract(path, kind, start, end):
    blocks, warnings = [], []

    def add(text, page, label):
        if text.strip():
            blocks.append({'id': f'b{len(blocks) + 1}', 'text': text, 'page': page, 'label': label})

    if kind == 'pdf':
        reader = PdfReader(path)
        rendered = pdfium.PdfDocument(str(path))
        try:
            for page in range(start, end + 1):
                text = reader.pages[page - 1].extract_text() or ''
                add(text, page, f'Pagina {page}')
                if not text.strip():
                    warnings.append(f'Pagina {page} priva di testo estraibile: richiede OCR o revisione.')
                elif len(text.strip()) < SCAN_MAX_CHARS:
                    selected = rendered[page - 1]
                    try:
                        if _image_coverage(selected) >= SCAN_MIN_COVERAGE:
                            warnings.append(f'Pagina {page}: probabile scansione: richiede OCR.')
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
    elif kind == 'xlsx':
        value_source = path.open('rb')
        formula_source = path.open('rb')
        values = load_workbook(value_source, read_only=True, data_only=True)
        formulas = load_workbook(formula_source, read_only=True, data_only=False)
        try:
            for sheet in formulas:
                # In read_only, values[...][coordinata] rilegge il foglio dall'inizio a ogni cella
                # (openpyxl 3.1.5, worksheet/_read_only.py, _get_cell -> _cells_by_row): su un foglio
                # reale diventa quadratico. Le due letture dello stesso XML producono le stesse righe,
                # nello stesso ordine: si scorrono in parallelo, e strict=True rende visibile un disallineamento.
                for row, value_row in zip(sheet.iter_rows(), values[sheet.title].iter_rows(), strict=True):
                    # openpyxl 3.1.5, worksheet/_read_only.py (_get_row, _cells_by_row): i buchi di una
                    # riga sono riempiti con EMPTY_CELL, che non ha né coordinate né riga. Le celle vere
                    # sono ReadOnlyCell (cell/read_only.py).
                    row = [cell for cell in row if isinstance(cell, ReadOnlyCell)]
                    computed = {cell.column: cell.value for cell in value_row if isinstance(cell, ReadOnlyCell)}
                    cells = []
                    for cell in row:
                        value = computed.get(cell.column)
                        if cell.data_type == 'f' and value is None:
                            warnings.append(f'Foglio {sheet.title}, cella {cell.coordinate}: formula senza valore calcolato disponibile.')
                            value = f'[formula senza risultato: {cell.value}]'
                        if value is not None:
                            cells.append(f'{cell.coordinate}: {value}')
                    if cells:
                        add(' | '.join(cells), None, f'Foglio {sheet.title}, riga {row[0].row}')
        finally:
            values.close()
            formulas.close()
            value_source.close()
            formula_source.close()
    else:
        add(path.read_text(encoding='utf-8-sig'), None, 'Testo')
    if not blocks:
        warnings.append('Nessun testo estraibile nel materiale selezionato.')
    # Native PDF extraction cannot establish that visual content has been read.
    return blocks, warnings, 'needs_review' if warnings else 'ready'
