"""Rotte HTTP per la gamification reale e il mazzo flashcard (G2, G3 - TASK-12/13)."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from .gamification import (
    _LOCK_GAMIFICATION,
    EventoGamification,
    GamificationStateResponse,
    MazzoFlashcards,
    carica_stato,
    crea_risposta_stato,
    salva_stato,
)
from .gamification_regole import applica_evento, costruisci_mazzo
from .routes import read_record

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get('/extractions/{identifier}/gamification', response_model=GamificationStateResponse)
def get_gamification_state(identifier: str, request: Request) -> GamificationStateResponse:
    """Restituisce lo stato gamification dell'estrazione (o lo stato iniziale se assente, senza scrivere)."""
    store = request.app.state.store
    # Valida che l'estrazione esista (404 se inesistente o id malformato)
    read_record(store, identifier, 'extraction.json')

    with _LOCK_GAMIFICATION:
        stato = carica_stato(store.root, identifier)
        return crea_risposta_stato(stato, esito=None)


@router.post('/extractions/{identifier}/gamification/events', response_model=GamificationStateResponse)
def post_gamification_event(
    identifier: str,
    request: Request,
    evento: EventoGamification,
) -> GamificationStateResponse:
    """Riceve ed elabora un evento di gioco dentro la sezione critica, restituendo lo stato aggiornato ed esito."""
    store = request.app.state.store
    read_record(store, identifier, 'extraction.json')

    oggi_utc = datetime.now(timezone.utc).date()
    try:
        d_evento = date.fromisoformat(evento.clientDate)
    except Exception:
        raise HTTPException(422, {'code': 'INVALID_CLIENT_DATE', 'message': 'clientDate non valida'})

    # Anticheat: clientDate non può superare domani rispetto all'ora UTC del server
    if d_evento > oggi_utc + timedelta(days=1):
        raise HTTPException(
            422,
            {'code': 'INVALID_CLIENT_DATE', 'message': 'clientDate non può essere oltre domani (UTC server)'},
        )

    with _LOCK_GAMIFICATION:
        stato = carica_stato(store.root, identifier)
        esito = applica_evento(stato, evento, oggi_utc)
        salva_stato(store.root, stato)
        return crea_risposta_stato(stato, esito)


@router.get('/extractions/{identifier}/gamification/flashcards', response_model=MazzoFlashcards)
def get_flashcards(
    identifier: str,
    request: Request,
    branchId: str | None = Query(default=None),
    oggi: str | None = Query(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$'),
    limit: int = Query(default=20, ge=1, le=50),
    includeNuove: bool = Query(default=True),
) -> MazzoFlashcards:
    """Restituisce il mazzo flashcard derivato deterministicamente dalla mappa concettuale con scadenze Leitner."""
    store = request.app.state.store
    read_record(store, identifier, 'extraction.json')

    try:
        record_tree = store.read(identifier, 'concept-tree.json')
    except Exception:
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non ancora generata.'})

    if not record_tree.get('complete', True):
        raise HTTPException(409, {'code': 'TREE_NOT_READY', 'message': 'Mappa concettuale non completata o parziale.'})

    tree = record_tree.get('tree', {})
    oggi_str = oggi or datetime.now(timezone.utc).date().isoformat()

    with _LOCK_GAMIFICATION:
        stato = carica_stato(store.root, identifier)
        try:
            return costruisci_mazzo(
                tree=tree,
                stato=stato,
                oggi_str=oggi_str,
                branch_id=branchId,
                limite=limit,
                includi_nuove=includeNuove,
            )
        except KeyError as err:
            raise HTTPException(404, {'code': 'BRANCH_NOT_FOUND', 'message': str(err)})
