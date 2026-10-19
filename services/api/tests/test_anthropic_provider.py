"""AnthropicProvider con client finti: nessuna chiamata di rete, nessuna chiave reale."""
import json
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from formazione_api.generation import GenerationError, generate
from formazione_api.generation.anthropic_provider import AnthropicProvider, config_status
from formazione_api.generation.instructions import ISTRUZIONI_DIDATTICHE
from formazione_api.generation.provider import OpenAIProvider
from test_generation import FakeProvider, extraction

MODEL = 'explicit-test-model'


def draft_json(source='page-201'):
    draft = FakeProvider().module(SimpleNamespace(pieces=[SimpleNamespace(source_id=source)]))
    return draft.model_dump_json()


def message(text=None, stop_reason='end_turn', usage=None, blocks=None):
    """Corpo di risposta Messages API (forma di anthropic/types/message.py 1.15.0)."""
    content = blocks if blocks is not None else ([{'type': 'text', 'text': text}] if text is not None else [])
    return {'id': 'msg_test', 'type': 'message', 'role': 'assistant', 'model': 'resolved-test-model',
            'content': content, 'stop_reason': stop_reason, 'stop_sequence': None,
            'usage': usage or {'input_tokens': 100, 'output_tokens': 40,
                               'cache_creation_input_tokens': 5, 'cache_read_input_tokens': 20}}


def sdk_provider(*responses):
    """Vero SDK anthropic con trasporto finto: verifica anche che la richiesta sia accettata dall'SDK."""
    requests = []
    queue = list(responses)

    def handler(request):
        requests.append(json.loads(request.content))
        status, body = queue.pop(0)
        return httpx2.Response(status, json=body)

    client = anthropic.Anthropic(api_key='test-key-not-real', base_url='http://anthropic.invalid', max_retries=1,
                                 http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))
    return AnthropicProvider(client=client, model=MODEL), requests


def test_success_through_pipeline_with_usage():
    provider, requests = sdk_provider((200, message(draft_json())))
    result = generate(extraction(), provider)
    assert result['course']['questions'][0]['sourceRefs'] == ['page-201']
    sent = requests[0]
    assert sent['model'] == MODEL
    assert sent['max_tokens'] == 6000
    assert sent['system'] == ISTRUZIONI_DIDATTICHE
    assert sent['output_config']['format']['type'] == 'json_schema'
    assert sent['output_config']['format']['schema']['additionalProperties'] is False
    assert 'thinking' not in sent
    assert json.loads(sent['messages'][0]['content'])[0]['sourceId'] == 'page-201'
    usage = result['usage']
    assert usage['provider'] == 'anthropic'
    assert usage['model'] == 'resolved-test-model'
    # input_tokens è la parte non in cache: totale = 100 + 5 + 20.
    assert usage['inputTokens'] == 125
    assert usage['outputTokens'] == 40
    assert usage['cachedInputTokens'] == 20


def test_same_instructions_as_openai():
    seen = {}

    class Responses:
        def parse(self, **kwargs):
            seen.update(kwargs)
            raise RuntimeError('stop')
    with pytest.raises(GenerationError):
        OpenAIProvider(client=SimpleNamespace(responses=Responses()), model=MODEL).module(
            SimpleNamespace(pieces=[SimpleNamespace(source_id='a', start=0, end=1, text='x')]))
    assert seen['instructions'] == ISTRUZIONI_DIDATTICHE
    assert seen['max_output_tokens'] == 6000


def test_missing_cache_counter_makes_total_unknown_not_partial():
    provider, _ = sdk_provider((200, message(draft_json(), usage={'input_tokens': 100, 'output_tokens': 40})))
    usage = generate(extraction(), provider)['usage']
    assert usage['inputTokens'] is None
    assert usage['cachedInputTokens'] is None
    assert usage['outputTokens'] == 40


@pytest.mark.parametrize('body,code', [
    (message('{"non": "conforme"', stop_reason='refusal'), 'provider_refusal'),
    (message('{"title": "Mod', stop_reason='max_tokens'), 'provider_incomplete'),
    (message('{"title": "Mod', stop_reason='model_context_window_exceeded'), 'provider_incomplete'),
    (message(None), 'provider_empty'),
    (message('   '), 'provider_empty'),
    (message(None, blocks=[{'type': 'thinking', 'thinking': '', 'signature': 'x'}]), 'provider_empty'),
])
def test_distinct_errors_through_pipeline(body, code):
    provider, _ = sdk_provider((200, body))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == code


def test_client_exception_is_provider_error_after_one_retry():
    error_body = {'type': 'error', 'error': {'type': 'api_error', 'message': 'guasto'}}
    provider, requests = sdk_provider((500, error_body), (500, error_body))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'provider_error'
    assert len(requests) == 2


def test_arbitrary_client_exception_is_provider_error():
    class Messages:
        def create(self, **kwargs):
            raise ConnectionError('rete assente')
    provider = AnthropicProvider(client=SimpleNamespace(messages=Messages()), model=MODEL)
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'provider_error'
    assert provider.last_usage is None


def test_invented_source_rejected_by_pipeline():
    provider, _ = sdk_provider((200, message(draft_json(source='inventata'))))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'invented_source'


def test_invalid_json_is_invalid_generated_content():
    provider, _ = sdk_provider((200, message('{"title": ""}')))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'invalid_generated_content'


def test_missing_configuration(monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    monkeypatch.setenv('ANTHROPIC_MODEL', 'modello-di-prova')
    status = config_status()
    assert status == {'configured': False, 'provider': 'anthropic', 'missing': ['ANTHROPIC_API_KEY']}
    with pytest.raises(GenerationError) as error:
        AnthropicProvider()
    assert error.value.code == 'not_configured'
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    monkeypatch.delenv('ANTHROPIC_MODEL')
    assert config_status()['missing'] == ['ANTHROPIC_MODEL']
    with pytest.raises(GenerationError) as error:
        AnthropicProvider()
    assert error.value.code == 'not_configured'


def test_real_client_limits_without_network(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'modello-di-prova')
    provider = AnthropicProvider()
    assert provider.model == 'modello-di-prova'
    assert provider.client.timeout == 90.0
    assert provider.client.max_retries == 1
    status = config_status()
    assert status['configured'] is True
    assert 'test-key-not-real' not in json.dumps(status)
