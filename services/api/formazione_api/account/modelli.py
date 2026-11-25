"""Modelli di dati Pydantic per l'account utente e la vista pubblica."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field, field_validator

Piano = Literal["base", "pro"]


class Utente(BaseModel):
    user_id: str
    email: str | None = None
    nome_visualizzato: str | None = Field(default=None, max_length=40)
    piano: Piano | None = None
    limite_corsi: int | None = Field(default=None, ge=0)
    corsi_extra_referral: int = Field(default=0, ge=0)
    codice_referral: str | None = None
    creato_il: datetime
    aggiornato_il: datetime
    ultimo_accesso_il: datetime


class UtenteVista(BaseModel):
    user_id: str
    email: str | None = None
    nome_visualizzato: str | None = None
    piano_effettivo: Piano
    limite_base: int | None = None
    corsi_extra_referral: int = 0
    limite_effettivo: int | None = None
    corsi_usati: int = 0
    auth_required: bool = False


class PatchMeRichiesta(BaseModel):
    nome_visualizzato: str

    @field_validator("nome_visualizzato")
    @classmethod
    def valida_nome(cls, v: str) -> str:
        s = v.strip()
        if not s or len(s) > 40:
            raise ValueError("Nome visualizzato non valido (deve contenere tra 1 e 40 caratteri dopo il trim).")
        return s


UTENTE_LOCALE = Utente(
    user_id="local",
    email=None,
    nome_visualizzato="Utente Locale",
    piano=None,
    limite_corsi=None,
    corsi_extra_referral=0,
    codice_referral=None,
    creato_il=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
    aggiornato_il=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
    ultimo_accesso_il=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
)
