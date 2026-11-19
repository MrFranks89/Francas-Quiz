import pytest
from formazione_api.generation.source_refs import resolve_source_refs

SAMPLE_BLOCKS = [
    {'id': 'b1', 'text': 'Intro', 'page': 1, 'label': 'Pagina 1', 'kind': 'text'},
    {'id': 'b2', 'text': 'Definizioni', 'page': 1, 'label': 'Pagina 1', 'kind': 'text'},
    {'id': 'b3', 'text': 'Teorema', 'page': 2, 'label': 'Pagina 2', 'kind': 'text'},
    {'id': 'b4', 'text': 'Corollario A', 'page': 3, 'label': 'Pagina 3', 'kind': 'text'},
    {'id': 'b5', 'text': 'Corollario B', 'page': 4, 'label': 'Pagina 4', 'kind': 'text'},
    {'id': 'b6', 'text': 'Appendice senza pagina', 'page': None, 'label': 'Appendice', 'kind': 'text'},
]


def test_lista_vuota():
    res = resolve_source_refs([], SAMPLE_BLOCKS)
    assert res == {'blockIds': [], 'unresolved': [], 'levels': {}}

    res2 = resolve_source_refs(['b1'], [])
    assert res2 == {'blockIds': [], 'unresolved': ['b1'], 'levels': {}}


@pytest.mark.parametrize('ref,expected_ids,expected_level', [
    ('b3', ['b3'], 'block'),
    ('B3', ['b3'], 'block'),
    ('b3:120-450', ['b3'], 'block'),
    ('  B3:120-450  ', ['b3'], 'block'),
    ('p. 1', ['b1', 'b2'], 'page'),
    ('pag 1', ['b1', 'b2'], 'page'),
    ('pagina 1', ['b1', 'b2'], 'page'),
    ('page-1', ['b1', 'b2'], 'page'),
    ('PAGINA 2', ['b3'], 'page'),
    ('page-1:10-50', ['b1', 'b2'], 'page'),
    ('pp. 3-5', ['b4', 'b5'], 'page'),
    ('page-3..5', ['b4', 'b5'], 'page'),
    ('pagine 3-4', ['b4', 'b5'], 'page'),
])
def test_forme_grammatica_valide(ref, expected_ids, expected_level):
    res = resolve_source_refs([ref], SAMPLE_BLOCKS)
    assert res['blockIds'] == expected_ids
    assert res['unresolved'] == []
    assert res['levels'][ref] == expected_level


def test_intervallo_a_cavallo_di_piu_blocchi():
    res = resolve_source_refs(['pp. 1-3'], SAMPLE_BLOCKS)
    assert res['blockIds'] == ['b1', 'b2', 'b3', 'b4']
    assert res['levels']['pp. 1-3'] == 'page'


@pytest.mark.parametrize('bad_ref', [
    'b999',
    'b999:10-20',
    'p. 99',
    'page-99..100',
    '',
    '   ',
    'capitolo 1',
    'nota-al-testo',
    '123',
])
def test_refs_irrisolti(bad_ref):
    res = resolve_source_refs([bad_ref], SAMPLE_BLOCKS)
    assert res['blockIds'] == []
    assert res['unresolved'] == [bad_ref]
    assert bad_ref not in res['levels']


def test_blocco_senza_pagina_risolto_solo_per_id():
    res_id = resolve_source_refs(['b6'], SAMPLE_BLOCKS)
    assert res_id['blockIds'] == ['b6']
    assert res_id['levels']['b6'] == 'block'

    # Nessuna pagina 0 o None cattura b6
    res_page = resolve_source_refs(['p. 0', 'page-10'], SAMPLE_BLOCKS)
    assert 'b6' not in res_page['blockIds']


def test_deduplicazione_e_ordinamento_posizionale():
    # Passiamo i ref in ordine inverso rispetto ai blocchi
    refs = ['page-4', 'b2', 'p. 1', 'b3']
    res = resolve_source_refs(refs, SAMPLE_BLOCKS)
    # L'ordinamento deve rispettare la posizione nei blocchi (b1, b2, b3, b5)
    assert res['blockIds'] == ['b1', 'b2', 'b3', 'b5']
    assert set(res['unresolved']) == set()
    assert res['levels']['b2'] == 'block'
    assert res['levels']['page-4'] == 'page'
    assert res['levels']['p. 1'] == 'page'
