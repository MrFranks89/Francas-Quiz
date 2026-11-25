"""Configurazione del sottosistema account, autenticazione e limiti."""
from __future__ import annotations

import os


def is_auth_required() -> bool:
    """Verifica se l'autenticazione è obbligatoria (default False)."""
    val = os.getenv("AUTH_REQUIRED", "false").strip().lower()
    return val in {"true", "1", "yes"}


def get_supabase_url() -> str:
    """Restituisce l'URL di Supabase."""
    return os.getenv("SUPABASE_URL", "").strip()


def get_supabase_jwt_secret() -> str | None:
    """Restituisce il segreto simmetrico HS256 per la verifica del JWT."""
    val = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    return val if val else None


def get_supabase_jwks_url() -> str | None:
    """Restituisce l'URL per scaricare il JWKS per chiavi asimmetriche (RS256/ES256)."""
    val = os.getenv("SUPABASE_JWKS_URL", "").strip()
    return val if val else None


def get_default_piano() -> str:
    """Restituisce il piano funzioni di default da ambiente ('base' o 'pro')."""
    val = os.getenv("PIANO_FUNZIONI", "base").strip().lower()
    return "pro" if val == "pro" else "base"


def get_limite_corsi_default() -> int:
    """Restituisce il limite di corsi base di default (default 3)."""
    try:
        return int(os.getenv("LIMITE_CORSI_DEFAULT", "3"))
    except ValueError:
        return 3


def get_tetto_corsi_extra() -> int:
    """Restituisce il tetto massimo di corsi extra accumulabili con referral (default 5)."""
    try:
        return int(os.getenv("TETTO_CORSI_EXTRA_REFERRAL", "5"))
    except ValueError:
        return 5


def valida_config_avvio() -> None:
    """Fail-fast all'avvio dell'applicazione se AUTH_REQUIRED=true senza configurazione valida."""
    if not is_auth_required():
        return

    url = get_supabase_url()
    if not url:
        raise RuntimeError("Configurazione Auth non valida: SUPABASE_URL mancante con AUTH_REQUIRED=true.")

    secret = get_supabase_jwt_secret()
    jwks_url = get_supabase_jwks_url()
    if not secret and not jwks_url:
        raise RuntimeError(
            "Configurazione Auth non valida: occorre definire SUPABASE_JWT_SECRET o SUPABASE_JWKS_URL con AUTH_REQUIRED=true."
        )
