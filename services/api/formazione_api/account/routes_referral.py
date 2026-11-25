"""Endpoint FastAPI per la gestione del referral (GET /referral/me e POST /referral/redeem)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import utente_corrente
from .config import get_referral_salt, is_auth_required, is_trust_proxy
from .db import open_db, resolve_db_path
from .modelli import ReferralStato, RiscattoRichiesta, RiscattoRisposta, Utente
from .referral_regole import hash_dispositivo_o_ip, normalizza_codice_referral
from .referral_repo import (
    ReferralAlreadyRedeemed,
    ReferralCodeUnknown,
    applica_referral,
    ottieni_stato_referral,
    registra_accesso_recente,
)

router = APIRouter(prefix="/referral", tags=["referral"])


def _estrai_hash_richiesta(request: Request) -> tuple[str | None, str | None]:
    """Estrae gli hash di dispositivo e indirizzo IP dalla richiesta HTTP."""
    salt = get_referral_salt()
    device_id = request.headers.get("x-device-id")

    client_ip: str | None = None
    if is_trust_proxy():
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

    if not client_ip and request.client:
        client_ip = request.client.host

    device_hash = hash_dispositivo_o_ip(device_id, salt)
    ip_hash = hash_dispositivo_o_ip(client_ip, salt)
    return device_hash, ip_hash


def _richiedi_auth_feature(utente: Utente) -> None:
    """Verifica che l'utente non sia anonimo/locale per le feature che richiedono account Supabase."""
    if not is_auth_required() or utente.user_id == "local":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "AUTH_REQUIRED_FOR_FEATURE",
                "message": "Autenticazione richiesta per questa funzionalita'.",
            },
        )


@router.get("/me", response_model=ReferralStato)
def get_referral_me(
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> ReferralStato:
    """Restituisce lo stato referral dell'utente autenticato (codice, accrediti e lista registrazioni)."""
    _richiedi_auth_feature(utente)

    device_hash, ip_hash = _estrai_hash_richiesta(request)
    db_path = resolve_db_path()
    conn = open_db(db_path)
    try:
        with conn:
            registra_accesso_recente(conn, utente.user_id, device_hash, ip_hash)
        return ottieni_stato_referral(conn, utente.user_id)
    finally:
        conn.close()


@router.post("/redeem", response_model=RiscattoRisposta)
def riscatta_codice_referral(
    richiesta: RiscattoRichiesta,
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> RiscattoRisposta:
    """Riscatta manualmente un codice referral inserito dall'utente invitato."""
    _richiedi_auth_feature(utente)

    try:
        codice_normalizzato = normalizza_codice_referral(richiesta.codice)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INVALID_REFERRAL_CODE_FORMAT",
                "message": str(exc),
            },
        ) from exc

    device_hash, ip_hash = _estrai_hash_richiesta(request)
    db_path = resolve_db_path()
    conn = open_db(db_path)
    try:
        return applica_referral(
            conn=conn,
            invitato_id=utente.user_id,
            codice_grezzo=codice_normalizzato,
            device_hash=device_hash,
            ip_hash=ip_hash,
            is_redeem=True,
        )
    except ReferralCodeUnknown as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "REFERRAL_CODE_UNKNOWN",
                "message": str(exc),
            },
        ) from exc
    except ReferralAlreadyRedeemed as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "REFERRAL_ALREADY_REDEEMED",
                "message": str(exc),
            },
        ) from exc
    finally:
        conn.close()
