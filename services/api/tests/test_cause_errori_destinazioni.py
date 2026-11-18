"""Dove finisce la causa di un errore del fornitore: registro della misura, registro dell'app,
risposta HTTP della generazione e log del server; sempre senza la chiave.

Stessi SDK veri e trasporti finti di test_cause_errori.py: nessuna chiamata di rete.
"""
import logging
from decimal import Decimal

import openai
import pytest

from formazione_api import spesa_generazione as spesa
from formazione_api.generation import GenerationError
from formazione_api.measurement import corsa as misura
from formazione_api.measurement.guardia import Registro
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_cause_errori import (CHIAVE_ANTHROPIC, CHIAVE_GEMINI, LOGGER, anthropic_finto, corpo_anthropic,
                               corpo_gemini, senza_chiavi, trasporto)
from test_measurement import SELEZIONE, con_fornitore, estrazione, listino
from test_openai_compat_provider import OPENAI_VERO


def test_registro_della_misura_contiene_la_causa(tmp_path, monkeypatch):
    con_fornitore(monkeypatch, anthropic_finto((429, corpo_anthropic(f'limite per {CHIAVE_ANTHROPIC}', 'rate_limit_error'))))
    registro = Registro(tmp_path / 'r.json')
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), registro, tmp_path / 'corse')
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'provider_error'
    chiamata = corsa['chiamate'][0]
    assert chiamata['esito'] == 'errore' and chiamata['errore'] == 'provider_error'
    assert chiamata['causa']['statoHttp'] == 429 and chiamata['causa']['classe'] == 'RateLimitError'
    scritto = (tmp_path / 'r.json').read_text(encoding='utf-8')
    assert '"statoHttp": 429' in scritto
    senza_chiavi(scritto)


@pytest.fixture
def gemini_rotta(client, monkeypatch):
    """Rotta vera con GENERATION_PROVIDER=gemini (come test_prezzo_zero): il client openai creato da
    selection.create_provider() riceve un 429 dal trasporto finto."""
    for nome in spesa.PREDEFINITI:
        monkeypatch.delenv(nome, raising=False)
    monkeypatch.setenv('GENERATION_PROVIDER', 'gemini')
    monkeypatch.setenv('GEMINI_API_KEY', CHIAVE_GEMINI)
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-3.8-flash')
    richieste = []
    esito = (429, corpo_gemini(f'Quota exceeded for key {CHIAVE_GEMINI}', 'RESOURCE_EXHAUSTED', 429))

    def openai_con_trasporto(**argomenti):
        return OPENAI_VERO(api_key=argomenti['api_key'], base_url=argomenti['base_url'], max_retries=0,
                           http_client=openai.DefaultHttpxClient(transport=trasporto(esito, richieste)))
    monkeypatch.setattr(openai, 'OpenAI', openai_con_trasporto)
    client.app.state.generation_provider = None
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    return client, extraction(client, doc, {'mode': 'all'}).json(), richieste


def test_rotta_http_gemini_429_causa_in_risposta_registro_e_log(gemini_rotta, caplog):
    client, estratta, richieste = gemini_rotta
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})
    assert len(richieste) == 1
    assert richieste[0].headers['authorization'] == f'Bearer {CHIAVE_GEMINI}'  # la chiave è stata davvero usata
    assert risposta.status_code == 502
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'provider_error'
    assert dettaglio['message'] == 'Il fornitore ha rifiutato la richiesta: limite di utilizzo raggiunto (429)'
    assert dettaglio['cause']['statoHttp'] == 429 and dettaglio['cause']['classe'] == 'RateLimitError'
    assert dettaglio['cause']['messaggio'] == 'Quota exceeded for key [oscurato]'
    (corsa,) = spesa.registro(client.app.state.store).leggi()['corse']
    assert corsa['esito'] == 'fallita' and corsa['fornitore'] == 'gemini'
    assert corsa['chiamate'][0]['causa']['statoHttp'] == 429
    scritto = (client.app.state.store.root / spesa.NOME_REGISTRO).read_text(encoding='utf-8')
    assert any('gemini' in r.getMessage() and '429' in r.getMessage() for r in caplog.records if r.name == LOGGER)
    senza_chiavi(risposta.text, scritto, caplog.text)


def test_rotta_http_anthropic_401(client, caplog, monkeypatch):
    for nome in spesa.PREDEFINITI:
        monkeypatch.delenv(nome, raising=False)
    client.app.state.generation_provider = anthropic_finto(
        (401, corpo_anthropic(f'invalid x-api-key: {CHIAVE_ANTHROPIC}', 'authentication_error')), modello='claude-haiku-5-5')
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})
    assert risposta.status_code == 502, risposta.text
    dettaglio = risposta.json()['detail']
    assert dettaglio['message'] == 'Chiave API non valida (401)'
    assert dettaglio['cause']['tipo'] == 'authentication_error'
    scritto = (client.app.state.store.root / spesa.NOME_REGISTRO).read_text(encoding='utf-8')
    assert '"statoHttp": 401' in scritto
    senza_chiavi(risposta.text, scritto, caplog.text)


def test_errore_senza_causa_resta_come_prima(client):
    """Errori sollevati senza causa (pipeline, guardia): nessun campo `cause` nella risposta."""
    class Rotto:
        provider_name, model = 'anthropic', 'claude-haiku-5-5'

        def module(self, chunk):
            raise GenerationError('provider_error', 'Errore AI controllato')
    client.app.state.generation_provider = Rotto()
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})
    assert risposta.status_code == 502
    # Dal 18 novembre 2026 un blocco fallito porta anche i blocchi salvati per la ripresa (ripresa_generazione.py).
    assert risposta.json()['detail'] == {'code': 'provider_error', 'message': 'Errore AI controllato',
                                         'savedChunks': 0, 'totalChunks': 1}
