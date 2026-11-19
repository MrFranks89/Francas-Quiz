"""Test per la catena di qualità e validazione incrociata dei quiz di ramo."""
import os
import pytest
from fastapi.testclient import TestClient

from formazione_api.generation.bozze import QuestionDraft
from formazione_api.generation.branch_quiz import BranchQuizDraft
from formazione_api.generation.errors import GenerationError
from formazione_api.main import create_app
from formazione_api.spesa_generazione import registro
from test_api import extraction, upload
from test_branch_quiz_routes import _prepara_ambiente_con_albero


class ScriptedBranchQuizProvider:
    provider_name = 'anthropic'
    model = 'claude-haiku-5-5'

    def __init__(self, batches: list[list[QuestionDraft]]):
        self.batches = list(batches)
        self.calls = []

    def genera(self, prompt: str):
        self.calls.append(prompt)
        if not self.batches:
            raise RuntimeError('Nessun altro batch programmato nel fake provider')
        return BranchQuizDraft(questions=self.batches.pop(0))


class FakeValidator:
    provider_name = 'groq'
    model = 'openai/gpt-oss-120b'

    def __init__(self, discordanti_per_chiamata: list[list[int]]):
        self.discordanti_per_chiamata = list(discordanti_per_chiamata)
        self.calls = []

    def verifica(self, chunk, domande):
        self.calls.append(domande)
        if self.discordanti_per_chiamata:
            return self.discordanti_per_chiamata.pop(0)
        return []


def _domanda(prompt: str, kind: str = 'single', source_ref: str = 'b1', options=None, rationales=None):
    if options is None:
        options = ['Opz A', 'Opz B']
    if rationales is None:
        rationales = ['R1', 'R2']
    return QuestionDraft(
        kind=kind,
        prompt=prompt,
        situation='',
        sentence='',
        wrong='',
        options=options,
        correctIndex=0,
        correctIndexes=[],
        correct=False,
        pairTerms=[],
        rationales=rationales,
        explanation='Spiegazione',
        sourceRefs=[source_ref],
        difficulty='base',
    )


def test_validatore_scarta_non_concordi_e_rigenera_deficit(tmp_path, monkeypatch):
    monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'openai/gpt-oss-120b')
    monkeypatch.setattr(
        'formazione_api.spesa_quiz_ramo.create_validator',
        lambda: FakeValidator([[1]]),  # scarta la seconda domanda (indice 1)
    )

    # Batch 1: 3 domande, la seconda sarà bocciata dal validatore -> ne restano 2 (< 3)
    # Batch 2: rigenerazione deficit di 1 domanda valida -> totale 3
    batch1 = [_domanda('D1'), _domanda('D2_bocciata'), _domanda('D3')]
    batch2 = [_domanda('D4_recuperata'), _domanda('D5'), _domanda('D6')]

    app = create_app(tmp_path)
    provider = ScriptedBranchQuizProvider([batch1, batch2])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 201, res.text
    data = res.json()

    # 3 domande accettate finali
    assert len(data['questions']) == 3
    prompts = [q['prompt'] for q in data['questions']]
    assert 'D1' in prompts
    assert 'D2_bocciata' not in prompts
    assert 'D3' in prompts
    assert 'D4_recuperata' in prompts

    # 2 chiamate di generazione effettuate (principale + deficit)
    assert len(provider.calls) == 2

    # Validatore sotto guardia: le sue chiamate sono prenotate e registrate nella corsa
    corse = registro(store).leggi()['corse']
    ruoli = [c.get('ruolo') for c in corse[-1]['chiamate']]
    assert ruoli.count('quiz_ramo') == 2
    assert ruoli.count('validazione_quiz_ramo') == 2
    for c in corse[-1]['chiamate']:
        assert 'addebitatoUSD' in c


def test_seconda_bocciatura_produce_warning_low_question_count(tmp_path, monkeypatch):
    monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'openai/gpt-oss-120b')
    # Il validatore boccia 2 domande su 3 al primo giro, e tutte al secondo giro
    monkeypatch.setattr(
        'formazione_api.spesa_quiz_ramo.create_validator',
        lambda: FakeValidator([[0, 1], [0, 1, 2]]),
    )

    batch1 = [_domanda('D1_ko'), _domanda('D2_ko'), _domanda('D3_ok')]
    batch2 = [_domanda('D4_ko'), _domanda('D5_ko'), _domanda('D6_ko')]

    app = create_app(tmp_path)
    provider = ScriptedBranchQuizProvider([batch1, batch2])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert len(data['questions']) == 1
    assert data['questions'][0]['prompt'] == 'D3_ok'
    assert 'LOW_QUESTION_COUNT' in data['warnings']


def test_fonti_inventate_singole_scartate_e_tutte_inventate_fatale(tmp_path, monkeypatch):
    monkeypatch.setattr('formazione_api.spesa_quiz_ramo.create_validator', lambda: None)

    # Caso 1: 1 domanda con fonte inventata viene scartata, le altre 3 passano
    batch_misto = [
        _domanda('D1_ok', source_ref='b1'),
        _domanda('D2_inventata', source_ref='b999_non_esiste'),
        _domanda('D3_ok', source_ref='b1'),
        _domanda('D4_ok', source_ref='b1'),
    ]

    app = create_app(tmp_path)
    provider1 = ScriptedBranchQuizProvider([batch_misto])
    app.state.generation_provider = provider1
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    res1 = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res1.status_code == 201
    prompts = [q['prompt'] for q in res1.json()['questions']]
    assert 'D2_inventata' not in prompts
    assert len(prompts) == 3

    # Caso 2: tutte le domande citano fonti non risolte -> invented_source fatale (502)
    ext_id2 = _prepara_ambiente_con_albero(client, store)
    batch_tutto_inventato = [
        _domanda('D1_ko', source_ref='p. 999'),
        _domanda('D2_ko', source_ref='b888'),
        _domanda('D3_ko', source_ref='b777'),
    ]
    provider2 = ScriptedBranchQuizProvider([batch_tutto_inventato])
    app.state.generation_provider = provider2

    res2 = client.post(
        f'/extractions/{ext_id2}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res2.status_code == 502
    assert res2.json()['detail']['code'] == 'invented_source'


def test_validatore_mal_configurato_nessuna_spesa(tmp_path, monkeypatch):
    """VALIDATION_PROVIDER uguale al generatore: create_validator rifiuta prima di pagare."""
    # Niente monkeypatch di create_validator: si usa quello reale.
    monkeypatch.setenv('GENERATION_PROVIDER', 'anthropic')
    monkeypatch.setenv('VALIDATION_PROVIDER', 'anthropic')

    app = create_app(tmp_path)
    provider = ScriptedBranchQuizProvider([[_domanda('D1'), _domanda('D2'), _domanda('D3')]])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)
    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 503
    assert res.json()['detail']['code'] == 'not_configured'
    # Nessuna chiamata al generatore: la configurazione invalida blocca a costo zero.
    assert len(provider.calls) == 0


def test_a1a_source_refs_normalizzati_a_id_blocco_nel_record(tmp_path):
    """A1a: domanda con sourceRefs ['p. 1', 'b1:10-20'] persistita con sourceRefs == ['b1']."""
    app = create_app(tmp_path)
    d1 = _domanda('D1', source_ref='p. 1')
    d1 = d1.model_copy(update={'sourceRefs': ['p. 1', 'b1:10-20']})
    d2 = _domanda('D2', source_ref='b1')
    d3 = _domanda('D3', source_ref='b1')
    provider = ScriptedBranchQuizProvider([[d1, d2, d3]])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 201
    quiz_data = res.json()
    assert quiz_data['questions'][0]['sourceRefs'] == ['b1']


def test_m6_chiama_compat_finish_reason_incompleto_solleva_502(tmp_path):
    """M6: fake compat con finish_reason='length' solleva GenerationError(provider_incomplete) mappato a 502."""
    from formazione_api.generation.branch_quiz import GeneratoreQuizRamo

    class FakeChoice:
        finish_reason = 'length'
        class Message:
            content = '{}'
            refusal = None
        message = Message()

    class FakeResponse:
        choices = [FakeChoice()]
        usage = None

    class FakeCompatClient:
        class Chat:
            class Completions:
                @staticmethod
                def create(**kwargs):
                    return FakeResponse()
            completions = Completions()
        chat = Chat()

    gen = GeneratoreQuizRamo('groq', client=FakeCompatClient(), model='openai/gpt-oss-120b')

    with pytest.raises(GenerationError) as exc:
        gen._chiama_compat('prompt test')
    assert exc.value.code == 'provider_incomplete'
    assert 'finish_reason=length' in str(exc.value)

    app = create_app(tmp_path)
    class ProviderWithM6:
        provider_name = 'groq'
        model = 'openai/gpt-oss-120b'
        def genera(self, prompt: str):
            raise GenerationError('provider_incomplete', 'Risposta AI incompleta (finish_reason=length); nessun quiz generato')
    app.state.generation_provider = ProviderWithM6()
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)
    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 502
    assert res.json()['detail']['code'] == 'provider_incomplete'


def test_rigenerazione_scarta_duplicata_con_regola_dedicata(tmp_path, monkeypatch):
    """11. Rigenerazione che ripropone una domanda già accettata → scartata 'duplicata_rigenerazione'."""
    monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'openai/gpt-oss-120b')
    monkeypatch.setattr(
        'formazione_api.spesa_quiz_ramo.create_validator',
        lambda: FakeValidator([[2], []]),
    )

    batch1 = [_domanda('Capitale della Francia?'), _domanda('Capitale d’Italia?'), _domanda('D3_ko')]
    batch2 = [_domanda('capitale della francia?'), _domanda('Capitale della Spagna?')]

    app = create_app(tmp_path)
    provider = ScriptedBranchQuizProvider([batch1, batch2])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert res.status_code == 201
    data = res.json()
    assert len(data['questions']) == 3
    prompts = [q['prompt'] for q in data['questions']]
    assert 'Capitale della Francia?' in prompts
    assert 'Capitale d’Italia?' in prompts
    assert 'Capitale della Spagna?' in prompts
    # 1 scartata dal validatore + 1 scartata per duplicazione
    assert data['validation']['discarded'] == 2

    # Verifica diretta del codice di scarto su genera_quiz_ramo_con_tetto
    from formazione_api.generation.branch_quiz import seleziona_blocchi
    from formazione_api.spesa_quiz_ramo import genera_quiz_ramo_con_tetto
    tree_rec = store.read(ext_id, 'concept-tree.json')
    ext_rec = store.read(ext_id, 'extraction.json')
    selezione = seleziona_blocchi(tree_rec['tree'], 'branch-1', None, ext_rec['blocks'])
    provider2 = ScriptedBranchQuizProvider([batch1, batch2])
    esito = genera_quiz_ramo_con_tetto(
        ext_rec,
        selezione['blocks'],
        provider2,
        store,
        branch_id='branch-1',
        node_id=None,
        tree_hash='hash_albero_valido',
        question_count=3,
        nodi_ramo=tree_rec['tree']['branches'][0]['nodes'],
        titolo_ramo='Concetti Introduttivi',
        corsa_id='corsa-direct-dup',
        extraction_id=ext_id,
        idempotency_key='k-direct-dup',
    )
    dup_scarti = [s for s in esito['scarti'] if s.get('rule') == 'duplicata_rigenerazione']
    assert len(dup_scarti) == 1
    assert dup_scarti[0]['prompt'] == 'capitale della francia?'


def test_question_count_6_con_deficit_rigenerato(tmp_path, monkeypatch):
    """Test con questionCount=6 e deficit: bozza iniziale da 4 -> deficit 2 rigenerato a 6."""
    monkeypatch.setattr('formazione_api.spesa_quiz_ramo.create_validator', lambda: None)

    batch1 = [_domanda(f'D_init_{i}') for i in range(1, 5)]
    batch2 = [_domanda(f'D_def_{i}') for i in range(1, 4)]

    app = create_app(tmp_path)
    provider = ScriptedBranchQuizProvider([batch1, batch2])
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store
    ext_id = _prepara_ambiente_con_albero(client, store)

    res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 6},
    )
    assert res.status_code == 201
    data = res.json()
    assert len(data['questions']) == 6
    assert len(provider.calls) == 2
