"""Gestione connessione SQLite in modalità WAL, transazioni IMMEDIATE e migrazioni."""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

MIGRAZIONE_001 = """
CREATE TABLE IF NOT EXISTS utenti (
    user_id TEXT PRIMARY KEY,
    email TEXT NULL,
    email_norm_hash TEXT NULL,
    nome_visualizzato TEXT NULL,
    piano TEXT NULL,
    limite_corsi INTEGER NULL,
    corsi_extra_referral INTEGER NOT NULL DEFAULT 0 CHECK (corsi_extra_referral >= 0),
    codice_referral TEXT UNIQUE NULL,
    creato_il TEXT NOT NULL,
    aggiornato_il TEXT NOT NULL,
    ultimo_accesso_il TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corsi_utente (
    extraction_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stato TEXT NOT NULL CHECK (stato IN ('riservato','attivo','fallito','eliminato')),
    creato_il TEXT NOT NULL,
    aggiornato_il TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corsi_utente_user ON corsi_utente(user_id);

CREATE TABLE IF NOT EXISTS referral_accrediti (
    invitato_user_id TEXT PRIMARY KEY,
    invitante_user_id TEXT NOT NULL,
    codice TEXT NOT NULL,
    creato_il TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_referral_accrediti_invitante ON referral_accrediti(invitante_user_id);

CREATE TABLE IF NOT EXISTS referral_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitato_user_id TEXT NOT NULL,
    invitante_user_id TEXT NULL,
    codice TEXT NOT NULL,
    esito TEXT NOT NULL,
    segnali TEXT NOT NULL,
    creato_il TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_viste (
    email_norm_hash TEXT PRIMARY KEY,
    primo_user_id TEXT NOT NULL,
    creato_il TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accessi_recenti (
    user_id TEXT NOT NULL,
    device_hash TEXT NULL,
    ip_hash TEXT NULL,
    visto_il TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accessi_recenti_user ON accessi_recenti(user_id);

CREATE TABLE IF NOT EXISTS duelli (
    duello_id TEXT PRIMARY KEY,
    modalita TEXT NOT NULL DEFAULT 'asincrono',
    creatore_id TEXT NOT NULL,
    avversario_id TEXT NULL,
    codice_invito TEXT UNIQUE NOT NULL,
    extraction_id TEXT NOT NULL,
    titolo_corso TEXT NOT NULL,
    domande_snapshot TEXT NOT NULL,
    n_domande INTEGER NOT NULL CHECK (n_domande BETWEEN 5 AND 20),
    tempo_max_giocata_s INTEGER NOT NULL DEFAULT 900,
    creato_il TEXT NOT NULL,
    scade_il TEXT NOT NULL,
    stato_salvato TEXT NOT NULL CHECK (stato_salvato IN ('in_attesa','aperto','completato','annullato')),
    esito_json TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_duelli_creatore ON duelli(creatore_id);
CREATE INDEX IF NOT EXISTS idx_duelli_avversario ON duelli(avversario_id);

CREATE TABLE IF NOT EXISTS duelli_giocate (
    duello_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    iniziata_il TEXT NULL,
    consegnata_il TEXT NULL,
    risposte_json TEXT NULL,
    corrette INTEGER NULL,
    tempo_totale_ms INTEGER NULL,
    PRIMARY KEY (duello_id, user_id),
    FOREIGN KEY (duello_id) REFERENCES duelli(duello_id) ON DELETE CASCADE
);
"""

MIGRAZIONE_002 = """
CREATE TABLE IF NOT EXISTS rigenerazioni_corsi (
    extraction_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rigenerazioni_usate INTEGER NOT NULL DEFAULT 0,
    max_rigenerazioni INTEGER NOT NULL DEFAULT 3,
    creato_il TEXT NOT NULL,
    aggiornato_il TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rigenerazioni_corsi_user ON rigenerazioni_corsi(user_id);
"""

MIGRAZIONI: list[tuple[int, str, str]] = [
    (1, "001_iniziale_tabelle_account_referral_duelli", MIGRAZIONE_001),
    (2, "002_rigenerazioni_corsi", MIGRAZIONE_002),
]


def resolve_db_path(target: Path | str | None = None) -> Path:
    """Risolve il percorso assoluto del database accounts.sqlite3."""
    if target is None:
        data_dir = os.getenv("FORMAZIONE_DATA_DIR")
        if data_dir:
            base = Path(data_dir)
        else:
            base = Path(__file__).resolve().parents[4] / "var" / "api"
        return base / "accounts.sqlite3"
    p = Path(target)
    if p.is_dir() or p.suffix != ".sqlite3":
        return p / "accounts.sqlite3"
    return p


def open_db(db_path: Path | str) -> sqlite3.Connection:
    """Apre una connessione SQLite configurata con WAL e timeout."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    return conn


@contextmanager
def db_transaction(conn: sqlite3.Connection) -> Generator[sqlite3.Connection, None, None]:
    """Context manager che avvia una transazione BEGIN IMMEDIATE (se non già in transazione)."""
    is_outer = not conn.in_transaction
    if is_outer:
        conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        if is_outer:
            conn.execute("COMMIT")
    except Exception:
        if is_outer:
            conn.execute("ROLLBACK")
        raise


def applica_migrazioni(conn: sqlite3.Connection) -> None:
    """Applica in sequenza le migrazioni numerate mancanti."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            applicato_il TEXT NOT NULL
        );
        """
    )
    righe = conn.execute("SELECT version FROM schema_version").fetchall()
    applicate = {int(r["version"]) for r in righe}

    for versione, nome, sql in MIGRAZIONI:
        if versione not in applicate:
            conn.executescript(sql)
            adesso = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO schema_version (version, nome, applicato_il) VALUES (?, ?, ?)",
                (versione, nome, adesso),
            )


def inizializza_db(db_path: Path | str) -> None:
    """Inizializza il file di database e applica le migrazioni."""
    conn = open_db(db_path)
    try:
        applica_migrazioni(conn)
    finally:
        conn.close()
