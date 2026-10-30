"""Le scansioni non lette bloccano la generazione (generation_routes.py, measurement/corsa.py).

Prima: un'estrazione nativa con pagine «probabile scansione» aveva stato needs_review e bastava
spuntare «Ho verificato» per generare un corso dalle sole intestazioni GURITEL.
"""
from decimal import Decimal

import pytest

from formazione_api.measurement import corsa as misura
from formazione_api.measurement.guardia import GuardiaRifiuto, Registro
from formazione_api.pagine_non_lette import avviso_ocr_vuoto, avviso_scansione, pagine_non_lette
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_difetti_estrazione import pdf_misto
from test_generation_http import Provider


def test_gli_avvisi_si_rileggono_con_il_loro_numero_di_pagina():
    avvisi = [avviso_ocr_vuoto(12), 'Pagina 3 priva di testo estraibile: richiede OCR o revisione.',
              avviso_scansione(4), avviso_scansione(12), 'Figura a pagina 7: contenuto visivo da verificare.']
    assert pagine_non_lette(avvisi) == [4, 12]


def test_la_scansione_non_letta_blocca_anche_con_ho_verificato(client):
    client.app.state.generation_provider = Provider()
    doc = upload(client, 'misto.pdf', pdf_misto())
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    assert pagine_non_lette(estratta['warnings']) == [1, 4]
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'acknowledgeWarnings': True})
    assert risposta.status_code == 422, risposta.text
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'unread_pages'
    assert 'Pagine scansionate senza testo letto: 1, 4' in dettaglio['message']
    assert 'OCR' in dettaglio['message'] and 'intervallo' in dettaglio['message']


def test_escludere_le_scansioni_dalla_selezione_permette_di_generare(client):
    client.app.state.generation_provider = Provider()
    doc = upload(client, 'misto.pdf', pdf_misto())
    estratta = extraction(client, doc, {'mode': 'range', 'fromPage': 2, 'toPage': 2}).json()
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'acknowledgeWarnings': True})
    assert risposta.status_code == 201, risposta.text


def test_la_corsa_di_misura_non_spende_su_scansioni_non_lette(tmp_path):
    estrazione = dict(documentId='d', selezione='s', kind='pdf', inizio=1, fine=2, engine='native', status='needs_review',
                      blocks=[{'id': 'b1', 'text': 'COPIA TRATTA DA GURITEL', 'page': 1, 'label': 'Pagina 1'}],
                      warnings=[avviso_scansione(1)])
    with pytest.raises(GuardiaRifiuto, match='Pagine scansionate senza testo letto: 1'):
        misura.esegui_selezione(dict(id='s', documento='d'), estrazione, 'sha', PREZZI, 'openai', 'm', Decimal('1'),
                                Registro(tmp_path / 'registro.json'), tmp_path / 'corse')


def test_il_preventivo_dichiara_rifiutata_la_selezione_con_scansioni_non_lette():
    estrazione = dict(documentId='d', selezione='s', kind='pdf', inizio=1, fine=1, engine='docling', status='needs_review',
                      blocks=[{'id': 'b1', 'text': 'COPIA TRATTA DA GURITEL', 'page': 1, 'label': 'Pagina 1'}],
                      warnings=[avviso_ocr_vuoto(1)])
    voce = misura.preventivo_selezione(dict(id='s', documento='d'), estrazione, PREZZI)
    assert voce['rifiutataDallaPipeline']['code'] == 'unread_pages'
    assert voce['pagineNonLette'] == [1]
    assert voce['modelli'] == []


PREZZI = {'fornitori': {}}
