from io import BytesIO
from zipfile import ZipFile

import pytest
from docx import Document
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from formazione_api.documents import MESSAGGIO_FOGLI
from formazione_api.main import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path))


def pdf_bytes(count=2, blank=False):
    output = BytesIO()
    writer = canvas.Canvas(output)
    for page in range(1, count + 1):
        if not blank:
            writer.drawString(72, 720, f'Unique content page {page}.')
        writer.showPage()
    writer.save()
    return output.getvalue()


def upload(client, name, data):
    response = client.post('/documents', files={'file': (name, data)})
    assert response.status_code == 201, response.text
    return response.json()


def extraction(client, doc, selection, engine='native'):
    return client.post(f"/documents/{doc['id']}/extract", json={'selection': selection, 'engine': engine})


def test_pdf_range_preserves_original_pages(client):
    doc = upload(client, 'manual.pdf', pdf_bytes(1000))
    assert doc['pageCount'] == 1000
    result = extraction(client, doc, {'mode': 'range', 'fromPage': 201, 'toPage': 300})
    assert result.status_code == 201
    data = result.json()
    assert data['pageCount'] == 100
    assert [block['page'] for block in data['blocks']] == list(range(201, 301))
    assert 'page 201.' in data['blocks'][0]['text']
    assert 'page 300.' in data['blocks'][-1]['text']
    assert data['status'] == 'needs_review'


@pytest.mark.parametrize('start,end', [(0, 1), (2, 1), (1, 3), (True, 2), ('1', 2), (1.0, 2)])
def test_invalid_ranges(client, start, end):
    doc = upload(client, 'manual.pdf', pdf_bytes())
    assert extraction(client, doc, {'mode': 'range', 'fromPage': start, 'toPage': end}).status_code == 422


@pytest.mark.parametrize('name,data', [('fake.pdf', b'not pdf'), ('fake.docx', b'not zip'), ('fake.xlsx', b'not zip'), ('binary.txt', b'\0hello'), ('bad.txt', b'\xff'), ('script.exe', b'hello'), ('empty.txt', b'')])
def test_bad_upload(client, name, data):
    assert client.post('/documents', files={'file': (name, data)}).status_code == 422


def test_path_traversal_sanitized_and_persistence(tmp_path):
    client = TestClient(create_app(tmp_path))
    doc = upload(client, '../../outside.txt', b'hello world')
    assert doc['name'] == 'outside.txt'
    result = extraction(client, doc, {'mode': 'all'}).json()
    second = TestClient(create_app(tmp_path))
    assert second.get(f"/extractions/{result['id']}").json() == result
    assert not (tmp_path.parent / 'outside.txt').exists()
    assert second.get('/extractions/invalid-id').status_code == 404


def test_blank_pdf_and_preview(client):
    doc = upload(client, 'scan.pdf', pdf_bytes(blank=True))
    result = extraction(client, doc, {'mode': 'all'}).json()
    assert result['status'] == 'needs_review'
    assert not result['blocks']
    assert any('Pagina 1' in item for item in result['warnings'])
    preview = client.get(f"/documents/{doc['id']}/pages/2/preview")
    assert preview.status_code == 200
    assert preview.content.startswith(b'\x89PNG')
    assert preview.headers['x-original-page'] == '2'
    assert client.get(f"/documents/{doc['id']}/pages/3/preview").status_code == 422


def test_docx(client):
    output = BytesIO()
    document = Document()
    document.add_paragraph('Introduzione')
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'Codice'
    table.cell(0, 1).text = 'Descrizione'
    document.save(output)
    doc = upload(client, 'notes.docx', output.getvalue())
    result = extraction(client, doc, {'mode': 'all'}).json()
    assert result['blocks'][0]['text'] == 'Introduzione'
    assert result['blocks'][1]['label'] == 'Tabella'
    assert extraction(client, doc, {'mode': 'range', 'fromPage': 1, 'toPage': 1}).status_code == 422


def xlsx_minimo():
    """Un XLSX ridotto alle parti che lo identificano (OOXML, ECMA-376 parte 2: [Content_Types].xml
    e la parte principale xl/workbook.xml): basta al controllo sul contenuto, senza openpyxl."""
    output = BytesIO()
    with ZipFile(output, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
    return output.getvalue()


# Decisione del 29 ottobre 2026 (docs/decisions/004-niente-fogli-di-calcolo.md): i fogli di
# calcolo non sono una fonte. Il rifiuto guarda il contenuto, non solo l'estensione.
@pytest.mark.parametrize('name,data', [
    ('dati.xlsx', xlsx_minimo()),
    ('DATI.XLSX', xlsx_minimo()),
    ('dati.csv', b'prodotto,totale\nesempio,3\n'),
    ('dati.txt', xlsx_minimo()),
    ('dati.md', xlsx_minimo()),
    ('dati.docx', xlsx_minimo()),
    ('dati.pdf', xlsx_minimo()),
], ids=lambda value: value if isinstance(value, str) else '')
def test_fogli_di_calcolo_rifiutati(tmp_path, name, data):
    client = TestClient(create_app(tmp_path))
    response = client.post('/documents', files={'file': (name, data)})
    assert response.status_code == 422
    assert response.json()['detail'] == MESSAGGIO_FOGLI
    assert not list(tmp_path.glob('*.source'))
    assert not list(tmp_path.glob('*.document.json'))


def docx_bytes():
    output = BytesIO()
    document = Document()
    document.add_paragraph('Introduzione')
    document.save(output)
    return output.getvalue()


@pytest.mark.parametrize('name,data,kind', [
    ('manuale.pdf', pdf_bytes(), 'pdf'),
    ('note.docx', docx_bytes(), 'docx'),
    ('note.txt', b'Testo semplice', 'text'),
    ('note.md', b'# Titolo\n\nTesto', 'text'),
], ids=lambda value: value if isinstance(value, str) else '')
def test_formati_ammessi_si_caricano_e_si_estraggono(client, name, data, kind):
    doc = upload(client, name, data)
    assert doc['kind'] == kind
    assert 'sheets' not in doc
    assert extraction(client, doc, {'mode': 'all'}).status_code == 201


@pytest.mark.parametrize('record', [
    {'name': 'dati.xlsx', 'kind': 'xlsx', 'pageCount': None, 'sheets': ['Vendite']},
    {'name': 'dati.csv', 'kind': 'text', 'pageCount': None, 'sheets': []},
])
@pytest.mark.parametrize('engine', ['native', 'docling'])
def test_foglio_salvato_prima_della_decisione_rifiutato_alla_riapertura(tmp_path, record, engine):
    client = TestClient(create_app(tmp_path))
    store = client.app.state.store
    identifier = store.new_id()
    store.path(identifier, 'source').write_bytes(xlsx_minimo() if record['kind'] == 'xlsx' else b'a,b\n1,2\n')
    store.save(identifier, 'document.json', {'id': identifier, **record})
    response = extraction(client, {'id': identifier}, {'mode': 'all'}, engine)
    assert response.status_code == 422
    assert response.json()['detail'] == MESSAGGIO_FOGLI
    assert client.get(f'/documents/{identifier}/pages/1/preview').status_code == 422


def test_upload_limit(client, monkeypatch):
    monkeypatch.setattr('formazione_api.routes.MAX_BYTES', 5)
    assert client.post('/documents', files={'file': ('notes.txt', b'123456')}).status_code == 413


def test_docling_requires_explicit_local_artifacts(client, monkeypatch):
    monkeypatch.delenv('DOCLING_ARTIFACTS_PATH', raising=False)
    doc = upload(client, 'manual.pdf', pdf_bytes())
    response = extraction(client, doc, {'mode': 'all'}, 'docling')
    assert response.status_code == 503
    assert 'DOCLING_ARTIFACTS_PATH' in response.json()['detail']


def test_health_and_cors(client):
    assert client.get('/health').json()['mode'] == 'local-single-operator'
    response = client.options('/documents', headers={'Origin': 'http://localhost:8081', 'Access-Control-Request-Method': 'POST'})
    assert response.headers['access-control-allow-origin'] == 'http://localhost:8081'
    edit_preflight = client.options('/drafts/example', headers={'Origin': 'http://localhost:8081', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type'})
    assert edit_preflight.status_code == 200
    assert 'PUT' in edit_preflight.headers['access-control-allow-methods']
