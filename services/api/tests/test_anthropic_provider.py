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
    assert sent['max_tokens'] == 16000
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
    assert seen['max_output_tokens'] == 16000


def test_missing_cache_counter_makes_total_unknown_not_partial():
    provider, _ = sdk_provider((200, message(draft_json(), usage={'input_tokens': 100, 'output_tokens': 40})))
    usage = generate(extraction(), provider)['usage']
    assert usage['inputTokens'] is None
    assert usage['cachedInputTokens'] is None
    assert usage['outputTokens'] == 40


def test_thinking_tokens_reported_even_when_the_answer_is_truncated():
    # Forma di usage.output_tokens_details letta da anthropic/types/output_tokens_details.py 1.15.0.
    # Il caso che serve è proprio la risposta troncata: 6.000 token su 6.000, quanti di ragionamento?
    usage = {'input_tokens': 100, 'output_tokens': 6000, 'cache_creation_input_tokens': 0,
             'cache_read_input_tokens': 0, 'output_tokens_details': {'thinking_tokens': 5400}}
    provider, _ = sdk_provider((200, message('{"title": "Mod', stop_reason='max_tokens', usage=usage)))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'provider_incomplete'
    assert provider.last_usage['thinkingTokens'] == 5400
    assert provider.last_usage['outputTokens'] == 6000


@pytest.mark.parametrize('dettagli', [{}, {'output_tokens_details': None}])
def test_missing_output_tokens_details_is_unknown_not_zero(dettagli):
    usage = {'input_tokens': 100, 'output_tokens': 40, 'cache_creation_input_tokens': 5,
             'cache_read_input_tokens': 20, **dettagli}
    provider, _ = sdk_provider((200, message(draft_json(), usage=usage)))
    generate(extraction(), provider)
    assert 'thinkingTokens' in provider.last_usage
    assert provider.last_usage['thinkingTokens'] is None


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
    provider, requests = sdk_provider((200, message('{"title": ""}')), (200, message('{"title": ""}')))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'invalid_generated_content'
    assert 'chunk-1' in str(error.value)
    assert len(requests) == 2


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
    assert provider.client.timeout == 180.0
    assert provider.client.max_retries == 1
    status = config_status()
    assert status['configured'] is True
    assert 'test-key-not-real' not in json.dumps(status)


def _chunk_di_prova():
    from formazione_api.generation.chunks import Chunk, SourcePiece
    return Chunk('chunk-1', (SourcePiece('page-1', 0, 12, 'Testo è qui.'), SourcePiece('page-2', 3, 9, 'altro\n')))


def _richiesta_catturata(chunk):
    """La richiesta che AnthropicProvider.module() passa a messages.create, catturata su un client finto."""
    seen = {}

    class Messages:
        def create(self, **kwargs):
            seen.update(kwargs)
            raise RuntimeError('stop')
    with pytest.raises(GenerationError):
        AnthropicProvider(client=SimpleNamespace(messages=Messages()), model=MODEL).module(chunk)
    return seen


def test_request_sent_by_provider_is_pinned():
    from formazione_api.generation.anthropic_provider import _schema
    from formazione_api.generation.instructions import materiale
    chunk = _chunk_di_prova()
    assert _richiesta_catturata(chunk) == dict(
        model=MODEL, max_tokens=16000, system=ISTRUZIONI_DIDATTICHE,
        messages=[{'role': 'user', 'content': materiale(chunk)}],
        output_config={'format': {'type': 'json_schema', 'schema': _schema()}, 'effort': 'low'})


def test_request_function_is_what_provider_sends():
    from formazione_api.generation.anthropic_provider import richiesta
    chunk = _chunk_di_prova()
    assert _richiesta_catturata(chunk) == richiesta(MODEL, chunk)


@pytest.mark.parametrize('stop_reason', ['max_tokens', 'model_context_window_exceeded', 'pause_turn'])
def test_incomplete_error_names_the_stop_reason(stop_reason):
    # Senza il motivo nel messaggio, «incompleta» non dice se il tetto di uscita è troppo basso
    # o se è successo altro: la causa va letta, non dedotta.
    provider, _ = sdk_provider((200, message('{"title": "Mod', stop_reason=stop_reason)))
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'provider_incomplete'
    assert stop_reason in str(error.value)


def test_effort_is_low_so_thinking_leaves_room_for_the_module():
    # Haiku 5.5 ragiona per impostazione predefinita e i token di ragionamento contano in max_tokens.
    provider, requests = sdk_provider((200, message(draft_json())))
    generate(extraction(), provider)
    assert requests[0]['output_config']['effort'] == 'low'


# ANTHROPIC_THINKING: interruttore di misura, facoltativo. Forma {'type': 'disabled'} letta da
# anthropic/types/thinking_config_disabled_param.py 1.15.0.

def test_thinking_absent_or_empty_leaves_the_request_unchanged(monkeypatch):
    from formazione_api.generation.anthropic_provider import _schema, richiesta
    from formazione_api.generation.instructions import materiale
    chunk = _chunk_di_prova()
    attesa = dict(model=MODEL, max_tokens=16000, system=ISTRUZIONI_DIDATTICHE,
                  messages=[{'role': 'user', 'content': materiale(chunk)}],
                  output_config={'format': {'type': 'json_schema', 'schema': _schema()}, 'effort': 'low'})
    for valore in (None, '', '   '):
        if valore is None:
            monkeypatch.delenv('ANTHROPIC_THINKING', raising=False)
        else:
            monkeypatch.setenv('ANTHROPIC_THINKING', valore)
        assert richiesta(MODEL, chunk) == attesa
        assert _richiesta_catturata(chunk) == attesa
    # Facoltativa: non è fra le variabili mancanti e non rende «non configurato» il fornitore.
    monkeypatch.delenv('ANTHROPIC_THINKING', raising=False)
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'modello-di-prova')
    assert config_status() == {'configured': True, 'provider': 'anthropic', 'missing': []}


@pytest.mark.parametrize('valore', ['disabled', '  disabled  '])
def test_thinking_disabled_goes_on_the_wire_with_effort_low(monkeypatch, valore):
    # Sul filo, non solo in richiesta(): vero SDK con trasporto finto, dentro la pipeline.
    monkeypatch.setenv('ANTHROPIC_THINKING', valore)
    provider, requests = sdk_provider((200, message(draft_json())))
    generate(extraction(), provider)
    assert requests[0]['thinking'] == {'type': 'disabled'}
    assert requests[0]['output_config']['effort'] == 'low'
    assert requests[0]['max_tokens'] == 16000


@pytest.mark.parametrize('valore', ['enabled', 'off', 'Disabled', 'adaptive'])
def test_thinking_unknown_value_is_not_configured_and_nothing_is_sent(monkeypatch, valore):
    from formazione_api.generation.anthropic_provider import richiesta
    monkeypatch.setenv('ANTHROPIC_THINKING', valore)
    with pytest.raises(GenerationError) as error:
        richiesta(MODEL, _chunk_di_prova())
    assert error.value.code == 'not_configured'
    assert 'ANTHROPIC_THINKING' in str(error.value) and 'disabled' in str(error.value)
    # Il valore non è ripetuto nel messaggio: potrebbe contenere per errore un segreto.
    assert valore == 'Disabled' or valore not in str(error.value)
    # Alla costruzione del fornitore: prima di qualunque prenotazione di spesa.
    with pytest.raises(GenerationError) as error:
        sdk_provider()
    assert error.value.code == 'not_configured'


def test_thinking_made_invalid_after_construction_is_not_swallowed_as_provider_error(monkeypatch):
    # module() avvolge la chiamata in `except Exception` → provider_error: l'errore di configurazione
    # deve uscire com'è, e nessuna richiesta deve partire.
    monkeypatch.delenv('ANTHROPIC_THINKING', raising=False)
    provider, requests = sdk_provider((200, message(draft_json())))
    monkeypatch.setenv('ANTHROPIC_THINKING', 'enabled')
    with pytest.raises(GenerationError) as error:
        generate(extraction(), provider)
    assert error.value.code == 'not_configured'
    assert requests == []


def test_thinking_disabled_is_accepted_by_the_overhead_measurement(monkeypatch):
    # tools/misura_sovraccarico_anthropic.py rifiuta i campi che count_tokens non accetta: `thinking`
    # è nella firma di messages.count_tokens (anthropic/resources/messages/messages.py 1.15.0).
    import importlib.util
    from pathlib import Path
    percorso = Path(__file__).resolve().parents[1] / 'tools' / 'misura_sovraccarico_anthropic.py'
    spec = importlib.util.spec_from_file_location('misura_sovraccarico_anthropic', percorso)
    ms = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ms)
    monkeypatch.setenv('ANTHROPIC_THINKING', 'disabled')
    conteggio = ms.richiesta_conteggio(MODEL, _chunk_di_prova())
    assert conteggio['thinking'] == {'type': 'disabled'} and 'max_tokens' not in conteggio
