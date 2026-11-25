"""Catalogo delle funzioni didattiche base e pro con controllo configurazione (G4 - TASK-12/13)."""
from __future__ import annotations

import os
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

CATALOGO_FUNZIONI: dict[str, dict[str, str]] = {
    'gamification': {'livello': 'base', 'descrizione': 'XP, livelli, streak, flashcard'},
    'giochi_singoli': {'livello': 'base', 'descrizione': 'Sopravvivenza, time attack'},
    'coach_orale': {'livello': 'base', 'descrizione': 'Ripasso a voce con valutazione'},
    'gioco_gruppo_sfida': {'livello': 'pro', 'descrizione': 'Giochi di gruppo (FASE 2)'},
}


def piano_corrente() -> Literal['base', 'pro']:
    """Legge il piano attivo da ambiente (default 'base', fallback sicuro a 'base')."""
    val = os.getenv('PIANO_FUNZIONI', 'base').strip().lower()
    return 'pro' if val == 'pro' else 'base'


def funzione_abilitata(chiave: str, piano: str) -> bool:
    """Verifica se una determinata funzione del catalogo è abilitata per il piano specificato."""
    info = CATALOGO_FUNZIONI.get(chiave)
    if not info:
        return False
    if piano == 'pro':
        return True
    return info['livello'] == 'base'


def funzione_attiva(chiave: str, piano: str | None = None) -> bool:
    """Verifica se una determinata funzione del catalogo è abilitata per il piano attuale o specificato."""
    if piano is None:
        piano = piano_corrente()
    return funzione_abilitata(chiave, piano)


def richiedi_funzione(chiave: str, utente: object = None) -> None:
    """Guardia HTTP che solleva 403 FEATURE_NOT_ENABLED se la funzione non è attiva per l'utente o piano."""
    piano = getattr(utente, 'piano', None) or piano_corrente()
    if not funzione_abilitata(chiave, piano):
        raise HTTPException(
            status_code=403,
            detail={'code': 'FEATURE_NOT_ENABLED', 'message': f"La funzione '{chiave}' richiede il piano Pro."},
        )


def guardia_funzione(chiave: str):
    """Dependency factory per FastAPI che applica richiedi_funzione leggendo l'utente dalla richiesta."""
    from fastapi import Request

    def _dipendenza(request: Request) -> None:
        utente = getattr(request.state, 'utente', None)
        richiedi_funzione(chiave, utente=utente)

    return _dipendenza


class FunzioneVoce(BaseModel):
    chiave: str
    livello: str
    descrizione: str
    attiva: bool


class CatalogoFunzioniResponse(BaseModel):
    piano: str
    funzioni: list[FunzioneVoce]


@router.get('/funzioni', response_model=CatalogoFunzioniResponse)
def get_funzioni() -> CatalogoFunzioniResponse:
    """Restituisce il catalogo delle funzioni e lo stato di attivazione per il piano corrente."""
    piano = piano_corrente()
    voci: list[FunzioneVoce] = []
    for k, v in CATALOGO_FUNZIONI.items():
        voci.append(
            FunzioneVoce(
                chiave=k,
                livello=v['livello'],
                descrizione=v['descrizione'],
                attiva=funzione_attiva(k),
            )
        )
    return CatalogoFunzioniResponse(piano=piano, funzioni=voci)
