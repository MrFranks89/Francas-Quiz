"""Risoluzione dello scope di spesa per utente."""
from __future__ import annotations

from .config import is_auth_required
from .modelli import Utente


def scope_spesa(utente: Utente | None) -> str:
    """Restituisce 'local' con AUTH=false o utente locale; altrimenti 'user:<user_id>'."""
    if not is_auth_required() or not utente or utente.user_id == "local":
        return "local"
    return f"user:{utente.user_id}"
