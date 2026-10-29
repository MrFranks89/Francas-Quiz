"""Difetti dell'estrazione emersi dal corpus pubblico (tests/corpus/manifest.json).

Ogni difetto ha un test sintetico, che gira sempre, e un test sul file reale del corpus,
che si salta se il file non è presente (i file stanno fuori da Git) o non ha lo sha256 atteso.
"""
import hashlib
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pytest
from openpyxl import Workbook

from formazione_api.extractors import native_extract
from test_api import client, extraction, upload  # noqa: F401  (fixture)

CORPUS = Path(__file__).resolve().parents[3] / 'tests' / 'corpus'


def file_corpus(documento, membro=None):
    """Percorso del file del corpus, verificato contro lo sha256 del manifest; altrimenti salta."""
    manifest = json.loads((CORPUS / 'manifest.json').read_text(encoding='utf-8'))
    voce = next(v for v in manifest['documenti'] if v['id'] == documento)
    archivio = CORPUS / 'files' / documento / voce['file']
    if not archivio.exists():
        pytest.skip(f'file del corpus assente: {archivio}')
    if hashlib.sha256(archivio.read_bytes()).hexdigest() != voce['sha256']:
        pytest.skip(f'sha256 diverso dal manifest: {archivio}')
    if membro is None:
        return archivio
    estratto = CORPUS / 'files' / documento / 'estratto' / membro
    if not estratto.exists():
        pytest.skip(f'membro non estratto: {estratto}')
    # Il manifest registra l'archivio: il file estratto deve coincidere col membro dello ZIP.
    with ZipFile(archivio) as zip_file:
        if hashlib.sha256(zip_file.read(membro)).digest() != hashlib.sha256(estratto.read_bytes()).digest():
            pytest.skip(f'file estratto diverso dal membro dello ZIP: {estratto}')
    return estratto


# --- XLSX: celle vuote di riempimento in modalità read_only -------------------------------

def xlsx_sparso():
    """Righe con buchi e una riga che comincia con una cella vuota: in read_only openpyxl 3.1.5
    riempie i buchi con EMPTY_CELL (worksheet/_read_only.py, _get_row), che non ha coordinate."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Tavola'
    sheet['A1'] = 'Titolo'
    sheet['D1'] = 'Nota'
    sheet['C2'] = 42
    sheet['B3'] = '=1+2'
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_xlsx_con_celle_vuote_conserva_foglio_celle_valori_e_avviso(tmp_path):
    path = tmp_path / 'sparso.xlsx'
    path.write_bytes(xlsx_sparso())
    blocks, warnings, status = native_extract(path, 'xlsx', None, None)
    assert [(b['label'], b['text']) for b in blocks] == [
        ('Foglio Tavola, riga 1', 'A1: Titolo | D1: Nota'),
        ('Foglio Tavola, riga 2', 'C2: 42'),
        ('Foglio Tavola, riga 3', 'B3: [formula senza risultato: =1+2]'),
    ]
    assert warnings == ['Foglio Tavola, cella B3: formula senza valore calcolato disponibile.']
    assert status == 'needs_review'


def test_xlsx_con_celle_vuote_dalla_rotta(client):  # noqa: F811
    doc = upload(client, 'sparso.xlsx', xlsx_sparso())
    response = extraction(client, doc, {'mode': 'all'})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['blocks'][1]['text'] == 'C2: 42'
    assert any('cella B3' in w for w in data['warnings'])


@pytest.mark.parametrize('nome', ['C08_Tavole.xlsx', 'C08_Prospetti.xlsx', 'C08_Figure.xlsx'])
def test_xlsx_reali_del_corpus_si_leggono(nome):
    path = file_corpus('07-istat-asi-2024-d08', f'D08/{nome}')
    blocks, _warnings, _status = native_extract(path, 'xlsx', None, None)
    assert blocks
    assert all(b['label'].startswith('Foglio ') and ': ' in b['text'] for b in blocks)
