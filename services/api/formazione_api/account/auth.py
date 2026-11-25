"""Dependency FastAPI utente_corrente per la verifica del JWT e lazy provisioning."""
from __future__ import annotations

import re
from typing import Any
from fastapi import Header, HTTPException, Request
import jwt

from .config import (
    get_supabase_jwks_url,
    get_supabase_jwt_secret,
    get_supabase_url,
    is_auth_required,
)
from .db import resolve_db_path
from .jwks import get_jwks_cache
from .modelli import UTENTE_LOCALE, Utente
from .repo_utenti import get_or_create_utente

UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _solleva_401(code: str, message: str) -> None:
    raise HTTPException(
        status_code=401,
        detail={"code": code, "message": message},
        headers={"WWW-Authenticate": "Bearer"},
    )


def utente_corrente(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Utente:
    """Dependency FastAPI per l'autenticazione.

    - Se AUTH_REQUIRED=false: ritorna UTENTE_LOCALE senza leggere header, senza DB, senza rete.
    - Se AUTH_REQUIRED=true: valida il Bearer token JWT Supabase e provvede l'utente lazy.
    """
    if not is_auth_required():
        request.state.utente = UTENTE_LOCALE
        return UTENTE_LOCALE

    if not authorization or not authorization.startswith("Bearer "):
        _solleva_401("AUTH_TOKEN_MISSING", "Token di autenticazione mancante o formato non valido.")

    token = authorization[7:].strip()
    if not token:
        _solleva_401("AUTH_TOKEN_MISSING", "Token di autenticazione mancante o formato non valido.")

    # 1. Ispezione header JWT
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    alg = header.get("alg")
    if not alg or alg == "none":
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    secret = get_supabase_jwt_secret()
    jwks_url = get_supabase_jwks_url()

    # 2. Risoluzione chiave e algoritmi ammessi
    signing_key: Any = None
    allowed_algs: list[str] = []

    if secret:
        if alg != "HS256":
            _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")
        signing_key = secret
        allowed_algs = ["HS256"]
    elif jwks_url:
        if alg not in {"RS256", "ES256"}:
            _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")
        kid = header.get("kid")
        if not kid:
            _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")
        try:
            cache = get_jwks_cache()
            signing_key = cache.get_key_for_kid(kid)
        except Exception:
            _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")
        allowed_algs = ["RS256", "ES256"]
    else:
        _solleva_401("AUTH_TOKEN_INVALID", "Configurazione server non valida.")

    # 3. Decodifica e verifica crittografica
    expected_iss = f"{get_supabase_url().rstrip('/')}/auth/v1"
    try:
        payload = jwt.decode(
            token,
            key=signing_key,
            algorithms=allowed_algs,
            audience="authenticated",
            issuer=expected_iss,
            leeway=10,
            options={
                "require": ["exp", "aud", "iss", "sub"],
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
                "verify_sub": True,
            },
        )
    except jwt.ExpiredSignatureError:
        _solleva_401("AUTH_TOKEN_EXPIRED", "Token di autenticazione scaduto.")
    except Exception:
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    # 4. Validazione claim semantici
    if payload.get("role") != "authenticated":
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    if payload.get("is_anonymous") is True:
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    sub = payload.get("sub")
    if not isinstance(sub, str) or not UUID_REGEX.match(sub):
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    email = payload.get("email")
    if not email or not isinstance(email, str) or not email.strip():
        _solleva_401("AUTH_TOKEN_INVALID", "Token di autenticazione non valido.")

    # 5. Provisioning lazy idempotente su SQLite
    store = getattr(request.app.state, "store", None)
    base_dir = store.base_root if store else None
    db_path = resolve_db_path(base_dir)

    user_meta = payload.get("user_metadata") or {}
    referral_code = user_meta.get("referral_code")

    utente = get_or_create_utente(
        db_path,
        user_id=sub,
        email=email,
        referral_code=referral_code,
    )
    request.state.utente = utente
    return utente
