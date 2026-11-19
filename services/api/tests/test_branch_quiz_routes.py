"""Test HTTP per le rotte dei quiz di ramo: preview, generazione, lista ed eliminazione."""
import json
import pytest
from fastapi.testclient import TestClient

from formazione_api.generation.bozze import QuestionDraft
from formazione_api.generation.branch_quiz import BranchQuizDraft
from formazione_api.main import create_app
from formazione_api.spesa_generazione import registro
from test_api import extraction, upload


class FakeBranchQuizProvider:
    provider_name = 'anthropic'
    model = 'claude-haiku-5-5'

    def __init__(self, questions=None):
        self.calls = []
        self.questions = questions or [
            QuestionDraft(
                kind='single',
                prompt='Qual è la definizione corretta?',
                situation='',
                sentence='',
                wrong='',
                options=['Opzione A', 'Opzione B'],
                correctIndex=0,
                correctIndexes=[],
                correct=False,
                pairTerms=[],
                rationales=['Spiegazione A', 'Spiegazione B'],
                explanation='Spiegazione estesa',
                sourceRefs=['b1'],
                difficulty='base',
            ),
            QuestionDraft(
                kind='truefalse',
                prompt='Affermazione fondamentale vera.',
                situation='',
                sentence='',
                wrong='',
                options=[],
                correctIndex=0,
                correctIndexes=[],
                correct=True,
                pairTerms=[],
                rationales=[],
                explanation='Spiegazione vero falso',
                sourceRefs=['b1'],
                difficulty='base',
            ),
            QuestionDraft(
                kind='fillblank',
                prompt='Completamento di una ___ chiave.',
                situation='',
                sentence='',
                wrong='',
                options=['parola', 'frase'],
                correctIndex=0,
                correctIndexes=[],
                correct=False,
                pairTerms=[],
                rationales=['Giusto', 'Sbagliato'],
                explanation='Spiegazione fillblank',
                sourceRefs=['b1'],
                difficulty='medio',
            ),
        ]

    def genera(self, prompt: str):
        self.calls.append(prompt)
        return BranchQuizDraft(questions=self.questions)


def _prepara_ambiente_con_albero(client, store, complete=True, tree_hash='hash_albero_valido'):
    doc = upload(client, 'lezione.txt', b'Testo del blocco uno per il quiz. Ancora testo didattico di approfondimento.')
    ext = extraction(client, doc, {'mode': 'all'}).json()
    ext_id = ext['id']

    tree_record = {
        'treeHash': tree_hash,
        'complete': complete,
        'tree': {
            'rootTitle': 'Corso Base',
            'branches': [
                {
                    'id': 'branch-1',
                    'title': 'Concetti Introduttivi',
                    'originBlocks': ['b1'],
                    'nodes': [
                        {
                            'id': 'node-1-1',
                            'title': 'Nodo Uno',
                            'summary': 'Sintesi del nodo uno',
                            'originBlocks': ['b1'],
                            'sourceRefs': ['b1'],
                        }
                    ],
                },
                {
                    'id': 'branch-senza-blocchi',
                    'title': 'Ramo Vuoto',
                    'originBlocks': [],
                    'nodes': [],
                },
            ],
        },
        'warnings': [],
    }
    store.save(ext_id, 'concept-tree.json', tree_record)
    return ext_id


def test_percorso_felice_201_e_preview_senza_registro(tmp_path):
    app = create_app(tmp_path)
    provider = FakeBranchQuizProvider()
    app.state.generation_provider = provider
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    # Preview
    preview_res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz/preview',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert preview_res.status_code == 200, preview_res.text
    prev_data = preview_res.json()
    assert prev_data['blockIds'] == ['b1']
    assert prev_data['fitsBudget'] is True
    assert prev_data['warnings'] == []

    # Verifica: preview non ha scritto sul registro
    assert len(registro(store).leggi()['corse']) == 0

    # Generazione 201
    gen_res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3},
    )
    assert gen_res.status_code == 201, gen_res.text
    quiz_data = gen_res.json()
    assert quiz_data['quizId'] != ''
    assert quiz_data['branchId'] == 'branch-1'
    assert quiz_data['treeHash'] == 'hash_albero_valido'
    assert len(quiz_data['questions']) == 3
    assert quiz_data['questions'][0]['id'] == 'question-p1'
    assert quiz_data['questions'][1]['id'] == 'question-p2'
    assert quiz_data['questions'][2]['id'] == 'question-p3'

    # Registro aggiornato con la corsa
    corse = registro(store).leggi()['corse']
    assert len(corse) == 1
    assert corse[0]['ruolo'] == 'quiz_ramo'


def test_errori_albero_stale_e_not_ready(tmp_path):
    app = create_app(tmp_path)
    app.state.generation_provider = FakeBranchQuizProvider()
    client = TestClient(app)
    store = app.state.store

    # 1. Albero assente -> 409 TREE_NOT_READY
    doc = upload(client, 'altro.txt', b'Altro testo')
    ext_id = extraction(client, doc, {'mode': 'all'}).json()['id']
    res = client.post(f'/extractions/{ext_id}/concept-tree/quiz', json={'branchId': 'b1', 'treeHash': 'h', 'questionCount': 3})
    assert res.status_code == 409
    assert res.json()['detail']['code'] == 'TREE_NOT_READY'

    # 2. Albero con complete=false -> 409 TREE_NOT_READY
    ext_id2 = _prepara_ambiente_con_albero(client, store, complete=False)
    res2 = client.post(f'/extractions/{ext_id2}/concept-tree/quiz', json={'branchId': 'branch-1', 'treeHash': 'hash_albero_valido', 'questionCount': 3})
    assert res2.status_code == 409
    assert res2.json()['detail']['code'] == 'TREE_NOT_READY'

    # 3. treeHash disallineato -> 409 TREE_STALE
    ext_id3 = _prepara_ambiente_con_albero(client, store, complete=True, tree_hash='hash_nuovo')
    res3 = client.post(f'/extractions/{ext_id3}/concept-tree/quiz', json={'branchId': 'branch-1', 'treeHash': 'hash_vecchio', 'questionCount': 3})
    assert res3.status_code == 409
    assert res3.json()['detail']['code'] == 'TREE_STALE'


def test_ramo_inesistente_e_zero_blocchi(tmp_path):
    app = create_app(tmp_path)
    app.state.generation_provider = FakeBranchQuizProvider()
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store)

    # Ramo inesistente -> 404
    res_404 = client.post(f'/extractions/{ext_id}/concept-tree/quiz', json={'branchId': 'branch-inesistente', 'treeHash': 'hash_albero_valido', 'questionCount': 3})
    assert res_404.status_code == 404
    assert res_404.json()['detail']['code'] == 'BRANCH_NOT_FOUND'

    # Ramo senza blocchi -> 422
    res_422 = client.post(f'/extractions/{ext_id}/concept-tree/quiz', json={'branchId': 'branch-senza-blocchi', 'treeHash': 'hash_albero_valido', 'questionCount': 3})
    assert res_422.status_code == 422
    assert res_422.json()['detail']['code'] == 'NO_SOURCE_BLOCKS'


def test_get_lista_con_stale_e_delete(tmp_path):
    app = create_app(tmp_path)
    app.state.generation_provider = FakeBranchQuizProvider()
    client = TestClient(app)
    store = app.state.store

    ext_id = _prepara_ambiente_con_albero(client, store, tree_hash='hash_v1')

    # Creiamo un quiz
    gen_res = client.post(
        f'/extractions/{ext_id}/concept-tree/quiz',
        json={'branchId': 'branch-1', 'treeHash': 'hash_v1', 'questionCount': 3},
    )
    assert gen_res.status_code == 201
    quiz_id = gen_res.json()['quizId']

    # GET: non è stale
    list_res = client.get(f'/extractions/{ext_id}/concept-tree/quiz')
    assert list_res.status_code == 200
    quizzes = list_res.json()
    assert len(quizzes) == 1
    assert quizzes[0]['quizId'] == quiz_id
    assert quizzes[0]['stale'] is False

    # Modifichiamo l'albero per farlo diventare stale
    tree_rec = store.read(ext_id, 'concept-tree.json')
    tree_rec['treeHash'] = 'hash_v2_modificato'
    store.save(ext_id, 'concept-tree.json', tree_rec)

    # GET: ora è stale
    list_res2 = client.get(f'/extractions/{ext_id}/concept-tree/quiz')
    assert list_res2.status_code == 200
    assert list_res2.json()[0]['stale'] is True

    # DELETE
    del_res = client.delete(f'/extractions/{ext_id}/concept-tree/quiz/{quiz_id}')
    assert del_res.status_code == 200
    assert del_res.json() == {'ok': True}

    # Verifica cancellazione
    list_res3 = client.get(f'/extractions/{ext_id}/concept-tree/quiz')
    assert len(list_res3.json()) == 0

    # Delete 404 per id non trovato
    del_404 = client.delete(f'/extractions/{ext_id}/concept-tree/quiz/{quiz_id}')
    assert del_404.status_code == 404
