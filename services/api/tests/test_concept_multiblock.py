import json
import pytest
from formazione_api.generation.concept import (
    ConceptBranchDraft,
    ConceptMergeBranch,
    ConceptMergePlan,
    ConceptNodeDraft,
    ConceptTreeDraft,
)
from formazione_api.generation.concept_multiblock import (
    albero_multiblocco,
    conserva_chunk,
    impronta_chunk,
    leggi_cache,
)


def _blocco_pieno(idx: int, chars: int = 8000) -> dict:
    prefix = f'Contenuto didattico del blocco {idx}. '
    return {
        'id': f'b{idx}',
        'page': idx,
        'label': f'Pagina {idx}',
        'text': (prefix * (chars // len(prefix) + 1))[:chars],
        'kind': 'text',
    }


class FakeProvider:
    provider_name = 'fake'
    model = 'fake-model'


def test_nessuna_fusione_con_un_solo_chunk():
    blocks = [_blocco_pieno(1)]
    map_calls = []
    merge_calls = []

    def mock_map(chunk):
        map_calls.append(chunk)
        return ConceptTreeDraft(
            rootTitle='Architettura Unica',
            branches=[
                ConceptBranchDraft(
                    title='Unico Ramo',
                    nodes=[
                        ConceptNodeDraft(
                            title='Unico Nodo',
                            summary='Descrizione essenziale.',
                            sourceRefs=['b1'],
                        )
                    ],
                )
            ],
        )

    def mock_merge(payload):
        merge_calls.append(payload)
        return ConceptMergePlan(branches=[])

    res = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map,
        chiama_fusione=mock_merge,
    )

    assert len(map_calls) == 1
    assert len(merge_calls) == 0  # Nessuna fusione con 1 chunk
    assert res['complete'] is True
    assert res['warnings'] == []
    assert res['tree']['rootTitle'] == 'Architettura Unica'
    assert len(res['tree']['branches']) == 1
    branch = res['tree']['branches'][0]
    assert branch['id'] == 'branch-1'
    assert branch['nodes'][0]['id'] == 'node-1-1'
    assert branch['originBlocks'] == ['b1']
    assert branch['nodes'][0]['originBlocks'] == ['b1']


def test_fusione_meccanica_riparazione_e_unicita_rami():
    blocks = [_blocco_pieno(1), _blocco_pieno(2)]
    merge_calls = []

    def mock_map(chunk):
        return ConceptTreeDraft(
            rootTitle='Corso Base',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[
                        ConceptNodeDraft(
                            title=f'Nodo {chunk.id}',
                            summary=f'Sintesi {chunk.id}',
                            sourceRefs=[f'ref-{chunk.id}'],
                        )
                    ],
                )
            ],
        )

    def mock_merge(payload):
        merge_calls.append(payload)
        items = json.loads(payload)
        # Assegna il primo id, poi inserisce un id inesistente e duplica il primo id.
        # Il secondo ramo non viene assegnato nel piano.
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(
                    title='Gruppo Fuso',
                    memberBranchIds=[items[0]['id'], 'id-inesistente', items[0]['id']],
                )
            ]
        )

    res = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map,
        chiama_fusione=mock_merge,
    )

    assert len(merge_calls) == 1
    branches = res['tree']['branches']
    # 2 rami finali: il primo fuso (con 1 solo membro reale), il secondo autonomo in coda
    assert len(branches) == 2
    assert branches[0]['id'] == 'branch-1'
    assert branches[0]['title'] == 'Gruppo Fuso'
    assert branches[0]['nodes'][0]['title'] == 'Nodo chunk-1'

    # Ramo 2: non assegnato dal piano, diventa autonomo in coda
    assert branches[1]['id'] == 'branch-2'
    assert branches[1]['title'] == 'Ramo chunk-2'
    assert branches[1]['nodes'][0]['title'] == 'Nodo chunk-2'


def test_origin_blocks_e_source_refs_unione_membri():
    blocks = [_blocco_pieno(1), _blocco_pieno(2)]

    def mock_map(chunk):
        idx = chunk.id
        return ConceptTreeDraft(
            rootTitle='Integrazione',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {idx}',
                    nodes=[
                        ConceptNodeDraft(
                            title=f'Nodo {idx}',
                            summary='Sintesi',
                            sourceRefs=[f'b{idx[-1]}:10-20'],
                        )
                    ],
                )
            ],
        )

    def mock_merge(payload):
        items = json.loads(payload)
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(
                    title='Unione Completa',
                    memberBranchIds=[it['id'] for it in items],
                )
            ]
        )

    res = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map,
        chiama_fusione=mock_merge,
    )

    assert len(res['tree']['branches']) == 1
    branch = res['tree']['branches'][0]
    assert branch['title'] == 'Unione Completa'
    assert branch['originBlocks'] == ['b1', 'b2']
    assert len(branch['nodes']) == 2
    assert branch['nodes'][0]['id'] == 'node-1-1'
    assert branch['nodes'][1]['id'] == 'node-1-2'


def test_diciannove_chunks_fan_in_otto():
    blocks = [_blocco_pieno(i) for i in range(1, 20)]
    map_calls = []
    merge_calls = []

    def mock_map(chunk):
        map_calls.append(chunk)
        return ConceptTreeDraft(
            rootTitle='Radice 19',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[
                        ConceptNodeDraft(
                            title=f'Nodo {chunk.id}',
                            summary='Sintesi 19',
                            sourceRefs=['b1'],
                        )
                    ],
                )
            ],
        )

    def mock_merge(payload):
        merge_calls.append(payload)
        items = json.loads(payload)
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(
                    title=f'Fuso ({len(items)})',
                    memberBranchIds=[it['id'] for it in items],
                )
            ]
        )

    res = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map,
        chiama_fusione=mock_merge,
    )

    assert len(map_calls) == 19
    # Livello 1: 19 alberi divisi a gruppi di 8 -> 8, 8, 3 = 3 chiamate di fusione
    # Livello 2: 3 alberi rimasti divisi a gruppo di 8 -> 1 chiamata di fusione
    # Totale fusioni = 3 + 1 = 4
    assert len(merge_calls) == 4
    assert res['complete'] is True
    assert res['totalChunks'] == 19


def test_chunk_in_errore_e_ripresa_con_cache():
    blocks = [_blocco_pieno(1), _blocco_pieno(2), _blocco_pieno(3)]
    calls = []
    cache = {'schemaVersion': 1, 'chunks': {}}

    def mock_map(chunk):
        calls.append(chunk.id)
        if chunk.id == 'chunk-2':
            raise RuntimeError('Errore simulato API')
        return ConceptTreeDraft(
            rootTitle='Test Errore',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[ConceptNodeDraft(title='N', summary='S', sourceRefs=['b1'])],
                )
            ],
        )

    def mock_merge(payload):
        items = json.loads(payload)
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(title='Unificato', memberBranchIds=[it['id'] for it in items])
            ]
        )

    # Prima esecuzione: chunk-2 fallisce
    res1 = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map,
        chiama_fusione=mock_merge,
        cache=cache,
    )
    assert res1['complete'] is False
    assert 'BLOCK_FAILED:chunk-2' in res1['warnings']
    assert set(calls) == {'chunk-1', 'chunk-2', 'chunk-3'}
    assert 'chunk-1' in cache['chunks']
    assert 'chunk-3' in cache['chunks']
    assert 'chunk-2' not in cache['chunks']

    # Seconda esecuzione: chunk-2 ora funziona, chunk-1 e chunk-3 sono in cache
    calls.clear()

    def mock_map_ok(chunk):
        calls.append(chunk.id)
        return ConceptTreeDraft(
            rootTitle='Test Errore',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[ConceptNodeDraft(title='N', summary='S', sourceRefs=['b1'])],
                )
            ],
        )

    res2 = albero_multiblocco(
        blocks,
        FakeProvider(),
        chiama_mappa=mock_map_ok,
        chiama_fusione=mock_merge,
        cache=cache,
    )
    assert res2['complete'] is True
    assert res2['warnings'] == []
    assert calls == ['chunk-2']  # Solo chunk-2 ha chiamato il provider!
    assert res2['cachedChunks'] == 2


def test_stesso_input_stesso_tree_hash_e_id_stabili():
    blocks = [_blocco_pieno(1), _blocco_pieno(2)]

    def mock_map(chunk):
        return ConceptTreeDraft(
            rootTitle='Stabilità',
            branches=[
                ConceptBranchDraft(
                    title=f'Ramo {chunk.id}',
                    nodes=[
                        ConceptNodeDraft(title=f'Nodo A {chunk.id}', summary='S', sourceRefs=['b1']),
                        ConceptNodeDraft(title=f'Nodo B {chunk.id}', summary='S', sourceRefs=['b2']),
                    ],
                )
            ],
        )

    def mock_merge(payload):
        items = json.loads(payload)
        return ConceptMergePlan(
            branches=[
                ConceptMergeBranch(title='Ramo Unico', memberBranchIds=[it['id'] for it in items])
            ]
        )

    res_a = albero_multiblocco(blocks, FakeProvider(), chiama_mappa=mock_map, chiama_fusione=mock_merge, impronta_comune='salt1')
    res_b = albero_multiblocco(blocks, FakeProvider(), chiama_mappa=mock_map, chiama_fusione=mock_merge, impronta_comune='salt1')

    assert res_a['treeHash'] == res_b['treeHash']
    branches = res_a['tree']['branches']
    assert branches[0]['id'] == 'branch-1'
    assert branches[0]['nodes'][0]['id'] == 'node-1-1'
    assert branches[0]['nodes'][1]['id'] == 'node-1-2'
    assert branches[0]['nodes'][2]['id'] == 'node-1-3'
    assert branches[0]['nodes'][3]['id'] == 'node-1-4'


def test_persistenza_cache_atomica(tmp_path):
    ext_id = 'c' * 32
    c = leggi_cache(tmp_path, ext_id)
    assert c == {'schemaVersion': 1, 'chunks': {}}

    albero_finto = {'rootTitle': 'T', 'branches': []}
    conserva_chunk(tmp_path, ext_id, 'chunk-1', 'impronta-1', albero_finto)
    c2 = leggi_cache(tmp_path, ext_id)
    assert 'chunk-1' in c2['chunks']
    assert c2['chunks']['chunk-1']['impronta'] == 'impronta-1'
    assert c2['chunks']['chunk-1']['albero'] == albero_finto
