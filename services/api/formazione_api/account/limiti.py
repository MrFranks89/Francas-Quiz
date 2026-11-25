"""Regole pure di valutazione limiti e context manager transazionale slot_corso."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator
from pydantic import BaseModel

from .config import (
    get_default_piano,
    get_limite_corsi_default,
    get_tetto_corsi_extra,
    is_auth_required,
)
from .db import db_transaction, open_db, resolve_db_path
from .modelli import Utente


class EsitoLimite(BaseModel):
    consentito: bool
    limite_base: int | None
    corsi_extra_referral: int
    limite_effettivo: int | None
    corsi_usati: int
    piano: str
    referral_disponibile: bool


class CourseLimitReached(Exception):
    def __init__(self, esito: EsitoLimite):
        super().__init__("Hai raggiunto il limite massimo di corsi disponibili.")
        self.esito = esito

    def to_payload(self) -> dict[str, Any]:
        return {
            "code": "COURSE_LIMIT_REACHED",
            "message": str(self),
            "limite_base": self.esito.limite_base if self.esito.limite_base is not None else 0,
            "corsi_extra_referral": self.esito.corsi_extra_referral,
            "limite_effettivo": self.esito.limite_effettivo if self.esito.limite_effettivo is not None else 0,
            "corsi_usati": self.esito.corsi_usati,
            "piano": self.esito.piano,
            "referral_disponibile": self.esito.referral_disponibile,
        }


def valuta_limite(
    utente: Utente,
    corsi_usati: int,
    piano_effettivo: str | None = None,
) -> EsitoLimite:
    """Funzione pura che calcola se l'import di un nuovo corso è consentito."""
    piano = utente.piano or piano_effettivo or get_default_piano()
    if utente.limite_corsi is not None:
        limite_base = utente.limite_corsi
    elif piano == "pro":
        limite_base = None
    else:
        limite_base = get_limite_corsi_default()

    if limite_base is None:
        limite_effettivo = None
        consentito = True
    else:
        limite_effettivo = limite_base + utente.corsi_extra_referral
        consentito = corsi_usati < limite_effettivo

    tetto_extra = get_tetto_corsi_extra()
    referral_disponibile = (piano != "pro") and (utente.corsi_extra_referral < tetto_extra)

    return EsitoLimite(
        consentito=consentito,
        limite_base=limite_base,
        corsi_extra_referral=utente.corsi_extra_referral,
        limite_effettivo=limite_effettivo,
        corsi_usati=corsi_usati,
        piano=piano,
        referral_disponibile=referral_disponibile,
    )


@contextmanager
def slot_corso(
    utente: Utente | None,
    extraction_id: str,
    db_path: Path | str | None = None,
) -> Generator[None, None, None]:
    """Context manager che riserva ed impegna uno slot corso in modo atomico.

    - Con AUTH_REQUIRED=false o utente locale: NO-OP.
    - Con AUTH_REQUIRED=true: transazione BEGIN IMMEDIATE, controllo limite,
      riserva 'riservato' -> se esito ok 'attivo' -> se errore 'fallito' (rilasciando lo slot).
    """
    if not is_auth_required() or not utente or utente.user_id == "local":
        yield
        return

    path = resolve_db_path(db_path)
    conn = open_db(path)
    try:
        with db_transaction(conn):
            r = conn.execute(
                "SELECT COUNT(*) AS c FROM corsi_utente WHERE user_id = ? AND stato IN ('riservato', 'attivo')",
                (utente.user_id,),
            ).fetchone()
            usati = int(r["c"]) if r else 0

            esito = valuta_limite(utente, usati)
            if not esito.consentito:
                raise CourseLimitReached(esito)

            adesso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO corsi_utente (extraction_id, user_id, stato, creato_il, aggiornato_il)
                VALUES (?, ?, 'riservato', ?, ?)
                """,
                (extraction_id, utente.user_id, adesso, adesso),
            )

        # Esecuzione del blocco chiamante
        yield

        # Conclusione con successo: passa a stato 'attivo'
        adesso = datetime.now(timezone.utc).isoformat()
        with db_transaction(conn):
            conn.execute(
                "UPDATE corsi_utente SET stato = 'attivo', aggiornato_il = ? WHERE extraction_id = ?",
                (adesso, extraction_id),
            )
    except CourseLimitReached:
        raise
    except Exception:
        # Errore durante l'estrazione: rilascia lo slot impostando stato 'fallito'
        try:
            adesso = datetime.now(timezone.utc).isoformat()
            with db_transaction(conn):
                conn.execute(
                    "UPDATE corsi_utente SET stato = 'fallito', aggiornato_il = ? WHERE extraction_id = ?",
                    (adesso, extraction_id),
                )
        except Exception:
            pass
        raise
    finally:
        conn.close()


def libera_slot_corso(extraction_id: str, db_path: Path | str | None = None) -> None:
    """Imposta lo stato del corso a 'eliminato', liberando lo slot."""
    path = resolve_db_path(db_path)
    conn = open_db(path)
    try:
        adesso = datetime.now(timezone.utc).isoformat()
        with db_transaction(conn):
            conn.execute(
                "UPDATE corsi_utente SET stato = 'eliminato', aggiornato_il = ? WHERE extraction_id = ?",
                (adesso, extraction_id),
            )
    finally:
        conn.close()
