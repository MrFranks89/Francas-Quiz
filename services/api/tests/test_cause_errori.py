"""Causa degli errori dei fornitori: strutturata, senza segreti, scritta nel log del server.
Dove finisce poi (registri, risposta HTTP): test_cause_errori_destinazioni.py.

Prima del 4 novembre 2026 ogni eccezione degli SDK diventava `provider_error` con un messaggio fisso
e la causa veniva buttata via (due generazioni Gemini fallite il 3 novembre senza un motivo nel
registro). Qui i veri SDK `openai` 3.31.0 e `anthropic` 1.15.0 ricevono le risposte d'errore da un
trasporto finto: le eccezioni sono quelle che lo SDK costruisce davvero, nessuna chiamata di rete.

Le chiavi sono finte ma hanno la forma di quelle vere (sk-proj-, sk-ant-, AIza...): il fornitore
finto le ripete nel messaggio d'errore, come fa OpenAI con «Incorrect API key provided».
"""
import json
import logging
from types import SimpleNamespace

import anthropic
import httpx2
import openai
import pytest

from formazione_api.generation import GenerationError, generate
from formazione_api.generation.anthropic_provider import AnthropicProvider
from formazione_api.generation.causa import causa_errore, oscura
from formazione_api.generation.openai_compat_provider import COMPATIBILI, OpenAICompatProvider
from formazione_api.generation.provider import OpenAIProvider
from test_generation import extraction as estrazione_pipeline
from test_openai_compat_provider import OPENAI_VERO

CHIAVE_OPENAI = 'sk-proj-FINTA0123456789abcdefABCDEFghij'
CHIAVE_ANTHROPIC = 'sk-ant-api03-FINTA0123456789abcdefABCDEF'
CHIAVE_GEMINI = 'AIzaSyFINTA0123456789abcdefghijklmnopq'
CHIAVI = (CHIAVE_OPENAI, CHIAVE_ANTHROPIC, CHIAVE_GEMINI)
LOGGER = 'formazione_api.generation.causa'


def trasporto(esito, richieste=None):
    """esito: (stato, corpo) restituito, oppure un'eccezione httpx2 sollevata dal trasporto."""
    def handler(request):
        if richieste is not None:
            richieste.append(request)
        if isinstance(esito, Exception):
            raise esito
        stato, corpo = esito
        return httpx2.Response(stato, json=corpo)
    return httpx2.MockTransport(handler)


def openai_finto(esito):
    client = OPENAI_VERO(api_key=CHIAVE_OPENAI, base_url='http://openai.invalid/v1', max_retries=0,
                         http_client=openai.DefaultHttpxClient(transport=trasporto(esito)))
    return OpenAIProvider(client=client, model='modello-prova')


def anthropic_finto(esito, modello='modello-prova'):
    client = anthropic.Anthropic(api_key=CHIAVE_ANTHROPIC, base_url='http://anthropic.invalid', max_retries=0,
                                 http_client=anthropic.DefaultHttpxClient(transport=trasporto(esito)))
    return AnthropicProvider(client=client, model=modello)


def gemini_finto(esito):
    client = OPENAI_VERO(api_key=CHIAVE_GEMINI, base_url=COMPATIBILI['gemini'].base_url, max_retries=0,
                         http_client=openai.DefaultHttpxClient(transport=trasporto(esito)))
    return OpenAICompatProvider('gemini', client=client, model='modello-prova')


# Corpi d'errore nella forma di ciascun fornitore. OpenAI: {"error": {message, type, param, code}}
# (lo SDK lo scompone in openai/_client.py `_make_status_error`, `body.get("error", body)`).
# Anthropic: {"type": "error", "error": {type, message}} (anthropic/_exceptions.py, APIStatusError.type).
# Gemini compatibile: forma non verificabile senza una chiamata reale; qui la forma di Google
# {"error": {code, message, status}}; la forma a elenco è provata a parte.
def corpo_openai(messaggio, tipo, codice):
    return {'error': {'message': messaggio, 'type': tipo, 'param': None, 'code': codice}}


def corpo_anthropic(messaggio, tipo, codice=None):
    return {'type': 'error', 'error': {'type': tipo, 'message': messaggio}}


def corpo_gemini(messaggio, tipo, codice):
    return {'error': {'code': codice, 'message': messaggio, 'status': tipo}}


FORNITORI = {
    'openai': (openai_finto, corpo_openai, CHIAVE_OPENAI),
    'anthropic': (anthropic_finto, corpo_anthropic, CHIAVE_ANTHROPIC),
    'gemini': (gemini_finto, corpo_gemini, CHIAVE_GEMINI),
}


def fallisce(provider):
    with pytest.raises(GenerationError) as errore:
        generate(estrazione_pipeline(), provider)
    assert errore.value.code == 'provider_error'
    return errore.value


def senza_chiavi(*testi):
    for testo in testi:
        for chiave in CHIAVI:
            assert chiave not in testo
            assert chiave[8:24] not in testo  # nemmeno un pezzo


@pytest.mark.parametrize('nome', FORNITORI)
def test_429_limite_di_utilizzo(nome, caplog):
    crea, corpo, _ = FORNITORI[nome]
    codice = {'openai': 'rate_limit_exceeded', 'anthropic': None, 'gemini': 429}[nome]
    tipo = {'openai': 'requests', 'anthropic': 'rate_limit_error', 'gemini': 'RESOURCE_EXHAUSTED'}[nome]
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        errore = fallisce(crea((429, corpo('Quota exceeded for this project', tipo, codice))))
    assert str(errore) == 'Il fornitore ha rifiutato la richiesta: limite di utilizzo raggiunto (429)'
    causa = errore.causa
    assert causa['classe'] == 'RateLimitError' and causa['statoHttp'] == 429
    assert causa['messaggio'] == 'Quota exceeded for this project'
    if nome == 'openai':
        assert (causa['tipo'], causa['codice']) == ('requests', 'rate_limit_exceeded')
    if nome == 'anthropic':
        assert causa['tipo'] == 'rate_limit_error'
    (record,) = [r for r in caplog.records if r.name == LOGGER]
    assert record.levelno == logging.WARNING
    assert nome in record.getMessage() and 'RateLimitError' in record.getMessage() and '429' in record.getMessage()


@pytest.mark.parametrize('nome', FORNITORI)
def test_401_chiave_non_valida_senza_la_chiave(nome, caplog):
    crea, corpo, chiave = FORNITORI[nome]
    messaggio = f'Incorrect API key provided: {chiave}. Header Authorization: Bearer {chiave}'
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        errore = fallisce(crea((401, corpo(messaggio, 'authentication_error', 'invalid_api_key'))))
    assert str(errore) == 'Chiave API non valida (401)'
    assert errore.causa['statoHttp'] == 401 and errore.causa['classe'] == 'AuthenticationError'
    assert '[oscurato]' in errore.causa['messaggio']
    senza_chiavi(json.dumps(errore.causa), str(errore), caplog.text)


@pytest.mark.parametrize('nome', FORNITORI)
def test_400_richiesta_non_valida_con_messaggio(nome):
    crea, corpo, _ = FORNITORI[nome]
    errore = fallisce(crea((400, corpo("Invalid schema for response_format 'ModuleDraft'", 'invalid_request_error', 400))))
    assert str(errore) == "Richiesta non valida per il fornitore (400): Invalid schema for response_format 'ModuleDraft'"
    assert errore.causa['classe'] == 'BadRequestError' and errore.causa['statoHttp'] == 400


@pytest.mark.parametrize('nome', FORNITORI)
def test_timeout(nome):
    crea, _, _ = FORNITORI[nome]
    errore = fallisce(crea(httpx2.ReadTimeout('timed out')))
    assert str(errore) == 'Il fornitore non ha risposto in tempo (timeout)'
    assert errore.causa['classe'] == 'APITimeoutError' and errore.causa['statoHttp'] is None


@pytest.mark.parametrize('nome', FORNITORI)
def test_errore_di_connessione(nome):
    crea, _, _ = FORNITORI[nome]
    errore = fallisce(crea(httpx2.ConnectError('connection refused')))
    assert str(errore) == 'Impossibile raggiungere il fornitore (errore di connessione)'
    assert errore.causa['classe'] == 'APIConnectionError' and errore.causa['statoHttp'] is None


def test_gemini_corpo_a_elenco():
    """Se Gemini restituisce l'errore come elenco, lo SDK non lo scompone (`is_mapping(body)` falso):
    il messaggio si legge comunque dal primo elemento."""
    corpo = [{'error': {'code': 429, 'message': 'Resource has been exhausted', 'status': 'RESOURCE_EXHAUSTED'}}]
    errore = fallisce(gemini_finto((429, corpo)))
    assert errore.causa['statoHttp'] == 429 and errore.causa['messaggio'] == 'Resource has been exhausted'


def test_errore_qualunque_del_client():
    class Messaggi:
        def create(self, **argomenti):
            raise ConnectionResetError('rete assente')
    errore = fallisce(AnthropicProvider(client=SimpleNamespace(messages=Messaggi()), model='m'))
    assert errore.causa == {'classe': 'ConnectionResetError', 'statoHttp': None, 'tipo': None, 'codice': None,
                            'messaggio': 'rete assente'}
    assert str(errore) == 'Impossibile raggiungere il fornitore (errore di connessione)'


def test_messaggio_troncato():
    errore = fallisce(anthropic_finto((500, corpo_anthropic('x' * 5000, 'api_error'))))
    assert len(errore.causa['messaggio']) <= 500
    assert str(errore) == 'Il fornitore non è disponibile al momento (500)'


def test_filtro_oscura_le_sequenze_simili_a_chiavi(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    testo = (f'a {CHIAVE_OPENAI} b {CHIAVE_ANTHROPIC} c {CHIAVE_GEMINI} d sk-abcdefghijklmnop0123 '
             f'Authorization: Bearer tok_segreto_123 x-api-key: segreto-xyz ?key=qualcosa&alt=json')
    pulito = oscura(testo)
    senza_chiavi(pulito)
    for segreto in ('sk-abcdefghijklmnop0123', 'tok_segreto_123', 'segreto-xyz', 'qualcosa'):
        assert segreto not in pulito
    assert pulito.startswith('a [oscurato] b [oscurato] c [oscurato] d [oscurato]')


def test_filtro_oscura_anche_il_valore_configurato(monkeypatch):
    """Una chiave senza un prefisso noto è oscurata perché è il valore di una variabile *_API_KEY."""
    monkeypatch.setenv('GEMINI_API_KEY', 'chiave-senza-prefisso-noto-42')
    assert 'chiave-senza-prefisso-noto-42' not in oscura('errore con chiave-senza-prefisso-noto-42')


def test_causa_di_una_eccezione_non_sdk_e_oscurata():
    causa = causa_errore(RuntimeError(f'fallita con {CHIAVE_OPENAI}'))
    assert causa['classe'] == 'RuntimeError'
    senza_chiavi(json.dumps(causa))

