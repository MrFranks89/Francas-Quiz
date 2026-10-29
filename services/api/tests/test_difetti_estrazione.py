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
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

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


# --- PDF: pagine scansionate con un'intestazione testuale ---------------------------------

INTESTAZIONE = 'COPIA TRATTA DA GURITEL - GAZZETTA UFFICIALE ON-LINE'
AVVISO_SCANSIONE = 'probabile scansione: richiede OCR'


def immagine(pixel=600):
    output = BytesIO()
    Image.new('L', (pixel, pixel), 200).save(output, 'PNG')
    output.seek(0)
    return ImageReader(output)


def pdf_misto():
    """1 scansione con intestazione · 2 pagina nativa · 3 quasi vuota con un codice piccolo
    · 4 scansione dentro un Form XObject ridotto · 5 sfondo da 1 pixel esteso a tutta la pagina
    · 6 logo piccolo dentro un Form XObject molto ridotto: segnalato solo se le coordinate del
    form non vengono riportate sulla pagina."""
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=(595, 842))
    c.drawString(72, 800, INTESTAZIONE)
    c.drawImage(immagine(), 70, 120, 450, 640)
    c.showPage()
    for riga in range(20):
        c.drawString(72, 780 - riga * 14, f'Articolo {riga}: testo nativo della norma, abbastanza lungo da contare.')
    c.showPage()
    c.drawString(72, 800, 'pagina bianca')
    c.drawImage(immagine(208), 323, 22, 55, 55)
    c.showPage()
    c.beginForm('scansione')
    c.drawImage(immagine(), 0, 0, 900, 1300)
    c.endForm()
    c.drawString(72, 800, INTESTAZIONE)
    c.saveState()
    c.translate(70, 120)
    c.scale(0.5, 0.5)
    c.doForm('scansione')
    c.restoreState()
    c.showPage()
    c.drawString(72, 800, 'Frontespizio')
    c.drawImage(immagine(1), 0, 0, 595, 842)
    c.showPage()
    c.drawString(72, 800, 'Intestazione con logo')
    c.saveState()
    c.translate(500, 780)
    c.scale(0.02, 0.02)
    c.doForm('scansione')
    c.restoreState()
    c.showPage()
    c.save()
    return output.getvalue()


def test_scansione_con_intestazione_riceve_un_avviso_per_pagina(tmp_path):
    path = tmp_path / 'misto.pdf'
    path.write_bytes(pdf_misto())
    _blocks, warnings, status = native_extract(path, 'pdf', 1, 6)
    segnalate = [w for w in warnings if AVVISO_SCANSIONE in w]
    assert segnalate == [f'Pagina 1: {AVVISO_SCANSIONE}.', f'Pagina 4: {AVVISO_SCANSIONE}.']
    assert status == 'needs_review'


def test_scansione_con_intestazione_dalla_rotta(client):  # noqa: F811
    doc = upload(client, 'misto.pdf', pdf_misto())
    response = extraction(client, doc, {'mode': 'range', 'fromPage': 3, 'toPage': 4})
    assert response.status_code == 201, response.text
    assert [w for w in response.json()['warnings'] if AVVISO_SCANSIONE in w] == [f'Pagina 4: {AVVISO_SCANSIONE}.']


def pagine_segnalate(path, inizio, fine):
    _blocks, warnings, _status = native_extract(path, 'pdf', inizio, fine)
    return [int(w.split()[1].rstrip(':')) for w in warnings if AVVISO_SCANSIONE in w]


def test_corpus_dlgs_81_scansioni_segnalate():
    # Misure sul corpus (commento in extractors.py): da 94 a 325 ogni pagina è una scansione
    # sotto l'intestazione GURITEL; 326-354 e 1-93 sono native.
    path = file_corpus('01-dlgs-81-2008')
    assert pagine_segnalate(path, 1, 354) == list(range(94, 326))


@pytest.mark.parametrize('documento,pagine,attese', [
    ('03-gu-2025-119', 96, [6, 9, 12, 16, 17, 18, 19, 20, 22, 24]),   # relazione prefettizia allegata come immagine
    ('04-istat-asi-2024-c08', 64, []),
    ('05-istat-ra-2025', 242, []),
])
def test_corpus_pagine_native_non_segnalate(documento, pagine, attese):
    path = file_corpus(documento)
    assert pagine_segnalate(path, 1, pagine) == attese
