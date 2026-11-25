"""Repository per la gestione transazionale di codici referral, accrediti e audit."""
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import get_referral_finestra_ore, get_tetto_corsi_extra
from .db import db_transaction, open_db
from .modelli import ReferralStato, RegistrazioneVista, RiscattoRisposta
from .referral_regole import (
    genera_codice_referral,
    maschera_nome_o_iniziali,
    normalizza_codice_referral,
    valuta_antiabuso,
)

logger = logging.getLogger(__name__)


class ReferralCodeUnknown(Exception):
    """Sollevata quando il codice referral non esiste."""


class ReferralAlreadyRedeemed(Exception):
    """Sollevata quando l'utente ha già riscattato un altro codice referral."""


def assicura_codice_referral(conn: sqlite3.Connection, user_id: str) -> str:
    """Restituisce il codice referral dell'utente, creandolo se assente (max 5 tentativi)."""
    riga = conn.execute(
        "SELECT codice_referral FROM utenti WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    if riga and riga["codice_referral"]:
        return riga["codice_referral"]

    for _ in range(5):
        nuovo_codice = genera_codice_referral()
        adesso = datetime.now(timezone.utc).isoformat()
        try:
            with conn:
                conn.execute(
                    """
                    UPDATE utenti
                    SET codice_referral = ?, aggiornato_il = ?
                    WHERE user_id = ? AND codice_referral IS NULL
                    """,
                    (nuovo_codice, adesso, user_id),
                )
            riga = conn.execute(
                "SELECT codice_referral FROM utenti WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if riga and riga["codice_referral"]:
                return riga["codice_referral"]
        except sqlite3.IntegrityError:
            continue

    raise RuntimeError("REFERRAL_CODE_GENERATION_FAILED: Impossibile generare codice univoco dopo 5 tentativi.")


def registra_accesso_recente(
    conn: sqlite3.Connection,
    user_id: str,
    device_hash: str | None,
    ip_hash: str | None,
) -> None:
    """Registra l'accesso recente (max 1 riga per giorno/coppia). Retention 90 giorni."""
    if not device_hash and not ip_hash:
        return

    adesso_dt = datetime.now(timezone.utc)
    adesso_iso = adesso_dt.isoformat()

    riga = conn.execute(
        """
        SELECT rowid, visto_il FROM accessi_recenti
        WHERE user_id = ? AND device_hash IS ? AND ip_hash IS ?
        ORDER BY visto_il DESC LIMIT 1
        """,
        (user_id, device_hash, ip_hash),
    ).fetchone()

    if riga:
        ultimo_dt = datetime.fromisoformat(riga["visto_il"])
        if (adesso_dt - ultimo_dt).total_seconds() < 86400:
            return

    conn.execute(
        """
        INSERT INTO accessi_recenti (user_id, device_hash, ip_hash, visto_il)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, device_hash, ip_hash, adesso_iso),
    )


def rileva_segnali_abuso(
    conn: sqlite3.Connection,
    invitante_id: str,
    device_hash: str | None,
    ip_hash: str | None,
) -> list[str]:
    """Rileva segnali informativi non bloccanti confrontando gli accessi con l'invitante."""
    segnali: list[str] = []
    if device_hash:
        match_dev = conn.execute(
            "SELECT 1 FROM accessi_recenti WHERE user_id = ? AND device_hash = ? LIMIT 1",
            (invitante_id, device_hash),
        ).fetchone()
        if match_dev:
            segnali.append("STESSO_DISPOSITIVO")

    if ip_hash:
        match_ip = conn.execute(
            "SELECT 1 FROM accessi_recenti WHERE user_id = ? AND ip_hash = ? LIMIT 1",
            (invitante_id, ip_hash),
        ).fetchone()
        if match_ip:
            segnali.append("STESSO_IP")

    if segnali:
        logger.warning(
            "referral.segnale: invitante=%s segnali=%s",
            invitante_id,
            segnali,
        )

    return segnali


def applica_referral(
    conn: sqlite3.Connection,
    invitato_id: str,
    codice_grezzo: str,
    device_hash: str | None = None,
    ip_hash: str | None = None,
    is_redeem: bool = False,
) -> RiscattoRisposta:
    """Esegue l'accredito o la registrazione del tentativo in una singola transazione BEGIN IMMEDIATE."""
    codice = normalizza_codice_referral(codice_grezzo)
    adesso_dt = datetime.now(timezone.utc)
    adesso_iso = adesso_dt.isoformat()

    with db_transaction(conn):
        registra_accesso_recente(conn, invitato_id, device_hash, ip_hash)

        invitato_row = conn.execute(
            "SELECT * FROM utenti WHERE user_id = ?",
            (invitato_id,),
        ).fetchone()
        if not invitato_row:
            raise KeyError(f"Utente {invitato_id} non trovato per accredito referral.")

        invitante_row = conn.execute(
            "SELECT * FROM utenti WHERE codice_referral = ?",
            (codice,),
        ).fetchone()

        if not invitante_row:
            conn.execute(
                """
                INSERT INTO referral_log (invitato_user_id, invitante_user_id, codice, esito, segnali, creato_il)
                VALUES (?, NULL, ?, 'CODICE_SCONOSCIUTO', '[]', ?)
                """,
                (invitato_id, codice, adesso_iso),
            )
            if is_redeem:
                raise ReferralCodeUnknown("Codice referral non trovato.")
            return RiscattoRisposta(accreditato=False, esito="CODICE_SCONOSCIUTO", segnali=[])

        invitante_id = invitante_row["user_id"]
        segnali = rileva_segnali_abuso(conn, invitante_id, device_hash, ip_hash)

        # Controllo riga esistente in referral_accrediti
        accredito_esistente = conn.execute(
            "SELECT * FROM referral_accrediti WHERE invitato_user_id = ?",
            (invitato_id,),
        ).fetchone()

        if accredito_esistente:
            if accredito_esistente["codice"] != codice and is_redeem:
                raise ReferralAlreadyRedeemed("Utente gia' accreditato con un altro codice referral.")

            conn.execute(
                """
                INSERT INTO referral_log (invitato_user_id, invitante_user_id, codice, esito, segnali, creato_il)
                VALUES (?, ?, ?, 'GIA_ACCREDITATO', ?, ?)
                """,
                (invitato_id, invitante_id, codice, json.dumps(segnali), adesso_iso),
            )
            return RiscattoRisposta(accreditato=False, esito="GIA_ACCREDITATO", segnali=[])

        # Controllo email già vista
        email_hash = invitato_row["email_norm_hash"]
        email_gia_vista_da_altro = False
        if email_hash:
            vista_row = conn.execute(
                "SELECT primo_user_id FROM email_viste WHERE email_norm_hash = ?",
                (email_hash,),
            ).fetchone()
            if vista_row and vista_row["primo_user_id"] != invitato_id:
                email_gia_vista_da_altro = True

        esito, accreditabile = valuta_antiabuso(
            invitante_id=invitante_id,
            invitato_id=invitato_id,
            invitante_email_hash=invitante_row["email_norm_hash"],
            invitato_email_hash=invitato_row["email_norm_hash"],
            email_gia_vista_da_altro=email_gia_vista_da_altro,
            creato_il_invitato=datetime.fromisoformat(invitato_row["creato_il"]),
            adesso=adesso_dt,
            finestra_ore=get_referral_finestra_ore(),
            gia_accreditato=False,
            corsi_extra_invitante=invitante_row["corsi_extra_referral"],
            tetto_corsi_extra=get_tetto_corsi_extra(),
            is_redeem=is_redeem,
        )

        conn.execute(
            """
            INSERT INTO referral_log (invitato_user_id, invitante_user_id, codice, esito, segnali, creato_il)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (invitato_id, invitante_id, codice, esito, json.dumps(segnali), adesso_iso),
        )

        if accreditabile:
            conn.execute(
                """
                INSERT INTO referral_accrediti (invitato_user_id, invitante_user_id, codice, creato_il)
                VALUES (?, ?, ?, ?)
                """,
                (invitato_id, invitante_id, codice, adesso_iso),
            )
            conn.execute(
                """
                UPDATE utenti
                SET corsi_extra_referral = corsi_extra_referral + 1, aggiornato_il = ?
                WHERE user_id = ?
                """,
                (adesso_iso, invitante_id),
            )

        return RiscattoRisposta(accreditato=accreditabile, esito=esito, segnali=[])


def applica_referral_automatico(
    conn: sqlite3.Connection,
    invitato_id: str,
    codice_grezzo: str | None,
    device_hash: str | None = None,
    ip_hash: str | None = None,
) -> None:
    """Tenta l'accredito automatico del codice presente nei metadati del JWT. Non fallisce mai."""
    if not codice_grezzo:
        return
    try:
        applica_referral(
            conn=conn,
            invitato_id=invitato_id,
            codice_grezzo=codice_grezzo,
            device_hash=device_hash,
            ip_hash=ip_hash,
            is_redeem=False,
        )
    except Exception as exc:
        logger.info("Accredito referral automatico non applicato: %s", exc)


def ottieni_stato_referral(
    conn: sqlite3.Connection,
    user_id: str,
) -> ReferralStato:
    """Restituisce lo stato referral dell'utente con statistiche aggregate e ultime registrazioni."""
    codice = assicura_codice_referral(conn, user_id)

    utente_row = conn.execute(
        "SELECT corsi_extra_referral FROM utenti WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    extra = utente_row["corsi_extra_referral"] if utente_row else 0

    acc_row = conn.execute(
        "SELECT COUNT(*) AS tot FROM referral_accrediti WHERE invitante_user_id = ?",
        (user_id,),
    ).fetchone()
    accreditate = acc_row["tot"] if acc_row else 0

    non_acc_row = conn.execute(
        "SELECT COUNT(*) AS tot FROM referral_log WHERE invitante_user_id = ? AND esito != 'ACCREDITATO'",
        (user_id,),
    ).fetchone()
    non_accreditate = non_acc_row["tot"] if non_acc_row else 0

    ultime_rows = conn.execute(
        """
        SELECT a.creato_il, u.nome_visualizzato, u.email
        FROM referral_accrediti a
        LEFT JOIN utenti u ON u.user_id = a.invitato_user_id
        WHERE a.invitante_user_id = ?
        ORDER BY a.creato_il DESC
        LIMIT 20
        """,
        (user_id,),
    ).fetchall()

    ultime: list[RegistrazioneVista] = []
    for r in ultime_rows:
        mascherato = maschera_nome_o_iniziali(r["nome_visualizzato"], r["email"])
        ultime.append(
            RegistrazioneVista(
                nome_o_iniziali=mascherato,
                data=datetime.fromisoformat(r["creato_il"]),
            )
        )

    return ReferralStato(
        codice=codice,
        registrazioni_accreditate=accreditate,
        registrazioni_non_accreditate=non_accreditate,
        corsi_extra_guadagnati=extra,
        tetto_corsi_extra=get_tetto_corsi_extra(),
        inviti_condivisi=None,
        ultime_registrazioni=ultime,
    )
