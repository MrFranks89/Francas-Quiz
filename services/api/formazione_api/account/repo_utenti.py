"""Repository per la persistenza e il provisioning degli utenti."""
from __future__ import annotations

import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .db import db_transaction, open_db
from .modelli import Utente


def normalizza_email(email: str) -> str:
    """Normalizza l'email: trim, lowercase, rimozione parte '+tag' nel local-part."""
    s = email.strip().lower()
    if "@" in s:
        local, domain = s.split("@", 1)
        if "+" in local:
            local = local.split("+", 1)[0]
        return f"{local}@{domain}"
    return s


def calcola_email_norm_hash(email: str | None) -> str | None:
    """Calcola lo SHA256 hex dell'email normalizzata."""
    if not email:
        return None
    norm = normalizza_email(email)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def _riga_a_utente(r: sqlite3.Row) -> Utente:
    """Converte una riga SQLite nel modello Pydantic Utente."""
    return Utente(
        user_id=r["user_id"],
        email=r["email"],
        nome_visualizzato=r["nome_visualizzato"],
        piano=r["piano"],
        limite_corsi=r["limite_corsi"],
        corsi_extra_referral=r["corsi_extra_referral"],
        codice_referral=r["codice_referral"],
        creato_il=datetime.fromisoformat(r["creato_il"]),
        aggiornato_il=datetime.fromisoformat(r["aggiornato_il"]),
        ultimo_accesso_il=datetime.fromisoformat(r["ultimo_accesso_il"]),
    )


def get_or_create_utente(
    db_source: Path | str | sqlite3.Connection,
    user_id: str,
    email: str | None,
    referral_code: str | None = None,
) -> Utente:
    """Provisioning lazy idempotente dell'utente in transazione BEGIN IMMEDIATE."""
    close_on_exit = False
    if isinstance(db_source, sqlite3.Connection):
        conn = db_source
    else:
        conn = open_db(db_source)
        close_on_exit = True

    try:
        with db_transaction(conn):
            riga = conn.execute("SELECT * FROM utenti WHERE user_id = ?", (user_id,)).fetchone()
            adesso_dt = datetime.now(timezone.utc)
            adesso = adesso_dt.isoformat()
            email_hash = calcola_email_norm_hash(email)

            if riga:
                # Utente già esistente
                modificato = False
                nuova_email = riga["email"]
                nuovo_hash = riga["email_norm_hash"]

                if email and email != riga["email"]:
                    nuova_email = email
                    nuovo_hash = email_hash
                    modificato = True

                ultimo_dt = datetime.fromisoformat(riga["ultimo_accesso_il"])
                aggiorna_accesso = (adesso_dt - ultimo_dt).total_seconds() >= 600

                if modificato or aggiorna_accesso:
                    ultimo_accesso_str = adesso if aggiorna_accesso else riga["ultimo_accesso_il"]
                    aggiornato_str = adesso if modificato else riga["aggiornato_il"]
                    conn.execute(
                        """
                        UPDATE utenti
                        SET email = ?, email_norm_hash = ?, aggiornato_il = ?, ultimo_accesso_il = ?
                        WHERE user_id = ?
                        """,
                        (nuova_email, nuovo_hash, aggiornato_str, ultimo_accesso_str, user_id),
                    )
                    riga = conn.execute("SELECT * FROM utenti WHERE user_id = ?", (user_id,)).fetchone()

                return _riga_a_utente(riga)

            # Nuovo utente
            conn.execute(
                """
                INSERT INTO utenti (
                    user_id, email, email_norm_hash, nome_visualizzato, piano,
                    limite_corsi, corsi_extra_referral, codice_referral,
                    creato_il, aggiornato_il, ultimo_accesso_il
                ) VALUES (?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, ?, ?)
                """,
                (user_id, email, email_hash, adesso, adesso, adesso),
            )

            if email_hash:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO email_viste (email_norm_hash, primo_user_id, creato_il)
                    VALUES (?, ?, ?)
                    """,
                    (email_hash, user_id, adesso),
                )

            # Se è presente referral_code, verrà elaborato via hook/modulo referral (B4)
            if referral_code:
                try:
                    from .referral_repo import applica_referral_automatico
                    applica_referral_automatico(conn, user_id, referral_code)
                except ImportError:
                    pass

            riga = conn.execute("SELECT * FROM utenti WHERE user_id = ?", (user_id,)).fetchone()
            return _riga_a_utente(riga)
    finally:
        if close_on_exit:
            conn.close()


def aggiorna_nome_visualizzato(
    db_source: Path | str | sqlite3.Connection,
    user_id: str,
    nome: str,
) -> Utente:
    """Aggiorna il nome visualizzato dell'utente (1-40 caratteri)."""
    close_on_exit = False
    if isinstance(db_source, sqlite3.Connection):
        conn = db_source
    else:
        conn = open_db(db_source)
        close_on_exit = True

    try:
        with db_transaction(conn):
            adesso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "UPDATE utenti SET nome_visualizzato = ?, aggiornato_il = ? WHERE user_id = ?",
                (nome, adesso, user_id),
            )
            riga = conn.execute("SELECT * FROM utenti WHERE user_id = ?", (user_id,)).fetchone()
            if not riga:
                raise KeyError(f"Utente {user_id} non trovato.")
            return _riga_a_utente(riga)
    finally:
        if close_on_exit:
            conn.close()


def ottieni_utente(
    db_source: Path | str | sqlite3.Connection,
    user_id: str,
) -> Utente | None:
    """Recupera un utente dal database tramite user_id."""
    close_on_exit = False
    if isinstance(db_source, sqlite3.Connection):
        conn = db_source
    else:
        conn = open_db(db_source)
        close_on_exit = True

    try:
        riga = conn.execute("SELECT * FROM utenti WHERE user_id = ?", (user_id,)).fetchone()
        return _riga_a_utente(riga) if riga else None
    finally:
        if close_on_exit:
            conn.close()


def conta_corsi_utente(
    db_source: Path | str | sqlite3.Connection,
    user_id: str,
) -> int:
    """Conta i corsi attivi e riservati per l'utente specificato."""
    close_on_exit = False
    if isinstance(db_source, sqlite3.Connection):
        conn = db_source
    else:
        conn = open_db(db_source)
        close_on_exit = True

    try:
        r = conn.execute(
            "SELECT COUNT(*) AS c FROM corsi_utente WHERE user_id = ? AND stato IN ('riservato', 'attivo')",
            (user_id,),
        ).fetchone()
        return int(r["c"]) if r else 0
    finally:
        if close_on_exit:
            conn.close()
