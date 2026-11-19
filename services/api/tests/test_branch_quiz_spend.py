"""Test per la guardia di spesa dei quiz di ramo: tetti, idempotenza, provider gratuiti e addebiti."""
from decimal import Decimal
import os
import pytest
from fastapi.testclient import TestClient

from formazione_api.generation.bozze import QuestionDraft
from formazione_api.generation.branch_quiz import BranchQuizDraft
from formazione_api.main import create_app
from formazione_api.spesa_generazione import registro
from test_api import extraction, upload
from test_branch_quiz_routes import FakeBranchQuizProvider, _prepara_ambiente_con_albero


def test_stima_oltre_il_tetto_402_senza_chiamate_provider(tmp_path, monkeypatch):
    monkeypatch.setenv('GENERATION_MAX_USD_PER_COURSE', '0.000001')
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 402
    assert res.json()['detail']['code'] == 'budget_exceeded'
    assert 'budget disponibile per questo documento non basta' in res.json()['detail']['message']

    # Nessuna chiamata al provider deve essere avvenuta!
    assert len(provider.calls) == 0


def test_stessa_chiave_idempotenza_cached_true_e_nessuna_chiamata(tmp_path):
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    # Prima chiamata
    res1 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3, 'idempotencyKey': 'chiave_test_123'},
    )
    assert res1.status_code == 201
    assert len(provider.calls) == 1

    # Seconda chiamata con stessa chiave
    res2 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3, 'idempotencyKey': 'chiave_test_123'},
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2.get('cached') is True
    # Il provider non deve essere stato richiamato
    assert len(provider.calls) == 1


def test_provider_gratuito_senza_sovraccarico_non_rifiutato(tmp_path, monkeypatch):
    # Groq o OpenRouter gratuiti hanno sovraccaricoIngressoPerChiamata=None e prezzo=0
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    provider.provider_name = 'groq'
    provider.model = 'openai/gpt-oss-120b'
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz/preview',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['fitsBudget'] is True
    assert Decimal(data['maxCostUsd']) == Decimal(0)


def test_costo_registrato_e_fallimento_a_meta(tmp_path):
    app = create_app(tmp_path)

    class FailingProvider:
        provider_name = 'anthropic'
        model = 'claude-haiku-5-5'
        calls = []

        def genera(self, prompt: str):
            self.calls.append(prompt)
            raise RuntimeError('Errore imprevisto durante la generazione')

    provider = FailingProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 502

    # Nel registro la corsa è segnata come errore
    corse = registro(store).leggi()['corse']
    assert len(corse) == 1
    assert corse[0]['esito'] == 'errore'
