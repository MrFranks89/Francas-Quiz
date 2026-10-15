from fastapi.testclient import TestClient

from formazione_api.main import create_app
from formazione_api.generation import GenerationError
from test_api import client, extraction, upload, pdf_bytes


class Provider:
    def module(self, chunk):
        source = chunk.pieces[0].source_id
        return dict(title='Lezione', objectives=['Comprendere la procedura'],
                    slides=[dict(heading='Procedura', body='Leggere il manuale', highlight='Verificare', sourceRefs=[source])],
                    questions=[dict(prompt='Cosa leggere?', options=['Il manuale', 'Un romanzo'], correctIndex=0,
                                    explanation='La procedura è nel manuale.', sourceRefs=[source])])


def test_generation_not_configured_http(client, monkeypatch):
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
    class FailedProvider:
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
