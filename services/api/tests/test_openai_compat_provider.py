"""Fornitore compatibile OpenAI Chat Completions (Gemini) con il vero SDK openai e un trasporto finto:
nessuna chiave reale, nessuna chiamata di rete."""
import json
from types import SimpleNamespace

import httpx2
import openai
import pytest

from formazione_api.generation import GenerationError, config_status, generate
from formazione_api.generation.instructions import ISTRUZIONI_DIDATTICHE, MAX_RETRIES, materiale
from formazione_api.generation.openai_compat_provider import COMPATIBILI, OpenAICompatProvider, formato_risposta
from formazione_api.generation.selection import FORNITORI, create_provider
from formazione_api.measurement.preventivo import schema_inviato
from test_anthropic_provider import draft_json
from test_generation import extraction
from test_istantanee_models import CARTELLA, in_testo

MODEL = 'explicit-test-model'
OPENAI_VERO = openai.OpenAI  # il test di selezione sostituisce openai.OpenAI
VARIABILI = ('GENERATION_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'NVIDIA_API_KEY', 'NVIDIA_MODEL')


def completamento(content=None, finish_reason='stop', refusal=None, usage='piena'):
    """Corpo Chat Completions (forma di openai/types/chat/chat_completion.py 3.31.0)."""
    corpo = {'id': 'chatcmpl-test', 'object': 'chat.completion', 'created': 0, 'model': 'resolved-test-model',
             'choices': [{'index': 0, 'finish_reason': finish_reason,
                          'message': {'role': 'assistant', 'content': content, 'refusal': refusal}}]}
    if usage == 'piena':
        corpo['usage'] = {'prompt_tokens': 120, 'completion_tokens': 45, 'total_tokens': 165,
                          'prompt_tokens_details': {'cached_tokens': 30}}
    elif usage is not None:
        corpo['usage'] = usage
    return corpo


def client_finto(*risposte, richieste=None, url=None):
    coda = list(risposte)
    richieste = [] if richieste is None else richieste

    def handler(request):
        richieste.append(request)
        stato, corpo = coda.pop(0)
        return httpx2.Response(stato, json=corpo, headers={'retry-after-ms': '1'})
    return OPENAI_VERO(api_key='test-key-not-real', base_url=url or COMPATIBILI['gemini'].base_url,
                         max_retries=MAX_RETRIES, http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))


def fornitore(*risposte):
    richieste = []
    return OpenAICompatProvider('gemini', client=client_finto(*risposte, richieste=richieste), model=MODEL), richieste


def test_richiesta_inviata_e_uso_letto():
    provider, richieste = fornitore((200, completamento(draft_json())))
    risultato = generate(extraction(), provider)
    assert risultato['course']['questions'][0]['sourceRefs'] == ['page-201']
    (richiesta,) = richieste
    assert str(richiesta.url) == 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    corpo = json.loads(richiesta.content)
    assert corpo['model'] == MODEL and corpo['max_tokens'] == 6000
    assert corpo['messages'][0] == {'role': 'system', 'content': ISTRUZIONI_DIDATTICHE}
    assert corpo['messages'][1]['role'] == 'user'
    assert json.loads(corpo['messages'][1]['content'])[0]['sourceId'] == 'page-201'
    assert set(corpo) == {'model', 'max_tokens', 'messages', 'response_format'}
    uso = risultato['usage']
    assert (uso['provider'], uso['model']) == ('gemini', 'resolved-test-model')
    assert (uso['inputTokens'], uso['outputTokens'], uso['cachedInputTokens']) == (120, 45, 30)
    assert provider.last_usage['retriesTaken'] == 0


def test_schema_inviato_uguale_all_istantanea_chat_completions():
    """Nuova istantanea per il formato Chat Completions: lo schema dentro è lo stesso inviato da OpenAI Responses."""
    provider, richieste = fornitore((200, completamento(draft_json())))
    provider.module(SimpleNamespace(id='chunk-1', pieces=[SimpleNamespace(source_id='page-1', start=0, end=5, text='Testo')]))
    inviato = json.loads(richieste[0].content)['response_format']
    file = CARTELLA / 'schema-module-draft-chat-completions.json'
    assert in_testo(inviato) == file.read_text(encoding='utf-8')
    assert inviato == formato_risposta() == schema_inviato('gemini')
    assert inviato['type'] == 'json_schema' and inviato['json_schema']['strict'] is True
    openai_responses = json.loads((CARTELLA / 'schema-module-draft-openai.json').read_text(encoding='utf-8'))
    assert inviato['json_schema']['schema'] == openai_responses['schema']


@pytest.mark.parametrize('corpo,codice', [
    (completamento(None, refusal='Non posso aiutare'), 'provider_refusal'),
    (completamento('{"title": "Mod', finish_reason='content_filter'), 'provider_refusal'),
    (completamento('{"title": "Mod', finish_reason='length'), 'provider_incomplete'),
    (completamento(None), 'provider_empty'),
    (completamento('   '), 'provider_empty'),
    (completamento('{"non": "conforme"}'), 'invalid_generated_content'),
])
def test_errori_distinti_attraverso_la_pipeline(corpo, codice):
    provider, _ = fornitore((200, corpo))
    with pytest.raises(GenerationError) as errore:
        generate(extraction(), provider)
    assert errore.value.code == codice


def test_nessuna_scelta_e_risposta_vuota():
    corpo = completamento('x')
    corpo['choices'] = []
    provider, _ = fornitore((200, corpo))
    with pytest.raises(GenerationError) as errore:
        provider.module(SimpleNamespace(id='c', pieces=[SimpleNamespace(source_id='a', start=0, end=1, text='x')]))
    assert errore.value.code == 'provider_empty'
    assert provider.last_usage['inputTokens'] == 120


def test_guasto_dopo_un_tentativo_ripetuto_e_provider_error():
    guasto = {'error': {'message': 'guasto', 'type': 'server_error'}}
    provider, richieste = fornitore((500, guasto), (500, guasto))
    with pytest.raises(GenerationError) as errore:
        generate(extraction(), provider)
    assert errore.value.code == 'provider_error'
    assert len(richieste) == 1 + MAX_RETRIES
    assert provider.last_usage is None


def test_uso_assente_resta_ignoto_non_zero():
    provider, _ = fornitore((200, completamento(draft_json(), usage=None)))
    uso = generate(extraction(), provider)['usage']
    assert uso['inputTokens'] is None and uso['outputTokens'] is None and uso['cachedInputTokens'] is None


@pytest.fixture
def env(monkeypatch):
    for nome in VARIABILI:
        monkeypatch.delenv(nome, raising=False)
    return monkeypatch


def test_selezione_gemini_dall_ambiente(env):
    """GENERATION_PROVIDER=gemini: generate() senza fornitore iniettato crea il client con il base_url di Gemini."""
    richieste = []
    creati = []

    def openai_finto(**argomenti):
        creati.append(argomenti)
        return client_finto((200, completamento(draft_json())), richieste=richieste, url=argomenti['base_url'])
    env.setattr(openai, 'OpenAI', openai_finto)
    env.setenv('GENERATION_PROVIDER', ' Gemini ')
    assert config_status() == {'configured': False, 'provider': 'gemini', 'missing': ['GEMINI_API_KEY', 'GEMINI_MODEL']}
    with pytest.raises(GenerationError) as errore:
        generate(extraction())
    assert errore.value.code == 'not_configured'
    env.setenv('GEMINI_API_KEY', 'gemini-key-not-real')
    env.setenv('GEMINI_MODEL', 'modello-gemini')
    assert config_status() == {'configured': True, 'provider': 'gemini', 'missing': []}
    risultato = generate(extraction())
    assert risultato['usage']['provider'] == 'gemini'
    (argomenti,) = creati
    assert argomenti['api_key'] == 'gemini-key-not-real'
    assert argomenti['base_url'] == 'https://generativelanguage.googleapis.com/v1beta/openai/'
    assert argomenti['max_retries'] == MAX_RETRIES
    assert json.loads(richieste[0].content)['model'] == 'modello-gemini'
    assert isinstance(create_provider(), OpenAICompatProvider)


def test_nvidia_non_e_ammesso(env):
    """NVIDIA non è integrato (output vincolato non documentato sull'endpoint ospitato)."""
    assert 'nvidia' not in FORNITORI
    env.setenv('GENERATION_PROVIDER', 'nvidia')
    env.setenv('NVIDIA_API_KEY', 'nvidia-key-not-real')
    env.setenv('NVIDIA_MODEL', 'modello')
    assert config_status()['invalid'] == ['GENERATION_PROVIDER']
    with pytest.raises(GenerationError) as errore:
        create_provider()
    assert errore.value.code == 'not_configured'
