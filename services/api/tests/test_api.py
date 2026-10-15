from io import BytesIO

import pytest
from docx import Document
from fastapi.testclient import TestClient
from openpyxl import Workbook
from reportlab.pdfgen import canvas

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


def test_xlsx_preserves_coordinates_and_warns_formula(client):
    output = BytesIO()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Vendite'
    sheet.append(['Prodotto', 'Totale'])
    sheet.append(['Esempio', '=1+2'])
    workbook.save(output)
    doc = upload(client, 'data.xlsx', output.getvalue())
    assert doc['sheets'] == ['Vendite']
    result = extraction(client, doc, {'mode': 'all'}).json()
    assert result['status'] == 'needs_review'
    assert 'A1: Prodotto' in result['blocks'][0]['text']
    assert 'Vendite' in result['blocks'][1]['label']
    assert any('B2' in warning for warning in result['warnings'])


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
