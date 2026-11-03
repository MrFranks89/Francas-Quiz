"""Tentativi ripetuti dallo SDK: letti dalla risposta grezza e usati dalla regolazione del tetto.

Fonte: `retries_taken` («The number of retries made. If no retries happened this will be `0`»)
su APIResponse / LegacyAPIResponse, in anthropic/_response.py 1.15.0 e openai/_legacy_response.py
3.31.0, restituiti da `with_raw_response`. Vero SDK con trasporto finto: nessuna rete, nessuna chiave.
"""
import json
from decimal import Decimal
from types import SimpleNamespace

import anthropic
import httpx2
import openai
import pytest

from formazione_api import spesa_generazione as spesa
from formazione_api.generation.anthropic_provider import AnthropicProvider
from formazione_api.generation.provider import OpenAIProvider
from formazione_api.measurement import preventivo as pv
from formazione_api.measurement.prezzi import PREZZI, carica, prezzo
from test_anthropic_provider import draft_json, message

CHUNK = SimpleNamespace(id='chunk-1', pieces=[SimpleNamespace(source_id='page-201', start=0, end=5, text='Testo')])
# retry-after-ms breve: lo SDK lo rispetta (_calculate_retry_timeout), così il test non attende il backoff.
SUBITO = {'retry-after-ms': '1'}


def risposta_openai():
    """Corpo Responses API minimo (forma di openai/types/responses/response.py 3.31.0)."""
    return {'id': 'resp_test', 'object': 'response', 'created_at': 0, 'model': 'resolved-test-model',
            'status': 'completed', 'parallel_tool_calls': False, 'tool_choice': 'auto', 'tools': [],
            'output': [{'type': 'message', 'id': 'msg_test', 'status': 'completed', 'role': 'assistant',
                        'content': [{'type': 'output_text', 'text': draft_json(), 'annotations': []}]}],
            'usage': {'input_tokens': 100, 'output_tokens': 40, 'total_tokens': 140,
                      'input_tokens_details': {'cached_tokens': 0}, 'output_tokens_details': {'reasoning_tokens': 0}}}


def trasporto(risposte):
    coda = list(risposte)

    def handler(request):
        stato, corpo = coda.pop(0)
        return httpx2.Response(stato, json=corpo, headers=SUBITO)
    return httpx2.MockTransport(handler)


def openai_con(*risposte):
    client = openai.OpenAI(api_key='test-key-not-real', base_url='http://openai.invalid/v1', max_retries=1,
                           http_client=openai.DefaultHttpxClient(transport=trasporto(risposte)))
    return OpenAIProvider(client=client, model='explicit-test-model')


def anthropic_con(*risposte):
    client = anthropic.Anthropic(api_key='test-key-not-real', base_url='http://anthropic.invalid', max_retries=1,
                                 http_client=anthropic.DefaultHttpxClient(transport=trasporto(risposte)))
    return AnthropicProvider(client=client, model='explicit-test-model')


GUASTO = (500, {'error': {'type': 'api_error', 'message': 'finto'}})


@pytest.mark.parametrize('crea,ok', [(openai_con, risposta_openai), (anthropic_con, lambda: message(draft_json()))],
                         ids=['openai', 'anthropic'])
def test_i_fornitori_espongono_i_tentativi_ripetuti(crea, ok):
    fornitore = crea((200, ok()))
    assert fornitore.module(CHUNK).questions
    assert fornitore.last_usage['retriesTaken'] == 0
    fornitore = crea(GUASTO, (200, ok()))
    assert fornitore.module(CHUNK).questions
    assert fornitore.last_usage['retriesTaken'] == 1


def test_client_senza_risposta_grezza_lascia_i_tentativi_ignoti():
    """Un client senza with_raw_response (i finti dei test esistenti) non inventa uno zero."""
    from test_generation import stub_provider
    from test_generation import FakeProvider
    draft = FakeProvider().module(SimpleNamespace(pieces=[SimpleNamespace(source_id='page-201')]))
    fornitore = stub_provider(SimpleNamespace(output=[], status='completed', output_parsed=draft, usage=None))
    fornitore.module(CHUNK)
    assert fornitore.last_usage['retriesTaken'] is None


def limite_e_listino():
    listino = prezzo(carica(PREZZI), 'anthropic', 'claude-haiku-5-5')
    (limite,) = pv.preventivo_corsa(pv.pianifica([dict(id='b1', page=1, text='Leggere il manuale.')]), listino)['limiti']
    return limite, listino


def test_zero_tentativi_ripetuti_regolato_uguale_ai_token_reali():
    limite, listino = limite_e_listino()
    usage = dict(inputTokens=1000, outputTokens=500, cachedInputTokens=0, retriesTaken=0)
    assert spesa.importo_regolato(usage, limite, listino) == pv.costo_tentativo(1000, 500, listino)


def test_un_tentativo_ripetuto_aggiunge_il_limite_di_un_tentativo():
    limite, listino = limite_e_listino()
    usage = dict(inputTokens=1000, outputTokens=500, cachedInputTokens=0, retriesTaken=1)
    per_tentativo = pv.costo_tentativo(limite.ingresso_massimo_per_tentativo, limite.uscita_massima, listino)
    assert spesa.importo_regolato(usage, limite, listino) == pv.costo_tentativo(1000, 500, listino) + per_tentativo


@pytest.mark.parametrize('ripetuti', ['assente', None])
def test_senza_informazione_resta_la_formula_con_max_retries(ripetuti):
    limite, listino = limite_e_listino()
    usage = dict(inputTokens=1000, outputTokens=500, cachedInputTokens=0)
    if ripetuti != 'assente':
        usage['retriesTaken'] = ripetuti
    per_tentativo = pv.costo_tentativo(limite.ingresso_massimo_per_tentativo, limite.uscita_massima, listino)
    assert spesa.importo_regolato(usage, limite, listino) == \
        pv.costo_tentativo(1000, 500, listino) + per_tentativo * (limite.tentativi - 1)


@pytest.mark.parametrize('ripetuti', [-1, 2, 1.5, True, '1'])
def test_tentativi_impossibili_lasciano_il_prenotato(ripetuti):
    """Più tentativi di quelli ammessi da max_retries, o un valore non intero: maggiorante smentito."""
    limite, listino = limite_e_listino()
    usage = dict(inputTokens=1000, outputTokens=500, cachedInputTokens=0, retriesTaken=ripetuti)
    assert spesa.importo_regolato(usage, limite, listino) is None


def test_regolato_con_tentativi_mai_oltre_il_prenotato():
    limite, listino = limite_e_listino()
    prenotato = pv.costo_limite_blocco(limite, listino)
    for ripetuti in (0, 1):
        usage = dict(inputTokens=limite.ingresso_massimo_per_tentativo, outputTokens=limite.uscita_massima,
                     retriesTaken=ripetuti)
        assert spesa.importo_regolato(usage, limite, listino) <= prenotato
    assert Decimal(0) < spesa.importo_regolato(dict(inputTokens=1, outputTokens=1, retriesTaken=0), limite, listino)
