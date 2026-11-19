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

    # Seconda chiamata con stessa chiave: status 200 cached
    res2 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3, 'idempotencyKey': 'chiave_test_123'},
    )
    assert res2.status_code == 200
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
    # La corsa registra la chiamata fallita con l'importo prenotato, ma nessun costo effettivo completato
    assert len(corse[0]['chiamate']) == 1
    assert corse[0]['chiamate'][0]['esito'] == 'errore'
    assert corse[0]['chiamate'][0].get('effettivoUSD') is None
    assert Decimal(str(corse[0]['addebitatoUSD'])) > Decimal(0)


def test_costo_registrato_solo_per_chiamate_concluse(tmp_path, monkeypatch):
    """Se la prima chiamata al generatore ha successo ma il validatore fallisce, la prima è completata e la seconda è segnata errore."""
    monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'openai/gpt-oss-120b')

    class FailingValidator:
        provider_name = 'groq'
        model = 'openai/gpt-oss-120b'

        def verifica(self, chunk, domande):
            raise RuntimeError('Errore improvviso nel validatore')

    monkeypatch.setattr('formazione_api.spesa_quiz_ramo.create_validator', lambda: FailingValidator())

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
    assert res.status_code == 502

    corse = registro(store).leggi()['corse']
    assert len(corse) == 1
    corsa = corse[0]
    assert corsa['esito'] == 'errore'
    assert len(corsa['chiamate']) == 2
    # 1. Generazione completata con successo
    chiamata_gen = corsa['chiamate'][0]
    assert chiamata_gen['ruolo'] == 'quiz_ramo'
    assert chiamata_gen['esito'] == 'completata'
    assert Decimal(str(chiamata_gen['addebitatoUSD'])) > Decimal(0)
    # 2. Validatore fallito a metà
    chiamata_val = corsa['chiamate'][1]
    assert chiamata_val['ruolo'] == 'validazione_quiz_ramo'
    assert chiamata_val['esito'] == 'errore'
    assert chiamata_val.get('effettivoUSD') is None


def test_a2_limite_corsa_senza_e_con_validatore(tmp_path, monkeypatch):
    """A2: senza validatore il limite della corsa è 2 × costo_gen; con validatore 2 × gen + 2 × val."""
    from formazione_api.measurement.guardia import costo_limite_blocco
    from formazione_api.stima_quiz_ramo import valuta_quiz_ramo

    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    store = app.state.store
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, store)
    extraction = store.read(ext_id, 'extraction.json')
    blocchi = extraction['blocks'][:1]

    # 1. Senza validatore: 2 * costo_gen
    stima_no_val = valuta_quiz_ramo(extraction, blocchi, provider, store, con_validatore=False)
    costo_gen = costo_limite_blocco(stima_no_val['limite_gen'], stima_no_val['listino'])
    assert stima_no_val['limiteSuperioreUSD'] == 2 * costo_gen

    # 2. Con validatore: 2 * costo_gen + 2 * costo_val
    monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'openai/gpt-oss-120b')
    stima_val = valuta_quiz_ramo(extraction, blocchi, provider, store, con_validatore=True)
    costo_val = costo_limite_blocco(stima_val['validatore']['limite'], stima_val['validatore']['listino'])
    assert stima_val['limiteSuperioreUSD'] == (2 * costo_gen) + (2 * costo_val)


def test_m3b_secondo_controllo_idempotenza_dentro_il_lock(tmp_path, monkeypatch):
    """M3b: richiesta identica che oltrepassa il controllo iniziale viene intercettata dentro il lock."""
    import formazione_api.branch_quiz_routes as bq_routes
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)

    # 1. Prima richiesta: genera e salva il quiz
    res1 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3, 'idempotencyKey': 'k-m3b-lock'},
    )
    assert res1.status_code == 201
    assert len(provider.calls) == 1

    # 2. Simuliamo una gara di concorrenza: la seconda richiesta fa il controllo prima del lock
    # trovando lista vuota (come se fosse partita prima che la prima finisse di scrivere),
    # ma una volta acquisito il lock, M3b rilegge la lista e intercetta il quiz cached.
    orig_leggi = bq_routes.leggi_quiz
    calls_leggi = 0

    def fake_leggi(root, eid):
        nonlocal calls_leggi
        calls_leggi += 1
        if calls_leggi == 1:
            return []  # Simula record non ancora visibile prima del lock
        return orig_leggi(root, eid)

    monkeypatch.setattr('formazione_api.branch_quiz_routes.leggi_quiz', fake_leggi)

    res2 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3, 'idempotencyKey': 'k-m3b-lock'},
    )
    assert res2.status_code == 200
    assert res2.json()['cached'] is True
    # Nessuna seconda chiamata al provider!
    assert len(provider.calls) == 1


def test_m7_listino_senza_sovraccarico_preview_fits_budget_false(tmp_path, monkeypatch):
    """M7: con listino senza sovraccaricoIngressoPerChiamata (limite incompleto) → preview fitsBudget == false."""
    from formazione_api import spesa_quiz_ramo
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)

    orig_valuta = spesa_quiz_ramo.valuta_quiz_ramo

    def fake_valuta(*args, **kwargs):
        stima = orig_valuta(*args, **kwargs)
        stima['limiteCompleto'] = False
        return stima

    monkeypatch.setattr('formazione_api.branch_quiz_routes.valuta_quiz_ramo', fake_valuta)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz/preview',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 200
    assert res.json()['fitsBudget'] is False
