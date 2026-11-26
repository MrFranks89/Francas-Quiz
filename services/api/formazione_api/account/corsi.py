"""Gestione salvataggio corsi utente e contatore rigenerazioni (Ordine 15, Blocco E.2)."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .db import applica_migrazioni, db_transaction, open_db, resolve_db_path

# Costante unificata per piano, configurabile
MAX_RIGENERAZIONI_PER_PIANO: dict[str, int] = {
    'normale': 3,
    'base': 3,
    'pro': 3,
    'ultra': 3,
}
DEFAULT_MAX_RIGENERAZIONI: int = 3


def max_rigenerazioni_piano(piano: Optional[str]) -> int:
    """Restituisce il numero massimo di rigenerazioni ammesse per il piano specificato."""
    if not piano:
        return DEFAULT_MAX_RIGENERAZIONI
    return MAX_RIGENERAZIONI_PER_PIANO.get(piano.lower(), DEFAULT_MAX_RIGENERAZIONI)


def salva_corso_utente(
    db_target: Path | str | None,
    user_id: str,
    extraction_id: str,
    piano: Optional[str] = None,
    stato: str = 'attivo',
) -> None:
    """Registra o aggiorna un corso associato all'account utente."""
    try:
        db_path = resolve_db_path(db_target)
        conn = open_db(db_path)
    except Exception:
        return
    now = datetime.now(timezone.utc).isoformat()
    max_rig = max_rigenerazioni_piano(piano)

    def _esegui() -> None:
        with db_transaction(conn):
            cur = conn.execute(
                "SELECT extraction_id FROM corsi_utente WHERE extraction_id = ?",
                (extraction_id,),
            )
            if cur.fetchone():
                conn.execute(
                    """
                    UPDATE corsi_utente
                    SET user_id = ?, stato = ?, aggiornato_il = ?
                    WHERE extraction_id = ?
                    """,
                    (user_id, stato, now, extraction_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO corsi_utente (extraction_id, user_id, stato, creato_il, aggiornato_il)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (extraction_id, user_id, stato, now, now),
                )
            conn.execute(
                """
                INSERT OR IGNORE INTO rigenerazioni_corsi (extraction_id, user_id, rigenerazioni_usate, max_rigenerazioni, creato_il, aggiornato_il)
                VALUES (?, ?, 0, ?, ?, ?)
                """,
                (extraction_id, user_id, max_rig, now, now),
            )

    try:
        try:
            _esegui()
        except sqlite3.OperationalError:
            applica_migrazioni(conn)
            _esegui()
    except Exception:
        pass
    finally:
        conn.close()


def puo_rigenerare(
    db_target: Path | str | None,
    user_id: str,
    extraction_id: str,
) -> tuple[bool, int, int]:
    """Verifica se l'utente può rigenerare il corso.

    Ritorna: (ammesso, usate, massime).
    """
    try:
        db_path = resolve_db_path(db_target)
        conn = open_db(db_path)
    except Exception:
        return (True, 0, DEFAULT_MAX_RIGENERAZIONI)

    def _esegui() -> tuple[bool, int, int]:
        cur = conn.execute(
            "SELECT rigenerazioni_usate, max_rigenerazioni FROM rigenerazioni_corsi WHERE extraction_id = ? AND user_id = ?",
            (extraction_id, user_id),
        )
        row = cur.fetchone()
        if not row:
            return (True, 0, DEFAULT_MAX_RIGENERAZIONI)
        usate = int(row["rigenerazioni_usate"])
        max_rig = int(row["max_rigenerazioni"])
        return (usate < max_rig, usate, max_rig)

    try:
        try:
            return _esegui()
        except sqlite3.OperationalError:
            applica_migrazioni(conn)
            return _esegui()
    except Exception:
        return (True, 0, DEFAULT_MAX_RIGENERAZIONI)
    finally:
        conn.close()


def consuma_rigenerazione(
    db_target: Path | str | None,
    user_id: str,
    extraction_id: str,
) -> tuple[bool, int, int]:
    """Incrementa il contatore delle rigenerazioni se nei limiti.

    Ritorna: (riuscito, usate_dopo, massime).
    """
    try:
        db_path = resolve_db_path(db_target)
        conn = open_db(db_path)
    except Exception:
        return (True, 1, DEFAULT_MAX_RIGENERAZIONI)
    now = datetime.now(timezone.utc).isoformat()

    def _esegui() -> tuple[bool, int, int]:
        with db_transaction(conn):
            cur = conn.execute(
                "SELECT rigenerazioni_usate, max_rigenerazioni FROM rigenerazioni_corsi WHERE extraction_id = ? AND user_id = ?",
                (extraction_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                conn.execute(
                    """
                    INSERT INTO rigenerazioni_corsi (extraction_id, user_id, rigenerazioni_usate, max_rigenerazioni, creato_il, aggiornato_il)
                    VALUES (?, ?, 1, ?, ?, ?)
                    """,
                    (extraction_id, user_id, DEFAULT_MAX_RIGENERAZIONI, now, now),
                )
                return (True, 1, DEFAULT_MAX_RIGENERAZIONI)
            usate = int(row["rigenerazioni_usate"])
            max_rig = int(row["max_rigenerazioni"])
            if usate >= max_rig:
                return (False, usate, max_rig)
            nuove_usate = usate + 1
            conn.execute(
                """
                UPDATE rigenerazioni_corsi
                SET rigenerazioni_usate = ?, aggiornato_il = ?
                WHERE extraction_id = ? AND user_id = ?
                """,
                (nuove_usate, now, extraction_id, user_id),
            )
            return (True, nuove_usate, max_rig)

    try:
        try:
            return _esegui()
        except sqlite3.OperationalError:
            applica_migrazioni(conn)
            return _esegui()
    except Exception:
        return (True, 1, DEFAULT_MAX_RIGENERAZIONI)
    finally:
        conn.close()


def elenco_corsi_utente(
    db_target: Path | str | None,
    user_id: str,
    store=None,
) -> list[dict]:
    """Restituisce l'elenco dei corsi salvati per l'utente con dettagli e rigenerazioni."""
    try:
        db_path = resolve_db_path(db_target)
        conn = open_db(db_path)
    except Exception:
        return []

    def _esegui() -> list[dict]:
        cur = conn.execute(
            """
            SELECT cu.extraction_id, cu.stato, cu.creato_il, cu.aggiornato_il,
                   COALESCE(rc.rigenerazioni_usate, 0) AS rigenerazioni_usate,
                   COALESCE(rc.max_rigenerazioni, 3) AS max_rigenerazioni
            FROM corsi_utente cu
            LEFT JOIN rigenerazioni_corsi rc ON cu.extraction_id = rc.extraction_id
            WHERE cu.user_id = ? AND cu.stato != 'eliminato'
            ORDER BY cu.aggiornato_il DESC
            """,
            (user_id,),
        )
        righe = cur.fetchall()
        corsi = []
        for r in righe:
            ext_id = r["extraction_id"]
            titolo = "Corso di formazione"
            if store is not None:
                try:
                    c = store.load(ext_id, 'course.json') or store.load(ext_id, 'draft.json')
                    if c and 'course' in c and isinstance(c['course'], dict):
                        titolo = c['course'].get('title', titolo)
                    elif c and isinstance(c, dict):
                        titolo = c.get('title', titolo)
                except Exception:
                    pass
            corsi.append({
                'extractionId': ext_id,
                'title': titolo,
                'status': r['stato'],
                'createdAt': r['creato_il'],
                'updatedAt': r['aggiornato_il'],
                'rigenerazioniUsate': int(r['rigenerazioni_usate']),
                'maxRigenerazioni': int(r['max_rigenerazioni']),
                'rigenerazioniRimanenti': max(0, int(r['max_rigenerazioni']) - int(r['rigenerazioni_usate'])),
            })
        return corsi

    try:
        try:
            return _esegui()
        except sqlite3.OperationalError:
            applica_migrazioni(conn)
            return _esegui()
    except Exception:
        return []
    finally:
        conn.close()
