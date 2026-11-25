"""Repository transazionale per la gestione dei duelli, giocate ed esiti (C4)."""
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .db import db_transaction
from .duelli_modelli import (
    DomandaDuelloSnapshot,
    DomandaPubblica,
    DuelloCreato,
    DuelloRisultatoRisposta,
    DuelloVista,
    EsitoDuello,
    PunteggioGiocata,
    StatoDuello,
)
from .duelli_regole import (
    calcola_esito,
    genera_codice_invito_duello,
    seleziona_domande,
    stato_effettivo,
    valuta_giocata,
)
from .duelli_viste import distribuisci_xp_esito, ottieni_vista_duello
from .referral_regole import maschera_nome_o_iniziali

logger = logging.getLogger(__name__)


class DuelNotFound(Exception):
    """Duello non trovato o utente non partecipante."""


class DuelActiveLimitReached(Exception):
    """Superato il limite di sfide attive contemporanee per utente."""


class DuelSelfAccept(Exception):
    """Il creatore non può accettare la propria sfida."""


class DuelAlreadyAccepted(Exception):
    """La sfida ha già un avversario accettato."""


class DuelExpired(Exception):
    """Il duello è scaduto."""


class DuelNotOpen(Exception):
    """Il duello non è nello stato aperto richiesto."""


class DuelNotStarted(Exception):
    """La giocata non è stata avviata."""


class DuelAlreadySubmitted(Exception):
    """La giocata è già stata consegnata."""


class DuelTimeLimitExceeded(Exception):
    """Tempo massimo per la giocata superato."""


class DuelNotFinished(Exception):
    """Il duello non è ancora concluso per la visualizzazione dei risultati."""


class DuelNotCancellable(Exception):
    """Il duello non può essere annullato (non in stato in_attesa)."""


def crea_duello(
    conn: sqlite3.Connection,
    creatore_id: str,
    extraction_id: str,
    titolo_corso: str,
    pool_domande: list[dict[str, Any]],
    n_domande: int = 10,
    seed: str | int | None = None,
) -> DuelloCreato:
    """Crea una nuova sfida asincrona congelando lo snapshot delle domande."""
    adesso_dt = datetime.now(timezone.utc)
    scade_dt = adesso_dt + timedelta(hours=72)

    with db_transaction(conn):
        r_attive = conn.execute(
            "SELECT COUNT(*) AS tot FROM duelli WHERE creatore_id = ? AND stato_salvato IN ('in_attesa', 'aperto')",
            (creatore_id,),
        ).fetchone()
        if r_attive and r_attive["tot"] >= 5:
            raise DuelActiveLimitReached("Limite massimo di 5 sfide aperte raggiunto.")

        domande_selezionate = seleziona_domande(pool_domande, n=n_domande, seed=seed)
        domande_snapshot_json = json.dumps([d.model_dump() for d in domande_selezionate])

        duello_id = str(uuid4())
        codice_invito = genera_codice_invito_duello()

        conn.execute(
            """
            INSERT INTO duelli (
                duello_id, modalita, creatore_id, avversario_id, codice_invito,
                extraction_id, titolo_corso, domande_snapshot, n_domande, tempo_max_giocata_s,
                creato_il, scade_il, stato_salvato, esito_json
            ) VALUES (?, 'asincrono', ?, NULL, ?, ?, ?, ?, ?, 900, ?, ?, 'in_attesa', NULL)
            """,
            (
                duello_id,
                creatore_id,
                codice_invito,
                extraction_id,
                titolo_corso,
                domande_snapshot_json,
                n_domande,
                adesso_dt.isoformat(),
                scade_dt.isoformat(),
            ),
        )

        conn.execute(
            "INSERT INTO duelli_giocate (duello_id, user_id) VALUES (?, ?)",
            (duello_id, creatore_id),
        )

        return DuelloCreato(duello_id=duello_id, codice_invito=codice_invito, scade_il=scade_dt)


def accetta_duello(
    conn: sqlite3.Connection,
    duello_id: str,
    avversario_id: str,
    codice_invito: str | None = None,
) -> None:
    """L'utente autenticato accetta la sfida diventando l'avversario."""
    adesso = datetime.now(timezone.utc)

    with db_transaction(conn):
        riga = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
        if not riga:
            raise DuelNotFound("Duello non trovato.")

        if codice_invito and riga["codice_invito"] != codice_invito:
            raise DuelNotFound("Codice invito non corrispondente.")

        if riga["creatore_id"] == avversario_id:
            raise DuelSelfAccept("Non puoi accettare una sfida creata da te stesso.")

        if riga["avversario_id"]:
            if riga["avversario_id"] == avversario_id:
                return  # Già accettato dallo stesso utente (idempotente)
            raise DuelAlreadyAccepted("La sfida è già stata accettata da un altro avversario.")

        if adesso >= datetime.fromisoformat(riga["scade_il"]):
            raise DuelExpired("La sfida è scaduta.")

        if riga["stato_salvato"] != "in_attesa":
            raise DuelNotOpen("La sfida non è più disponibile per l'accettazione.")

        conn.execute(
            "UPDATE duelli SET avversario_id = ?, stato_salvato = 'aperto' WHERE duello_id = ?",
            (avversario_id, duello_id),
        )
        conn.execute(
            "INSERT OR IGNORE INTO duelli_giocate (duello_id, user_id) VALUES (?, ?)",
            (duello_id, avversario_id),
        )


def inizia_giocata(
    conn: sqlite3.Connection,
    duello_id: str,
    user_id: str,
) -> tuple[list[DomandaPubblica], int, datetime]:
    """Inizia la sessione di gioco dell'utente (idempotente in lettura)."""
    adesso = datetime.now(timezone.utc)

    with db_transaction(conn):
        d_row = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
        if not d_row or user_id not in (d_row["creatore_id"], d_row["avversario_id"]):
            raise DuelNotFound("Duello non trovato.")

        if adesso >= datetime.fromisoformat(d_row["scade_il"]):
            raise DuelExpired("Il duello è scaduto.")

        if d_row["stato_salvato"] != "aperto":
            raise DuelNotOpen("Il duello non è ancora aperto per giocare.")

        g_row = conn.execute(
            "SELECT * FROM duelli_giocate WHERE duello_id = ? AND user_id = ?",
            (duello_id, user_id),
        ).fetchone()

        if g_row and g_row["consegnata_il"]:
            raise DuelAlreadySubmitted("Hai già consegnato le tue risposte.")

        if g_row and g_row["iniziata_il"]:
            iniziata_dt = datetime.fromisoformat(g_row["iniziata_il"])
        else:
            iniziata_dt = adesso
            conn.execute(
                "UPDATE duelli_giocate SET iniziata_il = ? WHERE duello_id = ? AND user_id = ?",
                (adesso.isoformat(), duello_id, user_id),
            )

        domande_raw = json.loads(d_row["domande_snapshot"])
        domande_pubbliche = [
            DomandaPubblica(
                domanda_id=q["domanda_id"],
                testo=q["testo"],
                opzioni=q["opzioni"],
            )
            for q in domande_raw
        ]

        return domande_pubbliche, d_row["tempo_max_giocata_s"], iniziata_dt


def consegna_giocata(
    conn: sqlite3.Connection,
    duello_id: str,
    user_id: str,
    risposte: list[Any],
    store_root: Path | None = None,
) -> tuple[int, int, bool]:
    """Valuta le risposte, registra la consegna e calcola l'esito se entrambi hanno terminato."""
    adesso = datetime.now(timezone.utc)

    with db_transaction(conn):
        d_row = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
        if not d_row or user_id not in (d_row["creatore_id"], d_row["avversario_id"]):
            raise DuelNotFound("Duello non trovato.")

        if adesso >= datetime.fromisoformat(d_row["scade_il"]):
            raise DuelExpired("Il duello è scaduto.")

        g_row = conn.execute(
            "SELECT * FROM duelli_giocate WHERE duello_id = ? AND user_id = ?",
            (duello_id, user_id),
        ).fetchone()

        if not g_row or not g_row["iniziata_il"]:
            raise DuelNotStarted("Sessione di duello non iniziata.")

        if g_row["consegnata_il"]:
            raise DuelAlreadySubmitted("Hai già consegnato le tue risposte per questo duello.")

        delta_s = (adesso - datetime.fromisoformat(g_row["iniziata_il"])).total_seconds()
        if delta_s > (d_row["tempo_max_giocata_s"] + 30):
            raise DuelTimeLimitExceeded("Tempo massimo per la giocata superato.")

        domande_raw = json.loads(d_row["domande_snapshot"])
        corrette, tempo_ms = valuta_giocata(domande_raw, risposte)

        risposte_dict = []
        for r in risposte:
            if hasattr(r, "model_dump"):
                d = r.model_dump()
                risposte_dict.append({"domanda_id": d.get("domanda_id"), "scelta": d.get("scelta"), "ms": d.get("ms", 0)})
            elif isinstance(r, dict):
                risposte_dict.append({"domanda_id": r.get("domanda_id"), "scelta": r.get("scelta"), "ms": r.get("ms", 0)})
            else:
                risposte_dict.append({"domanda_id": getattr(r, "domanda_id", None), "scelta": getattr(r, "scelta", None), "ms": getattr(r, "ms", 0)})

        conn.execute(
            """
            UPDATE duelli_giocate
            SET consegnata_il = ?, risposte_json = ?, corrette = ?, tempo_totale_ms = ?
            WHERE duello_id = ? AND user_id = ?
            """,
            (adesso.isoformat(), json.dumps(risposte_dict), corrette, tempo_ms, duello_id, user_id),
        )

        # Verifica se l'altra giocata è già consegnata
        tutte = conn.execute("SELECT * FROM duelli_giocate WHERE duello_id = ?", (duello_id,)).fetchall()
        chiuso = False

        if len(tutte) == 2 and all(r["consegnata_il"] for r in tutte):
            g_c = next((r for r in tutte if r["user_id"] == d_row["creatore_id"]), None)
            g_a = next((r for r in tutte if r["user_id"] == d_row["avversario_id"]), None)

            esito = calcola_esito(
                creatore_id=d_row["creatore_id"],
                avversario_id=d_row["avversario_id"],
                g_creatore=dict(g_c) if g_c else None,
                g_avversario=dict(g_a) if g_a else None,
                scaduto=False,
            )

            conn.execute(
                "UPDATE duelli SET stato_salvato = 'completato', esito_json = ? WHERE duello_id = ?",
                (json.dumps(esito.model_dump()), duello_id),
            )
            chiuso = True

            # Eventi gamification
            distribuisci_xp_esito(store_root, d_row, esito)

        return corrette, tempo_ms, chiuso


def risultato_duello(
    conn: sqlite3.Connection,
    duello_id: str,
    user_id: str,
    store_root: Path | None = None,
) -> DuelloRisultatoRisposta:
    """Restituisce il risultato del duello; include le soluzioni solo se l'utente ha consegnato."""
    adesso = datetime.now(timezone.utc)

    with db_transaction(conn):
        d_row = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
        if not d_row or user_id not in (d_row["creatore_id"], d_row["avversario_id"]):
            raise DuelNotFound("Duello non trovato.")

        scade_dt = datetime.fromisoformat(d_row["scade_il"])
        scaduto = adesso >= scade_dt

        giocate = conn.execute("SELECT * FROM duelli_giocate WHERE duello_id = ?", (duello_id,)).fetchall()
        g_c = next((r for r in giocate if r["user_id"] == d_row["creatore_id"]), None)
        g_a = next((r for r in giocate if r["user_id"] == d_row["avversario_id"]), None)

        c_cons = bool(g_c and g_c["consegnata_il"])
        a_cons = bool(g_a and g_a["consegnata_il"])

        stato = stato_effettivo(
            stato_salvato=d_row["stato_salvato"],
            avversario_id=d_row["avversario_id"],
            c_consegnata=c_cons,
            a_consegnata=a_cons,
            scade_il=scade_dt,
            adesso=adesso,
        )

        esito_dict: dict[str, Any] | None = None
        if d_row["esito_json"]:
            esito_dict = json.loads(d_row["esito_json"])
        elif stato in ("completato", "scaduto"):
            # Chiusura lazy e idempotente
            esito_obj = calcola_esito(
                creatore_id=d_row["creatore_id"],
                avversario_id=d_row["avversario_id"],
                g_creatore=dict(g_c) if g_c else None,
                g_avversario=dict(g_a) if g_a else None,
                scaduto=scaduto,
            )
            esito_dict = esito_obj.model_dump()
            conn.execute(
                "UPDATE duelli SET stato_salvato = ?, esito_json = ? WHERE duello_id = ?",
                (stato, json.dumps(esito_dict), duello_id),
            )
            distribuisci_xp_esito(store_root, d_row, esito_obj)

        la_mia_g = next((r for r in giocate if r["user_id"] == user_id), None)
        ha_consegnato = bool(la_mia_g and la_mia_g["consegnata_il"])

        if stato not in ("completato", "scaduto") and not ha_consegnato:
            raise DuelNotFinished("Il duello non è ancora concluso.")

        soluzioni = None
        if ha_consegnato:
            domande_raw = json.loads(d_row["domande_snapshot"])
            soluzioni = [DomandaDuelloSnapshot(**q) for q in domande_raw]

        return DuelloRisultatoRisposta(
            stato=stato,
            esito=EsitoDuello(**esito_dict) if esito_dict else None,
            soluzioni=soluzioni,
        )


def annulla_duello(conn: sqlite3.Connection, duello_id: str, user_id: str) -> None:
    """Annulla la sfida (solo creatore e solo se ancora in_attesa)."""
    with db_transaction(conn):
        row = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
        if not row or row["creatore_id"] != user_id:
            raise DuelNotFound("Duello non trovato.")
        if row["stato_salvato"] != "in_attesa":
            raise DuelNotCancellable("Il duello non può essere annullato nello stato corrente.")
        conn.execute("UPDATE duelli SET stato_salvato = 'annullato' WHERE duello_id = ?", (duello_id,))

