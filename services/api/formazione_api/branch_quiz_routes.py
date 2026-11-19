"""Rotte HTTP per la preview, generazione, elenco ed eliminazione dei quiz mirati di ramo."""
import os
import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from .generation.branch_quiz import (
    aggiungi_quiz,
    chiave_idempotenza,
    elimina_quiz,
    leggi_quiz,
    seleziona_blocchi,
)
from .generation.errors import GenerationError
from .generation_routes import _generation_http_error
from .measurement.guardia import adesso
from .routes import read_record
from .spesa_generazione import (
    SpesaRifiuto,
    _usd,
    fornitore_e_modello,
    limiti_configurati,
    registro,
)
from .spesa_quiz_ramo import (
    decidi_quiz,
    genera_quiz_ramo_con_tetto,
    valuta_quiz_ramo,
)

router = APIRouter()


class BranchQuizPreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    branchId: str = Field(min_length=1)
    nodeId: str | None = None
    treeHash: str | None = None
    questionCount: StrictInt = Field(default=3, ge=3, le=6)


class BranchQuizRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    branchId: str = Field(min_length=1)
    nodeId: str | None = None
    treeHash: str = Field(min_length=1)
    questionCount: StrictInt = Field(default=3, ge=3, le=6)
    idempotencyKey: str | None = None


@router.post('/extractions/{identifier}/concept-tree/quiz/preview', status_code=200)
def preview_quiz(identifier: str, request: Request, body: BranchQuizPreviewRequest) -> dict[str, Any]:
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')

    try:
        record_tree = store.read(identifier, 'concept-tree.json')
    except Exception:
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non ancora generata.'})

    if not record_tree.get('complete', True):
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non completata o parziale.'})

    current_tree_hash = record_tree.get('treeHash', '')
    if body.treeHash and body.treeHash != current_tree_hash:
        raise HTTPException(409, {'code': 'TREE_STALE', 'message': 'La mappa concettuale è cambiata; aggiornare prima di procedere.'})

    tree = record_tree.get('tree', {})
    branches = tree.get('branches', [])
    target_branch = next((b for b in branches if b.get('id') == body.branchId), None)
    if not target_branch:
        raise HTTPException(404, {'code': 'BRANCH_NOT_FOUND', 'message': f'Ramo {body.branchId} non trovato.'})

    try:
        selezione = seleziona_blocchi(tree, body.branchId, body.nodeId, extraction.get('blocks', []))
    except GenerationError as error:
        if error.code == 'branch_not_found':
            raise HTTPException(404, {'code': 'BRANCH_NOT_FOUND', 'message': str(error)}) from error
        if error.code == 'no_source_blocks':
            raise HTTPException(422, {'code': 'NO_SOURCE_BLOCKS', 'message': str(error)}) from error
        raise _generation_http_error(error) from error

    provider = getattr(request.app.state, 'generation_provider', None)
    con_validatore = bool(os.getenv('VALIDATION_PROVIDER', '').strip())
    try:
        stima = valuta_quiz_ramo(extraction, selezione['blocks'], provider, store, con_validatore=con_validatore)
    except SpesaRifiuto as rifiuto:
        raise HTTPException(rifiuto.status, {'code': rifiuto.code, 'message': str(rifiuto)}) from rifiuto

    limiti = limiti_configurati()
    massimo = limiti['GENERATION_MAX_USD_PER_COURSE']
    budget = limiti['GENERATION_BUDGET_USD']
    speso = registro(store).speso()
    limite = stima['limiteSuperioreUSD']

    fits_budget = (limite <= massimo) and (speso + limite <= budget)
    remaining_budget = max(budget - speso, Decimal(0))

    return {
        'blockIds': [b['id'] for b in selezione['blocks']],
        'estimatedInputTokens': stima['tokenIngressoMassimi'],
        'estimatedOutputTokens': stima['tokenUscitaMassimi'],
        'expectedCostUsd': _usd(stima['costoAttesoUSD']),
        'maxCostUsd': _usd(stima['limiteSuperioreUSD']),
        'fitsBudget': fits_budget,
        'remainingBudgetUsd': _usd(remaining_budget),
        'warnings': selezione.get('warnings', []),
    }


@router.post('/extractions/{identifier}/concept-tree/quiz', status_code=201)
def generate_quiz(identifier: str, request: Request, body: BranchQuizRequest) -> dict[str, Any]:
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')

    # 1. Controllo idempotenza: se già presente e valida -> restituzione a costo zero
    key = body.idempotencyKey or chiave_idempotenza(
        identifier, body.branchId, body.nodeId, body.treeHash, body.questionCount
    )
    quiz_esistenti = leggi_quiz(store.root, identifier)
    for q in quiz_esistenti:
        if q.get('idempotencyKey') == key:
            # L'albero può essere cambiato dopo la creazione del quiz: la risposta resta valida
            # per la chiave richiesta (idempotenza), ma va marcata stale come fa la GET
            # (rilievo 4 della review Sezione C).
            stale = False
            try:
                record_tree = store.read(identifier, 'concept-tree.json')
                hash_corrente = record_tree.get('treeHash', '')
                stale = bool(hash_corrente) and q.get('treeHash') != hash_corrente
            except Exception:
                pass
            return {**q, 'cached': True, 'stale': stale}

    # 2. Controllo mappa concettuale esistente e valida
    try:
        record_tree = store.read(identifier, 'concept-tree.json')
    except Exception:
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non ancora generata.'})

    if not record_tree.get('complete', True):
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non completata o parziale.'})

    if body.treeHash != record_tree.get('treeHash', ''):
        raise HTTPException(409, {'code': 'TREE_STALE', 'message': 'La mappa concettuale è cambiata; ricaricare prima di generare il quiz.'})

    tree = record_tree.get('tree', {})
    branches = tree.get('branches', [])
    target_branch = next((b for b in branches if b.get('id') == body.branchId), None)
    if not target_branch:
        raise HTTPException(404, {'code': 'BRANCH_NOT_FOUND', 'message': f'Ramo {body.branchId} non trovato.'})

    # 3. Selezione blocchi
    try:
        selezione = seleziona_blocchi(tree, body.branchId, body.nodeId, extraction.get('blocks', []))
    except GenerationError as error:
        if error.code == 'branch_not_found':
            raise HTTPException(404, {'code': 'BRANCH_NOT_FOUND', 'message': str(error)}) from error
        if error.code == 'no_source_blocks':
            raise HTTPException(422, {'code': 'NO_SOURCE_BLOCKS', 'message': str(error)}) from error
        raise _generation_http_error(error) from error

    # 4. Generazione con guardia di spesa e lock
    provider = getattr(request.app.state, 'generation_provider', None)
    corsa_id = uuid.uuid4().hex
    quiz_id = uuid.uuid4().hex
    try:
        esito = genera_quiz_ramo_con_tetto(
            extraction,
            selezione['blocks'],
            provider,
            store,
            branch_id=body.branchId,
            node_id=body.nodeId,
            tree_hash=body.treeHash,
            question_count=body.questionCount,
            nodi_ramo=target_branch.get('nodes', []),
            titolo_ramo=target_branch.get('title', ''),
            corsa_id=corsa_id,
        )
    except SpesaRifiuto as rifiuto:
        raise HTTPException(rifiuto.status, {'code': rifiuto.code, 'message': str(rifiuto)}) from rifiuto
    except GenerationError as error:
        raise _generation_http_error(error) from error

    # 5. Costruzione del record da persistere
    sources = [
        {
            'blockId': b['id'],
            'ref': b.get('label') or (f"p. {b['page']}" if b.get('page') is not None else b['id']),
        }
        for b in selezione['blocks']
    ]

    record_quiz = {
        'quizId': quiz_id,
        'extractionId': identifier,
        'idempotencyKey': key,
        'branchId': body.branchId,
        'nodeId': body.nodeId,
        'treeHash': body.treeHash,
        'attempt': 1,
        'questionCount': len(esito['questions']),
        'questions': esito['questions'],
        'sources': sources,
        'validation': esito.get('validation'),
        'costUsd': esito.get('costUsd', '0'),
        'warnings': [*selezione.get('warnings', []), *esito.get('warnings', [])],
        'createdAt': adesso(),
    }

    aggiungi_quiz(store.root, identifier, record_quiz)
    return record_quiz


@router.get('/extractions/{identifier}/concept-tree/quiz', status_code=200)
def list_quizzes(
    identifier: str,
    request: Request,
    branchId: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    store = request.app.state.store
    current_tree_hash = ''
    try:
        record_tree = store.read(identifier, 'concept-tree.json')
        current_tree_hash = record_tree.get('treeHash', '')
    except Exception:
        pass

    quizzes = leggi_quiz(store.root, identifier)
    risultati = []
    for q in quizzes:
        if branchId and q.get('branchId') != branchId:
            continue
        q_copy = dict(q)
        q_copy['stale'] = bool(current_tree_hash and q.get('treeHash') != current_tree_hash)
        risultati.append(q_copy)

    return risultati


@router.delete('/extractions/{identifier}/concept-tree/quiz/{quiz_id}', status_code=200)
def delete_quiz(identifier: str, quiz_id: str, request: Request) -> dict[str, bool]:
    store = request.app.state.store
    rimosso = elimina_quiz(store.root, identifier, quiz_id)
    if not rimosso:
        raise HTTPException(404, {'code': 'QUIZ_NOT_FOUND', 'message': f'Quiz {quiz_id} non trovato.'})
    return {'ok': True}
