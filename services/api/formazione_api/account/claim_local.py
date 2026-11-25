"""Script amministrativo per il claim e l'associazione dei dati legacy locali ad un account utente (C1.6 / B6)."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .db import db_transaction, open_db, resolve_db_path
from .percorsi import radice_utente
from .repo_utenti import calcola_email_norm_hash

logger = logging.getLogger("claim_local")

_ID_ESTRAZIONE_REGEX = re.compile(r"^([a-f0-9]{32})\.(extraction|course|document|draft)\.json$")


def _calcola_sha256(file_path: Path) -> str:
    """Calcola l'hash SHA256 di un file."""
    h = hashlib.sha256()
    with file_path.open("rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def esegui_claim_local(
    email: str,
    base_dir: Path | str,
    dry_run: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    """Esegue il claim dei dati locali associandoli all'utente Supabase identificato dall'email."""
    base_path = Path(base_dir).resolve()
    db_file = resolve_db_path(base_path)
    if not db_file.exists():
        raise RuntimeError(f"Database accounts.sqlite3 non trovato in {db_file}.")

    conn = open_db(db_file)
    try:
        email_hash = calcola_email_norm_hash(email)
        r_utente = conn.execute(
            "SELECT * FROM utenti WHERE email_norm_hash = ? OR email = ?",
            (email_hash, email.strip().lower()),
        ).fetchone()

        if not r_utente:
            raise RuntimeError(f"Utente con email '{email}' non trovato nel database.")

        user_id = r_utente["user_id"]
        radice_legacy = radice_utente("local", base_path)
        radice_dest = radice_utente(user_id, base_path)

        # 1. Controllo marcatori claim esistenti
        marcatore_proprio = radice_legacy / f".claimed_by_{user_id}"
        altri_marcatori = [
            m for m in radice_legacy.glob(".claimed_by_*")
            if m.name != f".claimed_by_{user_id}"
        ]

        if marcatore_proprio.exists() and not force:
            logger.info("Dati legacy già reclamati da questo utente in data precedente.")
            return {
                "status": "already_claimed",
                "user_id": user_id,
                "files_copied": 0,
                "courses_indexed": 0,
            }

        if altri_marcatori and not force:
            nomi = [m.name for m in altri_marcatori]
            raise RuntimeError(f"I dati legacy sono già stati reclamati da un altro account ({nomi}). Usa --force per forzare.")

        # 2. Controllo corsi preesistenti dell'utente
        r_corsi = conn.execute(
            "SELECT COUNT(*) AS tot FROM corsi_utente WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        tot_corsi = r_corsi["tot"] if r_corsi else 0
        if tot_corsi > 0 and not force:
            raise RuntimeError(f"L'utente ha già {tot_corsi} corsi registrati. Usa --force per importare comunque.")

        # 3. Raccolta file da copiare dalla radice legacy
        file_da_copiare: list[Path] = []
        if radice_legacy.exists():
            for item in radice_legacy.iterdir():
                if item.is_file():
                    if item.name.startswith(".claimed_by_") or ".sqlite3" in item.name or item.name.endswith(".tmp"):
                        continue
                    file_da_copiare.append(item)

        # Individua gli extraction_id
        extraction_ids: set[str] = set()
        for f in file_da_copiare:
            m = _ID_ESTRAZIONE_REGEX.match(f.name)
            if m:
                extraction_ids.add(m.group(1))

        if dry_run:
            logger.info("DRY-RUN: trovati %d file e %d estrazioni da copiare per user %s.", len(file_da_copiare), user_id, len(extraction_ids))
            return {
                "status": "dry_run",
                "user_id": user_id,
                "files_found": len(file_da_copiare),
                "courses_found": len(extraction_ids),
            }

        # 4. Copia dei file e verifica checksum
        radice_dest.mkdir(parents=True, exist_ok=True)
        adesso = datetime.now(timezone.utc).isoformat()
        files_copiati = 0

        for src_file in file_da_copiare:
            dest_file = radice_dest / src_file.name
            src_hash = _calcola_sha256(src_file)
            shutil.copy2(src_file, dest_file)
            dest_hash = _calcola_sha256(dest_file)
            if src_hash != dest_hash:
                dest_file.unlink(missing_ok=True)
                raise IOError(f"Verifica integrità fallita durante la copia di {src_file.name}.")
            files_copiati += 1

        # 5. Scrittura del marcatore
        info_marcatore = {
            "user_id": user_id,
            "email": email,
            "claimed_at": adesso,
            "file_count": files_copiati,
        }
        marcatore_proprio.write_text(json.dumps(info_marcatore, indent=2), encoding="utf-8")

        # 6. Reindicizzazione in corsi_utente
        with db_transaction(conn):
            for eid in sorted(extraction_ids):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO corsi_utente (extraction_id, user_id, stato, creato_il, aggiornato_il)
                    VALUES (?, ?, 'attivo', ?, ?)
                    """,
                    (eid, user_id, adesso, adesso),
                )

        return {
            "status": "ok",
            "user_id": user_id,
            "files_copied": files_copiati,
            "courses_indexed": len(extraction_ids),
        }
    finally:
        conn.close()


def avvisa_se_dati_legacy_non_reclamati(base_dir: Path | str) -> None:
    """Emette un WARNING nei log all'avvio se esistono dati legacy non ancora reclamati."""
    p = Path(base_dir)
    if not p.exists():
        return
    marcatori = list(p.glob(".claimed_by_*"))
    if marcatori:
        return
    ha_dati_legacy = any(
        f.is_file() and ".sqlite3" not in f.name and not f.name.endswith(".tmp") and not f.name.startswith(".")
        for f in p.iterdir()
    )
    if ha_dati_legacy:
        logging.getLogger("formazione_api").warning(
            "Trovati dati legacy non reclamati nella radice locale. "
            "Esegui 'python -m formazione_api.account.claim_local --email <email>' per associarli ad un account."
        )


def main() -> None:
    """Entry point da linea di comando."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="Associa i dati locali legacy a un account utente (TASK-14 B6).")
    parser.add_argument("--email", required=True, help="Email dell'utente Supabase registrato.")
    parser.add_argument("--dry-run", action="store_true", help="Simula l'operazione senza scrivere su disco o database.")
    parser.add_argument("--force", action="store_true", help="Forza l'importazione anche se l'utente ha già corsi.")
    parser.add_argument("--storage-dir", default=None, help="Radice dati dell'API (default da FORMAZIONE_DATA_DIR).")

    args = parser.parse_args()
    base_dir = args.storage_dir or os.getenv("FORMAZIONE_DATA_DIR")
    if not base_dir:
        base_dir = Path(__file__).resolve().parents[4] / "var" / "api"

    try:
        res = esegui_claim_local(
            email=args.email,
            base_dir=base_dir,
            dry_run=args.dry_run,
            force=args.force,
        )
        print(json.dumps(res, indent=2))
    except Exception as exc:
        print(f"ERRORE: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
