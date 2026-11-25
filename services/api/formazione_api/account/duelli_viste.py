"""Funzioni di visualizzazione e integrazione gamification per i duelli (C4)."""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .duelli_modelli import DuelloVista, EsitoDuello
from .duelli_regole import stato_effettivo
from .referral_regole import maschera_nome_o_iniziali

logger = logging.getLogger(__name__)


def accredita_xp_duello(
    store_root: Path | None,
    extraction_id: str,
    duello_id: str,
    user_id: str,
    xp: int,
) -> None:
    """Hook di integrazione XP gamification idempotente (V-7). Non blocca mai."""
    if xp <= 0 or not store_root:
        return
    try:
        from ..gamification_storage import carica_stato, salva_stato
        event_id = f"duello:{duello_id}:{user_id}"
        stato = carica_stato(store_root, extraction_id)
        if event_id in stato.eventiElaborati:
            return
        stato.eventiElaborati.append(event_id)
        stato.xpTotali += xp
        salva_stato(store_root, stato)
        logger.info("XP duello accreditati: user=%s xp=%d extraction=%s", user_id, xp, extraction_id)
    except Exception as exc:
        logger.info("Hook gamification duello non applicato: %s", exc)


def distribuisci_xp_esito(store_root: Path | None, d_row: sqlite3.Row, esito: EsitoDuello) -> None:
    """Distribuisce gli XP di vittoria/pareggio/sconfitta/forfait per il duello."""
    c_id = d_row["creatore_id"]
    a_id = d_row["avversario_id"]
    ext_id = d_row["extraction_id"]
    duello_id = d_row["duello_id"]

    if esito.motivo == "PAREGGIO":
        accredita_xp_duello(store_root, ext_id, duello_id, c_id, 15)
        if a_id:
            accredita_xp_duello(store_root, ext_id, duello_id, a_id, 15)
    elif esito.motivo in ("PUNTEGGIO", "TEMPO", "FORFAIT"):
        vincitore = esito.vincitore_id
        perdente = a_id if vincitore == c_id else c_id
        if vincitore:
            accredita_xp_duello(store_root, ext_id, duello_id, vincitore, 30)
        if perdente and esito.motivo != "FORFAIT":
            accredita_xp_duello(store_root, ext_id, duello_id, perdente, 5)


def ottieni_vista_duello(conn: sqlite3.Connection, duello_id: str, user_id: str) -> DuelloVista:
    """Restituisce la vista completa DuelloVista per il partecipante autenticato."""
    from .duelli_repo import DuelNotFound

    adesso = datetime.now(timezone.utc)
    d_row = conn.execute("SELECT * FROM duelli WHERE duello_id = ?", (duello_id,)).fetchone()
    if not d_row or user_id not in (d_row["creatore_id"], d_row["avversario_id"]):
        raise DuelNotFound("Duello non trovato.")

    giocate = conn.execute("SELECT * FROM duelli_giocate WHERE duello_id = ?", (duello_id,)).fetchall()
    g_c = next((r for r in giocate if r["user_id"] == d_row["creatore_id"]), None)
    g_a = next((r for r in giocate if r["user_id"] == d_row["avversario_id"]), None)

    scade_dt = datetime.fromisoformat(d_row["scade_il"])
    stato = stato_effettivo(
        stato_salvato=d_row["stato_salvato"],
        avversario_id=d_row["avversario_id"],
        c_consegnata=bool(g_c and g_c["consegnata_il"]),
        a_consegnata=bool(g_a and g_a["consegnata_il"]),
        scade_il=scade_dt,
        adesso=adesso,
    )

    ruolo = "creatore" if user_id == d_row["creatore_id"] else "avversario"
    la_mia_g = g_c if ruolo == "creatore" else g_a
    altra_g = g_a if ruolo == "creatore" else g_c

    def _stato_g(g):
        if not g or not g["iniziata_il"]:
            return "non_iniziata"
        return "consegnata" if g["consegnata_il"] else "iniziata"

    # Risolvi nomi
    u_c = conn.execute("SELECT nome_visualizzato, email FROM utenti WHERE user_id = ?", (d_row["creatore_id"],)).fetchone()
    creatore_nome = maschera_nome_o_iniziali(u_c["nome_visualizzato"] if u_c else None, u_c["email"] if u_c else None)

    avversario_nome = None
    if d_row["avversario_id"]:
        u_a = conn.execute("SELECT nome_visualizzato, email FROM utenti WHERE user_id = ?", (d_row["avversario_id"],)).fetchone()
        avversario_nome = maschera_nome_o_iniziali(u_a["nome_visualizzato"] if u_a else None, u_a["email"] if u_a else None)

    return DuelloVista(
        duello_id=d_row["duello_id"],
        stato=stato,
        titolo_corso=d_row["titolo_corso"],
        n_domande=d_row["n_domande"],
        scade_il=scade_dt,
        ruolo=ruolo,
        la_mia_giocata=_stato_g(la_mia_g),
        giocata_altro=_stato_g(altra_g) if d_row["avversario_id"] else None,
        codice_invito=d_row["codice_invito"] if ruolo == "creatore" else None,
        avversario_nome=avversario_nome,
        creatore_nome=creatore_nome,
    )
