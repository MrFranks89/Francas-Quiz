"""Rotte HTTP per la preview, generazione, elenco ed eliminazione dei quiz mirati di ramo."""
import os
import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response
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
    limiti_configurati,
    registro,
)
from .spesa_quiz_ramo import (
    decidi_quiz,
    genera_quiz_ramo_con_tetto,
    valuta_quiz_ramo,
)

router = APIRouter()


class CrossValidation(BaseModel):
    enabled: bool
    provider: str | None = None


class BranchQuizEstimate(BaseModel):
    blockIds: list[str]
    estimatedInputTokens: int
    estimatedOutputTokens: int
    expectedCostUsd: str
    maxCostUsd: str
    fitsBudget: bool
    remainingBudgetUsd: str
    warnings: list[str]
    crossValidation: CrossValidation


class BranchQuizResponse(BaseModel):
    quizId: str
    extractionId: str
    idempotencyKey: str
    branchId: str
    nodeId: str | None = None
    treeHash: str
    attempt: int
    questionCount: int
    questions: list[dict]
    sources: list[dict]
    validation: dict | None = None
    costUsd: str
    warnings: list[str]
    createdAt: str
    crossValidation: CrossValidation = Field(default_factory=lambda: CrossValidation(enabled=False, provider=None))
    cached: bool = False
    stale: bool = False


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


@router.post('/extractions/{identifier}/concept-tree/quiz/preview', response_model=BranchQuizEstimate, status_code=200)
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

    try:
        decidi_quiz(stima, store)
        fits_budget = True
    except SpesaRifiuto:
        fits_budget = False

    budget = limiti_configurati()['GENERATION_BUDGET_USD']
    speso = registro(store).speso()
    remaining_budget = max(budget - speso, Decimal(0))

    warnings = list(selezione.get('warnings', []))
    has_val = bool(stima['validatore'])
    if not has_val:
        warnings.append('NO_CROSS_VALIDATION')

    return {
        'blockIds': [b['id'] for b in selezione['blocks']],
        'estimatedInputTokens': stima['tokenIngressoMassimi'],
        'estimatedOutputTokens': stima['tokenUscitaMassimi'],
        'expectedCostUsd': _usd(stima['costoAttesoUSD']),
        'maxCostUsd': _usd(stima['limiteSuperioreUSD']),
        'fitsBudget': fits_budget,
        'remainingBudgetUsd': _usd(remaining_budget),
        'warnings': warnings,
        'crossValidation': {
            'enabled': has_val,
            'provider': (stima['validatore'] or {}).get('fornitore'),
        },
    }


@router.post('/extractions/{identifier}/concept-tree/quiz', response_model=BranchQuizResponse, status_code=201)
def generate_quiz(identifier: str, request: Request, body: BranchQuizRequest, response: Response) -> dict[str, Any]:
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')

    # 1. Controllo idempotenza: se già presente e valida -> restituzione a costo zero
    key = body.idempotencyKey or chiave_idempotenza(
        identifier, body.branchId, body.nodeId, body.treeHash, body.questionCount
    )
    quiz_esistenti = leggi_quiz(store.root, identifier)
    for q in quiz_esistenti:
        if q.get('idempotencyKey') == key:
            if q.get('branchId') != body.branchId or (q.get('nodeId') or None) != (body.nodeId or None):
                raise HTTPException(409, {'code': 'IDEMPOTENCY_KEY_CONFLICT', 'message': 'Chiave già usata per un altro ramo o nodo.'})
            stale = False
            try:
                record_tree = store.read(identifier, 'concept-tree.json')
                hash_corrente = record_tree.get('treeHash', '')
                stale = bool(hash_corrente) and q.get('treeHash') != hash_corrente
            except Exception:
                pass
            response.status_code = 200
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

    nodi_prompt = ([n for n in target_branch.get('nodes', []) if n.get('id') == body.nodeId]
                   if body.nodeId else target_branch.get('nodes', []))
    titolo = target_branch.get('title', '')
    if body.nodeId and nodi_prompt:
        titolo = f"{titolo} — {nodi_prompt[0].get('title', '')}"

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
            nodi_ramo=nodi_prompt,
            titolo_ramo=titolo,
            corsa_id=corsa_id,
            extraction_id=identifier,
            idempotency_key=key,
        )
    except SpesaRifiuto as rifiuto:
        raise HTTPException(rifiuto.status, {'code': rifiuto.code, 'message': str(rifiuto)}) from rifiuto
    except GenerationError as error:
        if error.code == 'generation_in_progress':
            raise HTTPException(409, {'code': 'generation_in_progress', 'message': str(error)}) from error
        raise _generation_http_error(error) from error

    if 'cached_record' in esito:
        cached_rec = esito['cached_record']
        stale = False
        try:
            record_tree = store.read(identifier, 'concept-tree.json')
            hash_corrente = record_tree.get('treeHash', '')
            stale = bool(hash_corrente) and cached_rec.get('treeHash') != hash_corrente
        except Exception:
            pass
        response.status_code = 200
        return {**cached_rec, 'cached': True, 'stale': stale}

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
        'crossValidation': esito.get('crossValidation', {'enabled': False, 'provider': None}),
    }

    aggiungi_quiz(store.root, identifier, record_quiz)
    return record_quiz


@router.get('/extractions/{identifier}/concept-tree/quiz', response_model=list[BranchQuizResponse], status_code=200)
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
    read_record(store, identifier, 'extraction.json')
    rimosso = elimina_quiz(store.root, identifier, quiz_id)
    if not rimosso:
        raise HTTPException(404, {'code': 'QUIZ_NOT_FOUND', 'message': f'Quiz {quiz_id} non trovato.'})
    return {'ok': True}
