from types import SimpleNamespace
import pytest

from formazione_api.docling_adapter import _blocks
from test_api import client, upload, pdf_bytes, extraction


def test_docling_route_preserves_range(client, monkeypatch, tmp_path):
    pytest.importorskip('docling.datamodel.document')
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))
    calls = []
    item = SimpleNamespace(text='Capitolo selezionato', label='text', prov=[SimpleNamespace(page_no=2)])
    document = SimpleNamespace(iterate_items=lambda: [(item, 0)])

    class Converter:
        def convert(self, source, **kwargs):
            calls.append((source, kwargs))
            return SimpleNamespace(document=document)

    monkeypatch.setattr('formazione_api.docling_adapter._converter', lambda _: Converter())
    doc = upload(client, 'manual.pdf', pdf_bytes(3))
    response = extraction(client, doc, {'mode': 'range', 'fromPage': 2, 'toPage': 2}, 'docling')
    assert response.status_code == 201, response.text
    assert calls[0][0].name == 'source.pdf'
    assert calls[0][1]['page_range'] == (2, 2)
    assert response.json()['blocks'][0]['page'] == 2
    assert response.json()['engine'] == 'docling'


def test_docling_missing_page_and_figures_are_not_silent():
    figure = SimpleNamespace(label='picture', prov=[SimpleNamespace(page_no=4)])
    outside = SimpleNamespace(text='Non selezionato', label='text', prov=[SimpleNamespace(page_no=1)])
    document = SimpleNamespace(iterate_items=lambda: [(figure, 0), (outside, 0)])
    blocks, warnings, status = _blocks(document, 4, 5)
    assert blocks == []
    assert status == 'needs_review'
    assert any('Figura' in w for w in warnings)
    assert any('Pagina 5' in w for w in warnings)


def test_docling_invalid_artifact_directory(client, monkeypatch, tmp_path):
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path / 'missing'))
    doc = upload(client, 'manual.pdf', pdf_bytes())
    assert extraction(client, doc, {'mode': 'all'}, 'docling').status_code == 503
