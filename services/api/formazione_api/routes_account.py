"""Rotte per la gestione dell'account utente (GET /me, PATCH /me, GET /auth/config)."""
from __future__ import annotations

from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request

from .account.auth import utente_corrente
from .account.config import (
    get_default_piano,
    get_limite_corsi_default,
    get_supabase_url,
    is_auth_required,
)
from .account.corsi import elenco_corsi_utente
from .account.db import resolve_db_path
from .account.modelli import PatchMeRichiesta, Utente, UtenteVista
from .account.repo_utenti import aggiorna_nome_visualizzato, conta_corsi_utente

router = APIRouter(tags=["account"])
public_router = APIRouter(tags=["auth"])


def _conta_corsi_reali(root: Path) -> int:
    """Conta le estrazioni reali presenti sul file system locale."""
    try:
        return len(list(root.glob("*.extracted.json")))
    except Exception:
        return 0


@public_router.get("/auth/config")
def get_auth_config() -> dict[str, str | bool | None]:
    """Endpoint pubblico che espone la configurazione client per Supabase Auth."""
    auth_on = is_auth_required()
    return {
        "auth_required": auth_on,
        "supabase_url": get_supabase_url() if auth_on else None,
    }


@router.get("/me", response_model=UtenteVista)
def get_me(request: Request, utente: Utente = Depends(utente_corrente)) -> UtenteVista:
    """Restituisce la vista dell'utente corrente e i limiti applicati."""
    store = getattr(request.app.state, "store", None)
    base_dir = store.base_root if store else None

    if not is_auth_required():
        corsi_usati = _conta_corsi_reali(store.root) if store else 0
        return UtenteVista(
            user_id="local",
            email=None,
            nome_visualizzato="Utente Locale",
            piano_effettivo=get_default_piano(),
            limite_base=None,
            corsi_extra_referral=0,
            limite_effettivo=None,
            corsi_usati=corsi_usati,
            auth_required=False,
        )

    db_path = resolve_db_path(base_dir)
    corsi_usati = conta_corsi_utente(db_path, utente.user_id)
    piano_effettivo = utente.piano or get_default_piano()

    if utente.limite_corsi is not None:
        limite_base = utente.limite_corsi
    elif piano_effettivo == "pro":
        limite_base = None
    else:
        limite_base = get_limite_corsi_default()

    limite_effettivo = None if limite_base is None else (limite_base + utente.corsi_extra_referral)

    return UtenteVista(
        user_id=utente.user_id,
        email=utente.email,
        nome_visualizzato=utente.nome_visualizzato,
        piano_effettivo=piano_effettivo,
        limite_base=limite_base,
        corsi_extra_referral=utente.corsi_extra_referral,
        limite_effettivo=limite_effettivo,
        corsi_usati=corsi_usati,
        auth_required=True,
    )


@router.patch("/me")
def patch_me(
    richiesta: PatchMeRichiesta,
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> dict[str, str | None]:
    """Aggiorna il nome visualizzato dell'utente corrente (richiede auth)."""
    if not is_auth_required():
        raise HTTPException(
            status_code=409,
            detail={
                "code": "AUTH_REQUIRED_FOR_FEATURE",
                "message": "Operazione non disponibile in modalità locale senza autenticazione.",
            },
        )

    store = getattr(request.app.state, "store", None)
    base_dir = store.base_root if store else None
    db_path = resolve_db_path(base_dir)

    utente_aggiornato = aggiorna_nome_visualizzato(
        db_path,
        user_id=utente.user_id,
        nome=richiesta.nome_visualizzato,
    )
    return {"nome_visualizzato": utente_aggiornato.nome_visualizzato}


@router.get("/account/courses")
def get_account_courses(
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> dict[str, list[dict]]:
    """Restituisce l'elenco dei corsi salvati per l'account con lo stato e le rigenerazioni."""
    store = getattr(request.app.state, "store", None)
    base_dir = store.base_root if store else None
    db_path = resolve_db_path(base_dir)
    user_id = utente.user_id if is_auth_required() else "local"
    return {"courses": elenco_corsi_utente(db_path, user_id, store=store)}
