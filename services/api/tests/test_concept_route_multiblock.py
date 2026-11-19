from decimal import Decimal
import json
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

from formazione_api.generation.concept import (
    ConceptBranchDraft,
    ConceptMergeBranch,
    ConceptMergePlan,
    ConceptNodeDraft,
    ConceptTreeDraft,
)
from formazione_api.main import create_app
from test_api import extraction, upload


class FakeMultiBlockProvider:
    provider_name = 'anthropic'
    model = 'claude-haiku-5-5'

    def __init__(self, fail_on_chunk: str | None = None):
        self.map_calls = []
        self.merge_calls = []
        self.fail_on_chunk = fail_on_chunk

    def concept_tree(self, chunk):
        self.map_calls.append(chunk.id)
        if self.fail_on_chunk == chunk.id:
            raise RuntimeError(f'Simulazione fallimento su {chunk.id}')
        return ConceptTreeDraft(
            rootTitle='Architettura dei Sistemi',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[
                        ConceptNodeDraft(
                            title=f'Nodo da {chunk.id}',
                            summary=f'Sintesi approfondita di {chunk.id}',
                            sourceRefs=[f'{chunk.id}:1-10'],
                        )
                    ],
                )
            ],
        )

    def concept_merge(self, payload: str):
        self.merge_calls.append(payload)
        items = json.loads(payload)
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(
                    title='Ramo Fuso Principale',
                    memberBranchIds=[it['id'] for it in items],
                )
            ]
        )


def _crea_due_blocchi_testo(client) -> dict:
    testo = ('Parola di testo per calcolo distribuito. ' * 500)[:10000]
    doc = upload(client, 'sistemi_distribuiti.txt', testo.encode('utf-8'))
    return extraction(client, doc, {'mode': 'all'}).json()


def test_percorso_felice_con_due_chunk(tmp_path):
    app = create_app(tmp_path)
    provider = FakeMultiBlockProvider()
    app.state.concept_provider = provider
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)
    res = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res.status_code == 200, res.text
    data = res.json()

    assert data['complete'] is True
    assert data['warnings'] == []
    assert data['treeHash'] != ''
    assert data['rootTitle'] == 'Architettura dei Sistemi'
    assert len(data['branches']) == 1
    branch = data['branches'][0]
    assert branch['id'] == 'branch-1'
    assert branch['title'] == 'Ramo Fuso Principale'
    assert len(branch['nodes']) == 2
    assert branch['nodes'][0]['id'] == 'node-1-1'
    assert branch['nodes'][1]['id'] == 'node-1-2'
    assert 'b1' in branch['originBlocks']
    assert 'b1' in branch['nodes'][0]['originBlocks']

    assert len(provider.map_calls) == 2
    assert len(provider.merge_calls) == 1


def test_seconda_post_con_cache_costo_zero(tmp_path):
    app = create_app(tmp_path)
    provider = FakeMultiBlockProvider()
    app.state.concept_provider = provider
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)
    res1 = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res1.status_code == 200
    data1 = res1.json()

    # Reset dei contatori del provider
    provider.map_calls.clear()
    provider.merge_calls.clear()

    # Seconda POST: deve riutilizzare il file persistito a costo zero senza chiamate al fake
    res2 = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res2.status_code == 200
    data2 = res2.json()

    assert data1 == data2
    assert len(provider.map_calls) == 0
    assert len(provider.merge_calls) == 0


def test_chunk_fallito_restituisce_200_parziale(tmp_path):
    app = create_app(tmp_path)
    # Fai fallire il secondo chunk
    provider = FakeMultiBlockProvider(fail_on_chunk='chunk-2')
    app.state.concept_provider = provider
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)
    res = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res.status_code == 200, res.text
    data = res.json()

    assert data['complete'] is False
    assert any('BLOCK_FAILED:chunk-2' in w for w in data['warnings'])
    assert data['treeHash'] != ''
    assert len(data['branches']) == 1
    assert data['branches'][0]['id'] == 'branch-1'
    assert data['branches'][0]['title'] == 'Ramo chunk-1'


def test_get_prima_di_post_restituisce_404(tmp_path):
    app = create_app(tmp_path)
    provider = FakeMultiBlockProvider()
    app.state.concept_provider = provider
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)

    # GET prima di qualunque POST -> 404
    get_res = client.get(f"/extractions/{ext['id']}/concept-tree")
    assert get_res.status_code == 404

    # Dopo la POST
    post_res = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert post_res.status_code == 200

    # GET dopo la POST -> 200 con lo stesso contenuto
    get_res2 = client.get(f"/extractions/{ext['id']}/concept-tree")
    assert get_res2.status_code == 200
    assert get_res2.json() == post_res.json()


def test_compatibilita_client_vecchio(tmp_path):
    class LegacyClientNode(BaseModel):
        model_config = ConfigDict(extra='ignore')
        title: str
        summary: str
        sourceRefs: list[str]

    class LegacyClientBranch(BaseModel):
        model_config = ConfigDict(extra='ignore')
        title: str
        nodes: list[LegacyClientNode]

    class LegacyClientTree(BaseModel):
        model_config = ConfigDict(extra='ignore')
        rootTitle: str
        branches: list[LegacyClientBranch]

    app = create_app(tmp_path)
    provider = FakeMultiBlockProvider()
    app.state.concept_provider = provider
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)
    res = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res.status_code == 200
    data = res.json()

    # Validazione con il modello del client che ignora i campi nuovi
    draft = LegacyClientTree.model_validate(data)
    assert draft.rootTitle == 'Architettura dei Sistemi'
    assert len(draft.branches) == 1
    assert draft.branches[0].title == 'Ramo Fuso Principale'
    assert len(draft.branches[0].nodes) == 2



class FakeGroqFreeProvider(FakeMultiBlockProvider):
    """Provider sul piano gratuito di Groq: sovraccarico non pubblicato, prezzo 0."""
    provider_name = 'groq'
    model = 'openai/gpt-oss-120b'


def test_mappa_con_fornitore_gratuito_non_rifiutata(tmp_path):
    """Regressione: il sovraccarico non pubblicato dei piani gratuiti non deve bloccare
    la mappa (in preventivo_corsa vale Prezzo.gratuito; la stessa regola vale qui)."""
    app = create_app(tmp_path)
    app.state.concept_provider = FakeGroqFreeProvider()
    client = TestClient(app)

    ext = _crea_due_blocchi_testo(client)
    res = client.post(f"/extractions/{ext['id']}/concept-tree", json={})
    assert res.status_code == 200, res.text
    assert res.json()['complete'] is True
