"""Test unitari per la selezione dei blocchi, persistenza e idempotenza dei quiz di ramo."""
import json
import os
import pytest

from formazione_api.generation.branch_quiz import (
    BranchQuizDraft,
    MAX_BLOCCHI_RAMO,
    aggiungi_quiz,
    chiave_idempotenza,
    elimina_quiz,
    leggi_quiz,
    prompt_quiz_ramo,
    seleziona_blocchi,
)
from formazione_api.generation.errors import GenerationError


@pytest.fixture
def sample_tree():
    return {
        'rootTitle': 'Documento Didattico',
        'treeHash': 'hash1234567890abcdef',
        'branches': [
            {
                'id': 'branch-1',
                'title': 'Concetti Fondamentali',
                'originBlocks': ['b1', 'b2'],
                'nodes': [
                    {
                        'id': 'node-1-1',
                        'title': 'Definizioni Iniziali',
                        'summary': 'Quadro di base delle definizioni',
                        'originBlocks': ['b1'],
                        'sourceRefs': ['p. 1', 'b3'],
                    },
                    {
                        'id': 'node-1-2',
                        'title': 'Regole Applicative',
                        'summary': 'Sintesi delle regole pratiche',
                        'originBlocks': ['b2', 'b4'],
                        'sourceRefs': ['pp. 2-3'],
                    },
                ],
            },
            {
                'id': 'branch-2',
                'title': 'Ramo Vuoto di Fonti',
                'originBlocks': [],
                'nodes': [
                    {
                        'id': 'node-2-1',
                        'title': 'Nodo Isolato',
                        'summary': 'Nessun riferimento',
                        'originBlocks': [],
                        'sourceRefs': [],
                    }
                ],
            },
        ],
    }


@pytest.fixture
def sample_blocks():
    return [
        {'id': 'b1', 'page': 1, 'label': 'Pagina 1', 'text': 'Testo blocco 1'},
        {'id': 'b2', 'page': 2, 'label': 'Pagina 2', 'text': 'Testo blocco 2'},
        {'id': 'b3', 'page': 2, 'label': 'Pagina 2 (continuazione)', 'text': 'Testo blocco 3'},
        {'id': 'b4', 'page': 3, 'label': 'Pagina 3', 'text': 'Testo blocco 4'},
        {'id': 'b5', 'page': 4, 'label': 'Pagina 4', 'text': 'Testo blocco 5'},
    ]


def test_seleziona_blocchi_ramo_inesistente(sample_tree, sample_blocks):
    with pytest.raises(GenerationError) as exc:
        seleziona_blocchi(sample_tree, 'branch-999', None, sample_blocks)
    assert exc.value.code == 'branch_not_found'


def test_seleziona_blocchi_nodo_inesistente(sample_tree, sample_blocks):
    with pytest.raises(GenerationError) as exc:
        seleziona_blocchi(sample_tree, 'branch-1', 'node-9-9', sample_blocks)
    assert exc.value.code == 'branch_not_found'


def test_seleziona_blocchi_unione_refs_dedup_e_ordine(sample_tree, sample_blocks):
    # node-1-1: originBlocks ['b1'], sourceRefs ['p. 1' -> b1, 'b3' -> b3]
    res = seleziona_blocchi(sample_tree, 'branch-1', 'node-1-1', sample_blocks)
    b_ids = [b['id'] for b in res['blocks']]
    assert b_ids == ['b1', 'b3']
    assert res['warnings'] == []


def test_seleziona_blocchi_troncamento_a_tre_con_warning(sample_tree, sample_blocks):
    # branch-1 cita b1, b2, b3, b4 (> MAX_BLOCCHI_RAMO = 3)
    res = seleziona_blocchi(sample_tree, 'branch-1', None, sample_blocks)
    assert len(res['blocks']) == 3
    assert any('BLOCKS_TRUNCATED:4' in w for w in res['warnings'])
    b_ids = [b['id'] for b in res['blocks']]
    # Gli id esatti sopravvissuti per rank e ordine documento
    assert b_ids == ['b1', 'b2', 'b3']


def test_seleziona_blocchi_zero_blocchi_solleva_errore(sample_tree, sample_blocks):
    with pytest.raises(GenerationError) as exc:
        seleziona_blocchi(sample_tree, 'branch-2', None, sample_blocks)
    assert exc.value.code == 'no_source_blocks'


def test_chiave_idempotenza_stabilita_e_sensibilita():
    ext_id = 'a' * 32
    k1 = chiave_idempotenza(ext_id, 'branch-1', None, 'tree_hash_1', 4)
    k2 = chiave_idempotenza(ext_id, 'branch-1', None, 'tree_hash_1', 4)
    assert k1 == k2

    # Cambio questionCount
    k3 = chiave_idempotenza(ext_id, 'branch-1', None, 'tree_hash_1', 5)
    assert k1 != k3

    # Cambio treeHash
    k4 = chiave_idempotenza(ext_id, 'branch-1', None, 'tree_hash_2', 4)
    assert k1 != k4

    # Cambio node_id
    k5 = chiave_idempotenza(ext_id, 'branch-1', 'node-1-1', 'tree_hash_1', 4)
    assert k1 != k5


def test_persistenza_quiz_roundtrip_e_file_rovinato(tmp_path):
    store_root = str(tmp_path)
    ext_id = '0123456789abcdef0123456789abcdef'

    # Nessun quiz all'inizio
    assert leggi_quiz(store_root, ext_id) == []

    record1 = {
        'quizId': 'quiz-1',
        'branchId': 'branch-1',
        'nodeId': None,
        'treeHash': 'thash',
        'questionCount': 3,
        'questions': [],
    }
    aggiungi_quiz(store_root, ext_id, record1)
    letti = leggi_quiz(store_root, ext_id)
    assert len(letti) == 1
    assert letti[0]['quizId'] == 'quiz-1'

    record2 = {
        'quizId': 'quiz-2',
        'branchId': 'branch-2',
        'nodeId': None,
        'treeHash': 'thash',
        'questionCount': 4,
        'questions': [],
    }
    aggiungi_quiz(store_root, ext_id, record2)
    letti2 = leggi_quiz(store_root, ext_id)
    assert len(letti2) == 2

    # Eliminazione
    assert elimina_quiz(store_root, ext_id, 'quiz-1') is True
    assert len(leggi_quiz(store_root, ext_id)) == 1
    assert elimina_quiz(store_root, ext_id, 'inesistente') is False

    # File rovinato (non valido): leggi_quiz tollera, aggiungi_quiz rinomina in .corrotto
    path = os.path.join(store_root, f'{ext_id}.branch-quizzes.json')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('NOT VALID JSON {{{')
    assert leggi_quiz(store_root, ext_id) == []
    aggiungi_quiz(store_root, ext_id, {'quizId': 'quiz-recovered', 'branchId': 'b1', 'treeHash': 'th', 'questionCount': 3})
    assert os.path.exists(f'{path}.corrotto')
    assert [q['quizId'] for q in leggi_quiz(store_root, ext_id)] == ['quiz-recovered']


def test_prompt_quiz_ramo_struttura(sample_blocks):
    nodi = [{'id': 'n1', 'title': 'Titolo N', 'summary': 'Sommario N'}]
    blocchi = sample_blocks[:2]
    prompt = prompt_quiz_ramo('Ramo Test', nodi, blocchi, 4)
    assert 'Ramo concettuale: Ramo Test' in prompt
    assert '- [n1] Titolo N: Sommario N' in prompt
    assert '### Blocco b1 (p. 1):' in prompt
    assert 'esattamente 4 domande' in prompt


def test_prompt_quiz_ramo_blocco_senza_pagina():
    nodi = [{'id': 'n1', 'title': 'Titolo N', 'summary': 'Sommario N'}]
    blocchi = [{'id': 'b1', 'page': None, 'text': 'Testo blocco 1'}]
    prompt = prompt_quiz_ramo('Ramo Test', nodi, blocchi, 3)
    assert '### Blocco b1:\nTesto blocco 1' in prompt
    assert '### Blocco b1 (' not in prompt
