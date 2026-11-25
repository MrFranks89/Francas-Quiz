"""Regole pure per la selezione delle domande, valutazione giocate, calcolo esito e stato duelli."""
from __future__ import annotations

import random
import secrets
from datetime import datetime
from typing import Any

from .duelli_modelli import (
    DomandaDuelloSnapshot,
    EsitoDuello,
    PunteggioGiocata,
    StatoDuello,
)

ALFABETO_DUELLI = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
TIPI_AMMESSI_DUELLO = frozenset({"single", "scenario", "oddOneOut", "correctStatement"})


class NotEnoughQuestionsError(Exception):
    """Sollevata quando le domande eleggibili sono inferiori a quelle richieste."""
    def __init__(self, richieste: int, eleggibili: int):
        super().__init__(f"Domande eleggibili insufficienti: richieste {richieste}, disponibili {eleggibili}.")
        self.richieste = richieste
        self.eleggibili = eleggibili


def genera_codice_invito_duello() -> str:
    """Genera un codice invito per duello nel formato DUE-XXXXXXXX (CSPRNG, 30 simboli)."""
    corpo = "".join(secrets.choice(ALFABETO_DUELLI) for _ in range(8))
    return f"DUE-{corpo}"


def filtra_domande_eleggibili(domande: list[dict[str, Any]]) -> list[DomandaDuelloSnapshot]:
    """Applica il filtro rigoroso di eleggibilità E14-4 per il duello."""
    eleggibili: list[DomandaDuelloSnapshot] = []

    for q in domande:
        kind = q.get("kind", "single")
        if kind not in TIPI_AMMESSI_DUELLO:
            continue

        raw_options = q.get("options", [])
        if not raw_options or len(raw_options) < 2:
            continue

        # Estrai opzioni come lista di stringhe
        opzioni_testo: list[str] = []
        opzioni_id: list[str] = []
        for opt in raw_options:
            if isinstance(opt, dict):
                opzioni_testo.append(str(opt.get("text", "")).strip())
                opzioni_id.append(str(opt.get("id", "")))
            else:
                opzioni_testo.append(str(opt).strip())
                opzioni_id.append("")

        # Risolvi correctIndex singolo
        correct_idx: int | None = None
        if "correctIndex" in q and isinstance(q["correctIndex"], int):
            correct_idx = q["correctIndex"]
        elif "correctOptionId" in q and q["correctOptionId"]:
            c_id = str(q["correctOptionId"])
            if c_id in opzioni_id:
                correct_idx = opzioni_id.index(c_id)

        if correct_idx is None or not (0 <= correct_idx < len(opzioni_testo)):
            continue

        testo = str(q.get("prompt") or q.get("testo") or "").strip()
        if not testo:
            continue

        explanation = str(q.get("explanation") or q.get("spiegazione") or "").strip()
        q_id = str(q.get("id") or q.get("domanda_id") or "")

        eleggibili.append(
            DomandaDuelloSnapshot(
                domanda_id=q_id,
                testo=testo,
                opzioni=opzioni_testo,
                correctIndex=correct_idx,
                explanation=explanation,
            )
        )

    return eleggibili


def seleziona_domande(
    pool: list[dict[str, Any]],
    n: int = 10,
    seed: str | int | None = None,
) -> list[DomandaDuelloSnapshot]:
    """Seleziona n domande eleggibili distinte in modo deterministico dato un seed."""
    eleggibili = filtra_domande_eleggibili(pool)
    if len(eleggibili) < n:
        raise NotEnoughQuestionsError(richieste=n, eleggibili=len(eleggibili))

    rng = random.Random(str(seed) if seed is not None else None)
    # Selezione casuale riproducibile dei campioni
    indici = sorted(rng.sample(range(len(eleggibili)), n))
    return [eleggibili[i] for i in indici]


def valuta_giocata(
    domande_snapshot: list[DomandaDuelloSnapshot] | list[dict[str, Any]],
    risposte: list[Any],
) -> tuple[int, int]:
    """Valuta le risposte di una giocata calcolando (corrette, tempo_totale_ms)."""
    resp_map: dict[str, tuple[int | None, int]] = {}
    for r in risposte:
        if hasattr(r, "model_dump"):
            d = r.model_dump()
            q_id, scelta, ms = d.get("domanda_id"), d.get("scelta"), d.get("ms", 0)
        elif isinstance(r, dict):
            q_id, scelta, ms = r.get("domanda_id"), r.get("scelta"), r.get("ms", 0)
        else:
            q_id = getattr(r, "domanda_id", None)
            scelta = getattr(r, "scelta", None)
            ms = getattr(r, "ms", 0)
        if q_id:
            resp_map[str(q_id)] = (scelta, int(ms))

    corrette = 0
    tempo_totale_ms = 0

    for d in domande_snapshot:
        q_id = d.domanda_id if hasattr(d, "domanda_id") else d.get("domanda_id")
        correct_idx = d.correctIndex if hasattr(d, "correctIndex") else d.get("correctIndex")

        if q_id in resp_map:
            scelta, ms = resp_map[q_id]
            tempo_totale_ms += ms
            if scelta is not None and scelta == correct_idx:
                corrette += 1

    return corrette, tempo_totale_ms


def calcola_esito(
    *,
    creatore_id: str,
    avversario_id: str | None,
    g_creatore: dict[str, Any] | None,
    g_avversario: dict[str, Any] | None,
    scaduto: bool,
) -> EsitoDuello:
    """Calcola l'esito finale del duello (vincitore, motivo e punteggi)."""
    punteggi: dict[str, PunteggioGiocata] = {}

    c_consegnata = bool(g_creatore and g_creatore.get("consegnata_il"))
    a_consegnata = bool(g_avversario and g_avversario.get("consegnata_il"))

    if g_creatore and g_creatore.get("corrette") is not None:
        punteggi[creatore_id] = PunteggioGiocata(
            corrette=g_creatore["corrette"],
            tempo_totale_ms=g_creatore.get("tempo_totale_ms") or 0,
        )

    if avversario_id and g_avversario and g_avversario.get("corrette") is not None:
        punteggi[avversario_id] = PunteggioGiocata(
            corrette=g_avversario["corrette"],
            tempo_totale_ms=g_avversario.get("tempo_totale_ms") or 0,
        )

    # Entrambe consegnate
    if c_consegnata and a_consegnata and avversario_id:
        c_p = punteggi[creatore_id]
        a_p = punteggi[avversario_id]

        if c_p.corrette > a_p.corrette:
            return EsitoDuello(vincitore_id=creatore_id, motivo="PUNTEGGIO", punteggi=punteggi)
        if a_p.corrette > c_p.corrette:
            return EsitoDuello(vincitore_id=avversario_id, motivo="PUNTEGGIO", punteggi=punteggi)

        # Parità di punteggio: decide il tempo totale
        if c_p.tempo_totale_ms < a_p.tempo_totale_ms:
            return EsitoDuello(vincitore_id=creatore_id, motivo="TEMPO", punteggi=punteggi)
        if a_p.tempo_totale_ms < c_p.tempo_totale_ms:
            return EsitoDuello(vincitore_id=avversario_id, motivo="TEMPO", punteggi=punteggi)

        return EsitoDuello(vincitore_id=None, motivo="PAREGGIO", punteggi=punteggi)

    # Scaduto con una sola consegna (FORFAIT)
    if scaduto:
        if c_consegnata and not a_consegnata:
            return EsitoDuello(vincitore_id=creatore_id, motivo="FORFAIT", punteggi=punteggi)
        if a_consegnata and not c_consegnata and avversario_id:
            return EsitoDuello(vincitore_id=avversario_id, motivo="FORFAIT", punteggi=punteggi)
        return EsitoDuello(vincitore_id=None, motivo="NULLA", punteggi=punteggi)

    return EsitoDuello(vincitore_id=None, motivo="NULLA", punteggi=punteggi)


def stato_effettivo(
    *,
    stato_salvato: str,
    avversario_id: str | None,
    c_consegnata: bool,
    a_consegnata: bool,
    scade_il: datetime,
    adesso: datetime,
) -> StatoDuello:
    """Calcola lo stato dinamico effettivo del duello (in base all'orologio e alle consegne)."""
    if stato_salvato == "annullato":
        return "annullato"
    if c_consegnata and a_consegnata:
        return "completato"
    if adesso >= scade_il:
        return "scaduto"
    if not avversario_id:
        return "in_attesa"
    return "aperto"
