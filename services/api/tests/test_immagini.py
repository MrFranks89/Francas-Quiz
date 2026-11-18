from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from formazione_api.documents import KINDS, inspect_document
from formazione_api.models import AllSelection, RangeSelection, selected_pages
from formazione_api.main import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path))


def make_jpeg(size=(20, 20), color='white') -> bytes:
    buf = BytesIO()
    img = Image.new('RGB', size, color)
    img.save(buf, format='JPEG')
    return buf.getvalue()


def make_png(size=(20, 20), color='red') -> bytes:
    buf = BytesIO()
    img = Image.new('RGB', size, color)
    img.save(buf, format='PNG')
    return buf.getvalue()


def test_kinds_riconosce_immagini():
    assert KINDS['.jpg'] == 'image'
    assert KINDS['.jpeg'] == 'image'
    assert KINDS['.png'] == 'image'


def test_magic_bytes_errati_sollevano_errore(tmp_path):
    bad_jpg = tmp_path / 'fake.jpg'
    bad_jpg.write_bytes(b'testo non jpeg')
    with pytest.raises(ValueError, match="non è un'immagine JPEG o PNG valida"):
        inspect_document(bad_jpg, 'fake.jpg')

    bad_png = tmp_path / 'fake.png'
    bad_png.write_bytes(b'\x89PNG\r\n\x1a\ncorrotto')
    with pytest.raises(ValueError, match="non è un'immagine JPEG o PNG valida"):
        inspect_document(bad_png, 'fake.png')


def test_inspect_document_su_immagini_valide(tmp_path):
    jpg_path = tmp_path / 'foto.jpg'
    jpg_path.write_bytes(make_jpeg())
    kind, pages = inspect_document(jpg_path, 'foto.jpg')
    assert kind == 'image'
    assert pages == 1

    png_path = tmp_path / 'disegno.png'
    png_path.write_bytes(make_png())
    kind, pages = inspect_document(png_path, 'disegno.png')
    assert kind == 'image'
    assert pages == 1


def test_selected_pages_rifiuta_range_su_immagine():
    with pytest.raises(ValueError, match='La selezione per pagina non si applica a questo formato'):
        selected_pages(RangeSelection(mode='range', fromPage=1, toPage=1), 1, 'image')

    start, end = selected_pages(AllSelection(mode='all'), 1, 'image')
    assert (start, end) == (1, 1)


def test_upload_e_anteprima_immagine(client):
    res = client.post('/documents', files={'file': ('foto.jpg', make_jpeg())})
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc['kind'] == 'image'
    assert doc['pageCount'] == 1
    assert doc['hasDigitalText'] is False

    prev_res = client.get(f"/documents/{doc['id']}/pages/1/preview")
    assert prev_res.status_code == 200
    assert prev_res.headers['content-type'] == 'image/png'
    assert len(prev_res.content) > 0

    bad_prev = client.get(f"/documents/{doc['id']}/pages/2/preview")
    assert bad_prev.status_code == 422


def test_estrazione_immagine_impone_docling(client):
    res = client.post('/documents', files={'file': ('appunti.png', make_png())})
    assert res.status_code == 201
    doc = res.json()

    with patch('formazione_api.docling_adapter.docling_extract') as mock_docling:
        mock_docling.return_value = (
            [{'id': 'b1', 'text': 'Testo OCR letto dalla foto', 'page': 1, 'label': 'Test'}],
            [],
            'needs_review',
        )
        ext_res = client.post(
            f"/documents/{doc['id']}/extract",
            json={'selection': {'mode': 'all'}, 'engine': 'native'},
        )
        assert ext_res.status_code == 201, ext_res.text
        data = ext_res.json()
        assert data['engine'] == 'docling'
        assert data['status'] == 'needs_review'
        assert len(data['blocks']) == 1
        assert data['blocks'][0]['text'] == 'Testo OCR letto dalla foto'
        assert mock_docling.called
