from docx import Document
from openpyxl import load_workbook
from openpyxl.cell.read_only import ReadOnlyCell
from pypdf import PdfReader


def native_extract(path, kind, start, end):
    blocks, warnings = [], []

    def add(text, page, label):
        if text.strip():
            blocks.append({'id': f'b{len(blocks) + 1}', 'text': text, 'page': page, 'label': label})

    if kind == 'pdf':
        reader = PdfReader(path)
        for page in range(start, end + 1):
            text = reader.pages[page - 1].extract_text() or ''
            add(text, page, f'Pagina {page}')
            if not text.strip():
                warnings.append(f'Pagina {page} priva di testo estraibile: richiede OCR o revisione.')
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
