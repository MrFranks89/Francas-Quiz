from types import SimpleNamespace
import pytest

from formazione_api.docling_adapter import _blocks
from test_api import client, upload, pdf_bytes, extraction


def test_docling_route_preserves_range(client, monkeypatch, tmp_path):
    pytest.importorskip('docling.datamodel.document')
    from docling.datamodel.base_models import ConversionStatus
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))
    calls = []
    item = SimpleNamespace(text='Capitolo selezionato', label='text', prov=[SimpleNamespace(page_no=2)])
    document = SimpleNamespace(iterate_items=lambda: [(item, 0)])

    class Converter:
        def convert(self, source, **kwargs):
            calls.append((source, kwargs))
            return SimpleNamespace(document=document, status=ConversionStatus.SUCCESS,
                                   pages=[SimpleNamespace(page_no=2)], errors=[])

    monkeypatch.setattr('formazione_api.docling_adapter._converter', lambda *_: Converter())
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


def test_docling_uses_default_cache_directory(monkeypatch, tmp_path):
    pytest.importorskip('docling.datamodel.document')
    from docling.datamodel.base_models import ConversionStatus
    from formazione_api.docling_adapter import docling_extract
    monkeypatch.delenv('DOCLING_ARTIFACTS_PATH', raising=False)
    fake_default = tmp_path / 'default_docling'
    fake_default.mkdir()
    monkeypatch.setattr('formazione_api.docling_adapter.DEFAULT_DOCLING_PATH', fake_default)

    converter_calls = []
    class Converter:
        def convert(self, source, **kwargs):
            return SimpleNamespace(document=SimpleNamespace(iterate_items=lambda: []),
                                   status=ConversionStatus.SUCCESS,
                                   pages=[SimpleNamespace(page_no=1)], errors=[])

    def fake_converter(artifacts, pages=1):
        converter_calls.append(artifacts)
        return Converter()

    monkeypatch.setattr('formazione_api.docling_adapter._converter', fake_converter)
    pdf = tmp_path / 'source.pdf'
    pdf.write_bytes(pdf_bytes(1))
    docling_extract(pdf, 'pdf', 1, 1)
    assert converter_calls == [fake_default]


# --- Estrazione OCR parziale: mai uno stato «pronto» ---------------------------------------

def risultato(status, pagine, document):
    """Forma di docling ConversionResult (datamodel/document.py, 2.138): status, pages, errors, document."""
    return SimpleNamespace(status=status, pages=[SimpleNamespace(page_no=p) for p in pagine],
                           errors=[], document=document)


def converter_fisso(result):
    class Converter:
        def convert(self, source, **kwargs):
            return result
    return Converter()


def test_docling_ocr_troncato_e_un_errore_con_le_pagine_mancanti(client, monkeypatch, tmp_path):
    status = pytest.importorskip('docling.datamodel.base_models').ConversionStatus
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))
    item = SimpleNamespace(text='Solo la prima pagina', label='text', prov=[SimpleNamespace(page_no=2)])
    document = SimpleNamespace(iterate_items=lambda: [(item, 0)])
    # Docling 2.138, standard_pdf_pipeline._integrate_results: a tempo scaduto restituisce
    # PARTIAL_SUCCESS con le sole pagine completate, e convert() non solleva.
    monkeypatch.setattr('formazione_api.docling_adapter._converter',
                        lambda *_: converter_fisso(risultato(status.PARTIAL_SUCCESS, [2], document)))
    doc = upload(client, 'manual.pdf', pdf_bytes(5))
    response = extraction(client, doc, {'mode': 'range', 'fromPage': 2, 'toPage': 5}, 'docling')
    assert response.status_code == 503, response.text
    detail = response.json()['detail']
    assert 'OCR incompleto' in detail and '3, 4, 5' in detail and '1 di 4' in detail


def test_docling_pagina_assente_anche_con_successo_dichiarato(monkeypatch, tmp_path):
    status = pytest.importorskip('docling.datamodel.base_models').ConversionStatus
    from formazione_api.docling_adapter import OcrIncompleto, docling_extract
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))
    document = SimpleNamespace(iterate_items=lambda: [])
    monkeypatch.setattr('formazione_api.docling_adapter._converter',
                        lambda *_: converter_fisso(risultato(status.SUCCESS, [1, 3], document)))
    path = tmp_path / 'source'
    path.write_bytes(pdf_bytes(3))
    with pytest.raises(OcrIncompleto, match='pagine mancanti: 2'):
        docling_extract(path, 'pdf', 1, 3)


def test_docling_limite_di_tempo_proporzionale_alle_pagine(tmp_path):
    pytest.importorskip('docling.document_converter')
    from docling.datamodel.base_models import InputFormat
    from formazione_api.docling_adapter import SECONDS_PER_PAGE, _converter
    limite = lambda pagine: _converter(tmp_path, pagine).format_to_options[InputFormat.PDF].pipeline_options.document_timeout  # noqa: E731
    assert limite(1) == 120
    assert limite(50) == 50 * SECONDS_PER_PAGE
