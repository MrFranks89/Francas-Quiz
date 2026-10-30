"""Pagine scansionate senza nessun testo nativo, nell'estrazione nativa.

Prima: una pagina senza testo nativo riceveva solo l'avviso generico «Pagina N priva di testo
estraibile», che non blocca (pagine_non_lette.py). In un PDF misto, pagine native più qualche
scansione senza intestazione GURITEL, quelle scansioni uscivano dal corso in silenzio. Ora passano
dallo stesso criterio delle scansioni con intestazione: copertura delle immagini e inchiostro.
La scansione con contenuto blocca, la scansione bianca no, la pagina senza immagini né testo no.
"""
from io import BytesIO

from reportlab.pdfgen import canvas

from formazione_api.pagine_non_lette import avviso_pagina_bianca, avviso_scansione, pagine_bianche, pagine_non_lette
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_difetti_estrazione import file_corpus
from test_generation_http import Provider
from test_pagine_bianche import scansione

AVVISO_VUOTA = 'Pagina 4 priva di testo estraibile: richiede OCR o revisione.'


def pdf_scansioni_senza_testo(*pagine):
    """Predefinito: 1 nativa · 2 scansione con contenuto, nessun testo nativo · 3 scansione bianca,
    nessun testo nativo · 4 pagina vuota per costruzione: né immagini né testo."""
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=(595, 842))
    for pagina in pagine or ('nativa', 'illeggibile', 'bianca', 'vuota'):
        if pagina == 'nativa':
            for riga in range(20):
                c.drawString(72, 780 - riga * 14, f'Articolo {riga}: testo nativo della norma, abbastanza lungo da contare.')
        elif pagina != 'vuota':
            c.drawImage(scansione(None if pagina == 'bianca' else pagina), 0, 0, 595, 842)
        c.showPage()
    c.save()
    return output.getvalue()


def test_la_scansione_senza_testo_nativo_blocca_la_bianca_no(tmp_path):
    from formazione_api.extractors import native_extract
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni_senza_testo())
    _blocks, warnings, status = native_extract(path, 'pdf', 1, 4)
    assert avviso_scansione(2) in warnings
    assert avviso_pagina_bianca(3) in warnings
    assert pagine_non_lette(warnings) == [2]
    assert pagine_bianche(warnings) == [3]
    # Né immagini né testo: niente da leggere, resta l'avviso generico, che non blocca.
    assert AVVISO_VUOTA in warnings
    # Un solo avviso per pagina: l'avviso generico non si aggiunge alle pagine 2 e 3.
    assert [w for w in warnings if w.startswith(('Pagina 2', 'Pagina 3'))] == [avviso_scansione(2),
                                                                                  avviso_pagina_bianca(3)]
    assert status == 'needs_review'


def test_la_generazione_rifiuta_la_scansione_senza_testo(client):  # noqa: F811
    client.app.state.generation_provider = Provider()
    doc = upload(client, 'misto.pdf', pdf_scansioni_senza_testo())
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'acknowledgeWarnings': True})
    assert risposta.status_code == 422, risposta.text
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'unread_pages'
    assert 'Pagine scansionate senza testo letto: 2.' in dettaglio['message']


def test_la_scansione_bianca_e_la_pagina_vuota_non_bloccano(client):  # noqa: F811
    client.app.state.generation_provider = Provider()
    doc = upload(client, 'misto.pdf', pdf_scansioni_senza_testo('nativa', 'bianca', 'vuota'))
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    assert pagine_bianche(estratta['warnings']) == [2] and pagine_non_lette(estratta['warnings']) == []
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'acknowledgeWarnings': True})
    assert risposta.status_code == 201, risposta.text


def test_file_reale_02_nativo_blocca_tranne_le_pagine_bianche():
    from formazione_api.extractors import native_extract
    path = file_corpus('02-dpr-547-1955')
    _blocks, warnings, _status = native_extract(path, 'pdf', 1, 48)
    assert pagine_bianche(warnings) == [2, 47]
    assert pagine_non_lette(warnings) == [p for p in range(1, 49) if p not in (2, 47)]


def test_ocr_la_pagina_bianca_ha_un_solo_avviso(monkeypatch, tmp_path):
    """Con l'OCR la pagina bianca riceveva anche «priva di testo estratto: revisione necessaria»:
    lo stesso caso detto due volte. La scansione con contenuto non letta tiene entrambi gli avvisi."""
    from formazione_api.docling_adapter import docling_extract
    from test_pagine_bianche import docling_finto, pdf_scansioni
    docling_finto(monkeypatch, tmp_path, {})
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni(None, 'illeggibile'))
    _blocks, warnings, _status = docling_extract(path, 'pdf', 1, 2)
    assert [w for w in warnings if w.startswith('Pagina 1')] == [avviso_pagina_bianca(1)]
    assert 'Pagina 2 priva di testo estratto: revisione necessaria.' in warnings
    assert pagine_non_lette(warnings) == [2]
