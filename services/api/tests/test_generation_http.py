from fastapi.testclient import TestClient

from formazione_api.main import create_app
from formazione_api.generation import GenerationError
from test_api import client, extraction, upload, pdf_bytes
from bozze_di_prova import bozza


class Provider:
    # Fornitore e modello dichiarati: senza, il preventivo non è disponibile e la rotta rifiuta.
    provider_name, model = 'anthropic', 'claude-haiku-5-5'

    def module(self, chunk):
        source = chunk.pieces[0].source_id
        return dict(title='Lezione', objectives=['Comprendere la procedura'],
                    slides=[dict(heading='Procedura', body='Leggere il manuale', highlight='Verificare', sourceRefs=[source])],
                    questions=[bozza(kind='single', rationales=['', ''], difficulty='base', prompt='Cosa leggere?', options=['Il manuale', 'Un romanzo'], correctIndex=0,
                                    explanation='La procedura è nel manuale.', sourceRefs=[source])])


def test_generation_not_configured_http(client, monkeypatch):
    monkeypatch.delenv('GENERATION_PROVIDER', raising=False)
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_MODEL', raising=False)
    assert client.get('/generation/config').json()['configured'] is False
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    response = client.post(f"/extractions/{extracted['id']}/generate", json={})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'not_configured'


def test_generated_draft_persists_via_real_routes(tmp_path):
    app = create_app(tmp_path)
    app.state.generation_provider = Provider()
    client = TestClient(app)
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    response = client.post(f"/extractions/{extracted['id']}/generate", json={'title': 'Corso prova'})
    assert response.status_code == 201, response.text
    result = response.json()
    assert result['status'] == 'draft'
    assert result['course']['title'] == 'Corso prova'
    assert result['course']['questions'][0]['sourceRefs'] == ['b1']
    assert TestClient(create_app(tmp_path)).get(f"/drafts/{result['id']}").json() == result
    assert client.get('/drafts/unknown').status_code == 404


def test_generation_body_cannot_supply_provider_or_budget(client):
    response = client.post('/extractions/none/generate', json={'max_chunks': 9999, 'provider': 'fake'})
    assert response.status_code == 422


def test_review_acknowledgement_and_provider_error(client):
    class FailedProvider(Provider):
        def module(self, chunk):
            raise GenerationError('provider_error', 'Errore AI controllato')

    client.app.state.generation_provider = FailedProvider()
    doc = upload(client, 'manual.pdf', pdf_bytes())
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    endpoint = f"/extractions/{extracted['id']}/generate"
    assert client.post(endpoint, json={}).json()['detail']['code'] == 'needs_review'
    response = client.post(endpoint, json={'acknowledgeWarnings': True})
    assert response.status_code == 502
    assert response.json()['detail']['code'] == 'provider_error'
    assert not list(client.app.state.store.root.glob('*.draft.json'))
    assert client.post(endpoint, json={'acknowledgeWarnings': 'true'}).status_code == 422


def test_route_uses_provider_selected_by_environment(client, monkeypatch):
    """Percorso vero: rotta -> generate -> create_provider -> AnthropicProvider -> SDK anthropic.
    Si sostituisce solo il trasporto HTTP dell'SDK; nessun fornitore è iniettato in app.state."""
    import json
    import anthropic
    import httpx2

    sent = []

    def handler(request):
        body = json.loads(request.content)
        sent.append((str(request.url), body))
        source = json.loads(body['messages'][0]['content'])[0]['sourceId']
        draft = Provider().module(type('Chunk', (), {'pieces': [type('Piece', (), {'source_id': source})]})())
        return httpx2.Response(200, json={
            'id': 'msg_test', 'type': 'message', 'role': 'assistant', 'model': 'resolved-anthropic-model',
            'content': [{'type': 'text', 'text': json.dumps(draft)}], 'stop_reason': 'end_turn', 'stop_sequence': None,
            'usage': {'input_tokens': 10, 'output_tokens': 7, 'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 0}})

    real = anthropic.Anthropic

    def offline(**kwargs):
        assert kwargs['api_key'] == 'anthropic-key-not-real'
        return real(**kwargs, base_url='http://anthropic.invalid',
                    http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))

    monkeypatch.setattr(anthropic, 'Anthropic', offline)
    monkeypatch.setenv('GENERATION_PROVIDER', 'anthropic')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'anthropic-key-not-real')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-haiku-5-5')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('OPENAI_MODEL', raising=False)
    assert getattr(client.app.state, 'generation_provider', None) is None
    config = client.get('/generation/config').json()
    assert {k: config[k] for k in ('configured', 'provider', 'missing')} == {'configured': True, 'provider': 'anthropic', 'missing': []}
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    response = client.post(f"/extractions/{extracted['id']}/generate", json={'title': 'Corso Anthropic'})
    assert response.status_code == 201, response.text
    assert len(sent) == 1
    assert sent[0][0] == 'http://anthropic.invalid/v1/messages'
    assert sent[0][1]['model'] == 'claude-haiku-5-5'
    usage = response.json()['usage']
    assert usage['provider'] == 'anthropic'
    assert usage['model'] == 'resolved-anthropic-model'
    assert usage['inputTokens'] == 10


def test_route_reports_selected_provider_not_configured(client, monkeypatch):
    monkeypatch.setenv('GENERATION_PROVIDER', 'anthropic')
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'openai-key-not-real')
    monkeypatch.setenv('OPENAI_MODEL', 'modello-openai')
    config = client.get('/generation/config').json()
    assert config.pop('spending')['maxUsdPerCourse'] == '0.50'
    assert config == {'configured': False, 'provider': 'anthropic', 'missing': ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']}
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    response = client.post(f"/extractions/{extracted['id']}/generate", json={})
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'not_configured'


def test_domanda_malformata_dal_fornitore_vero_arriva_negli_scarti_della_bozza(client, monkeypatch):
    """Percorso vero fino alla bozza salvata: rotta -> genera_con_tetto -> AnthropicProvider (SDK anthropic,
    trasporto finto) -> pipeline. Una domanda con correctIndex fuori dalle opzioni si scarta da sola
    (forma_non_valida): la bozza esce con la buona, una sola chiamata, scarto salvato e restituito."""
    import json
    import anthropic
    import httpx2

    sent = []

    def handler(request):
        body = json.loads(request.content)
        sent.append(body)
        source = json.loads(body['messages'][0]['content'])[0]['sourceId']
        draft = Provider().module(type('Chunk', (), {'pieces': [type('Piece', (), {'source_id': source})]})())
        draft['questions'].append({**draft['questions'][0], 'prompt': 'Domanda con la giusta fuori?', 'correctIndex': 7})
        return httpx2.Response(200, json={
            'id': 'msg_test', 'type': 'message', 'role': 'assistant', 'model': 'resolved-anthropic-model',
            'content': [{'type': 'text', 'text': json.dumps(draft)}], 'stop_reason': 'end_turn', 'stop_sequence': None,
            'usage': {'input_tokens': 10, 'output_tokens': 7, 'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 0}})

    real = anthropic.Anthropic

    def offline(**kwargs):
        return real(**kwargs, base_url='http://anthropic.invalid',
                    http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))

    monkeypatch.setattr(anthropic, 'Anthropic', offline)
    monkeypatch.setenv('GENERATION_PROVIDER', 'anthropic')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'anthropic-key-not-real')
    monkeypatch.setenv('ANTHROPIC_MODEL', 'claude-haiku-5-5')
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    extracted = extraction(client, doc, {'mode': 'all'}).json()
    response = client.post(f"/extractions/{extracted['id']}/generate", json={'title': 'Corso con scarto'})
    assert response.status_code == 201, response.text
    assert len(sent) == 1
    result = response.json()
    assert [q['prompt'] for q in result['course']['questions']] == ['Cosa leggere?']
    (scarto,) = result['scarti']
    assert scarto['rule'] == 'forma_non_valida' and scarto['position'] == 2
    assert scarto['prompt'] == 'Domanda con la giusta fuori?' and 'correctIndex 7' in scarto['message']
    assert '1 domanda scartata dai controlli di qualità' in result['warnings']
    assert client.get(f"/drafts/{result['id']}").json()['scarti'] == result['scarti']
