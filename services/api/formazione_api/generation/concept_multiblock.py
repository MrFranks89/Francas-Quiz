"""Motore multi-blocco per la mappa concettuale con cache atomica e fusione gerarchica."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import re

from .chunks import Chunk, plan_chunks
from .concept import ConceptMergePlan, ISTRUZIONI_CONCEPT_TREE
from .errors import GenerationError
from .instructions import materiale

SUFFISSO_CACHE = 'concept-cache.json'


def _hash(valore) -> str:
    testo = valore if isinstance(valore, str) else json.dumps(valore, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(testo.encode('utf-8')).hexdigest()


def percorso_cache(store_root, extraction_id: str) -> Path | None:
    if not isinstance(extraction_id, str) or not re.fullmatch(r'[a-f0-9]{32}', extraction_id):
        return None
    return Path(store_root) / f'{extraction_id}.{SUFFISSO_CACHE}'


def leggi_cache(store_root, extraction_id: str) -> dict:
    p = percorso_cache(store_root, extraction_id)
    if p is None or not p.exists():
        return {'schemaVersion': 1, 'chunks': {}}
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
        if isinstance(data, dict) and isinstance(data.get('chunks'), dict):
            return data
    except (OSError, ValueError):
        pass
    return {'schemaVersion': 1, 'chunks': {}}


def conserva_chunk(store_root, extraction_id: str, chunk_id: str, impronta: str, albero: dict) -> None:
    p = percorso_cache(store_root, extraction_id)
    if p is None:
        return
    data = leggi_cache(store_root, extraction_id)
    chunks_dict = data.setdefault('chunks', {})
    chunks_dict[chunk_id] = {'impronta': impronta, 'albero': albero}
    tmp_path = p.with_suffix('.tmp')
    try:
        tmp_path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        os.replace(tmp_path, p)
    except OSError:
        pass


def impronta_chunk(fornitore: str, modello: str, chunk: Chunk) -> str:
    return _hash({
        'versione': 1,
        'fornitore': fornitore,
        'modello': modello,
        'istruzioni': _hash(ISTRUZIONI_CONCEPT_TREE),
        'materiale': _hash(materiale(chunk)),
    })


def _fondi_gruppo(trees: list[dict], chiama_fusione) -> dict:
    """Fonde fino a 8 alberi parziali in un unico albero fuso tramite chiamata assistita."""
    if len(trees) == 1:
        return trees[0]

    branches_by_id = {}
    compact_payload = []
    for t in trees:
        for b in t.get('branches', []):
            bid = b['id']
            branches_by_id[bid] = b
            first_node_summary = ''
            if b.get('nodes'):
                first_node_summary = str(b['nodes'][0].get('summary', ''))[:120]
            compact_payload.append({
                'id': bid,
                'title': b.get('title', ''),
                'summary': first_node_summary,
            })

    raw_piano = chiama_fusione(json.dumps(compact_payload, ensure_ascii=False))
    piano = raw_piano if isinstance(raw_piano, ConceptMergePlan) else ConceptMergePlan.model_validate(raw_piano)

    assigned_ids = set()
    merged_branches = []

    for mb in piano.branches:
        member_nodes = []
        member_origin_blocks = set()
        member_source_refs = set()
        valid_members = []

        for bid in mb.memberBranchIds:
            if bid not in branches_by_id or bid in assigned_ids:
                continue
            assigned_ids.add(bid)
            valid_members.append(bid)
            orig_branch = branches_by_id[bid]
            for node in orig_branch.get('nodes', []):
                member_nodes.append(deepcopy(node))
            member_origin_blocks.update(orig_branch.get('originBlocks', []))
            for node in orig_branch.get('nodes', []):
                member_origin_blocks.update(node.get('originBlocks', []))
                member_source_refs.update(node.get('sourceRefs', []))

        if valid_members:
            merged_branches.append({
                'id': f'merged-{len(merged_branches)+1}',
                'title': mb.title,
                'originBlocks': sorted(member_origin_blocks),
                'sourceRefs': sorted(member_source_refs),
                'nodes': member_nodes,
            })

    # Riparazione meccanica: rami mai assegnati diventano rami autonomi in coda
    for b in branches_by_id.values():
        if b['id'] not in assigned_ids:
            assigned_ids.add(b['id'])
            merged_branches.append(deepcopy(b))

    root_title = trees[0].get('rootTitle', '') if trees else ''
    return {'rootTitle': root_title, 'branches': merged_branches}


def _fusione_gerarchica(trees: list[dict], chiama_fusione, fan_in: int = 8) -> dict:
    """Esegue la riduzione ad albero gerarchica con fan-in specificato."""
    if not trees:
        return {'rootTitle': '', 'branches': []}
    current = trees
    while len(current) > 1:
        next_level = []
        for i in range(0, len(current), fan_in):
            group = current[i:i + fan_in]
            next_level.append(_fondi_gruppo(group, chiama_fusione))
        current = next_level
    return current[0]


def albero_multiblocco(blocks: list[dict], provider, *, chiama_mappa, chiama_fusione,
                       cache: dict | None = None, impronta_comune: str = '',
                       store_root: Path | None = None, extraction_id: str | None = None) -> dict:
    """Estrae l'albero concettuale per tutti i blocchi con orchestrazione MAP + REDUCE."""
    chunks = plan_chunks(blocks)
    if not chunks:
        tree = {'rootTitle': '', 'branches': []}
        tree_hash = _hash(json.dumps(tree, sort_keys=True, ensure_ascii=False) + impronta_comune)
        return {
            'tree': tree,
            'treeHash': tree_hash,
            'complete': True,
            'warnings': [],
            'cachedChunks': 0,
            'totalChunks': 0,
        }

    fornitore = getattr(provider, 'provider_name', '')
    modello = getattr(provider, 'model', '')

    partial_trees = []
    cached_chunks = 0
    warnings = []
    complete = True

    for chunk in chunks:
        chunk_source_ids = sorted(set(p.source_id for p in chunk.pieces))
        impronta_attesa = impronta_chunk(fornitore, modello, chunk) if fornitore and modello else None
        cached_entry = cache.get('chunks', {}).get(chunk.id) if cache else None

        albero_dict = None
        if cached_entry and isinstance(cached_entry, dict) and 'albero' in cached_entry:
            if impronta_attesa is None or cached_entry.get('impronta') == impronta_attesa or not cached_entry.get('impronta'):
                albero_dict = deepcopy(cached_entry['albero'])
                cached_chunks += 1

        if albero_dict is None:
            try:
                res = chiama_mappa(chunk)
                albero_dict = res.model_dump() if hasattr(res, 'model_dump') else deepcopy(res)
                if cache is not None:
                    cache.setdefault('chunks', {})[chunk.id] = {
                        'impronta': impronta_attesa or '',
                        'albero': deepcopy(albero_dict),
                    }
                if store_root is not None and extraction_id:
                    conserva_chunk(store_root, extraction_id, chunk.id, impronta_attesa or '', deepcopy(albero_dict))
            except Exception as error:
                if isinstance(error, GenerationError) and error.code == 'budget_guard':
                    raise
                if chunk == chunks[0] and cached_chunks == 0:
                    if isinstance(error, GenerationError):
                        raise
                    raise GenerationError('provider_failed', str(error)) from error
                complete = False
                warnings.append(f'BLOCK_FAILED:{chunk.id}')
                continue

        # Marcatura deterministica originBlocks su rami e nodi
        for b_idx, branch in enumerate(albero_dict.get('branches', [])):
            branch['originBlocks'] = list(chunk_source_ids)
            branch['id'] = f'{chunk.id}-b{b_idx+1}'
            for node in branch.get('nodes', []):
                node['originBlocks'] = list(chunk_source_ids)

        partial_trees.append(albero_dict)

    if not partial_trees:
        tree = {'rootTitle': '', 'branches': []}
        tree_hash = _hash(json.dumps(tree, sort_keys=True, ensure_ascii=False) + impronta_comune)
        return {
            'tree': tree,
            'treeHash': tree_hash,
            'complete': False,
            'warnings': warnings,
            'cachedChunks': cached_chunks,
            'totalChunks': len(chunks),
        }

    # Riduzione con fusione gerarchica (se 1 solo albero, nessuna fusione)
    if len(partial_trees) == 1:
        merged_tree = partial_trees[0]
    else:
        merged_tree = _fusione_gerarchica(partial_trees, chiama_fusione, fan_in=8)

    # Assegnazione id stabili finali
    root_title = partial_trees[0].get('rootTitle', '')
    final_branches = []
    for k, branch in enumerate(merged_tree.get('branches', []), start=1):
        final_branch_id = f'branch-{k}'
        final_nodes = []
        for j, node in enumerate(branch.get('nodes', []), start=1):
            final_node_id = f'node-{k}-{j}'
            node_dict = deepcopy(node)
            node_dict['id'] = final_node_id
            node_dict['originBlocks'] = sorted(set(node_dict.get('originBlocks', [])))
            final_nodes.append(node_dict)

        b_dict = {
            'id': final_branch_id,
            'title': branch.get('title', f'Ramo {k}'),
            'originBlocks': sorted(set(branch.get('originBlocks', []))),
            'nodes': final_nodes,
        }
        if branch.get('description'):
            b_dict['description'] = branch['description']
        final_branches.append(b_dict)

    final_tree = {
        'rootTitle': root_title,
        'branches': final_branches,
    }

    canonical_json = json.dumps(final_tree, sort_keys=True, ensure_ascii=False)
    tree_hash = _hash(canonical_json + impronta_comune)

    return {
        'tree': final_tree,
        'treeHash': tree_hash,
        'complete': complete,
        'warnings': warnings,
        'cachedChunks': cached_chunks,
        'totalChunks': len(chunks),
    }
