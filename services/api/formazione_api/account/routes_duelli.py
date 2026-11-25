"""Endpoint FastAPI per il sottosistema Duello Asincrono Pro (/duels)."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..funzioni import richiedi_funzione
from .auth import utente_corrente
from .config import is_auth_required
from .db import open_db, resolve_db_path
from .duelli_modelli import (
    AccettaDuelloRichiesta,
    ConsegnaRichiesta,
    ConsegnaRisposta,
    CreaDuelloRichiesta,
    DuelloAnteprima,
    DuelloCreato,
    DuelloRisultatoRisposta,
    DuelloVista,
    DuelliElencoRisposta,
    StartGiocataRisposta,
)
from .modelli import Utente
from .duelli_regole import NotEnoughQuestionsError, stato_effettivo
from .duelli_repo import (
    DuelActiveLimitReached,
    DuelAlreadyAccepted,
    DuelAlreadySubmitted,
    DuelExpired,
    DuelNotCancellable,
    DuelNotFinished,
    DuelNotFound,
    DuelNotOpen,
    DuelNotStarted,
    DuelSelfAccept,
    DuelTimeLimitExceeded,
    accetta_duello,
    annulla_duello,
    consegna_giocata,
    crea_duello,
    inizia_giocata,
    ottieni_vista_duello,
    risultato_duello,
)
from .referral_regole import maschera_nome_o_iniziali

router = APIRouter(prefix="/duels", tags=["duels"])
public_router = APIRouter(prefix="/duels", tags=["duels"])


def _richiedi_auth_duelli(utente: Utente) -> None:
    """Verifica che l'utente non sia anonimo per le feature del duello."""
    if not is_auth_required() or utente.user_id == "local":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "AUTH_REQUIRED_FOR_FEATURE",
                "message": "Autenticazione richiesta per questa funzionalita'.",
            },
        )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DuelloCreato)
def crea_sfida_duello(
    richiesta: CreaDuelloRichiesta,
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> DuelloCreato:
    """Crea una nuova sfida di duello su un corso di proprietà del creatore Pro (guardia Pro)."""
    _richiedi_auth_duelli(utente)
    # Guardia Pro solo su creazione (decisione §0.2)
    richiedi_funzione("gioco_gruppo_sfida", utente=utente)

    store = request.app.state.store.per_utente(utente.user_id)
    # Leggi corso o bozza
    course_data = None
    titolo = "Corso"
    pool_domande: list[dict[str, Any]] = []

    try:
        course_data = store.read(richiesta.extraction_id, "course.json")
    except Exception:
        try:
            course_data = store.read(richiesta.extraction_id, "draft.json")
        except Exception:
            pass

    if not course_data:
        raise HTTPException(
            status_code=404,
            detail={"code": "COURSE_NOT_FOUND", "message": "Corso non trovato tra i corsi dell'utente."},
        )

    # Estrai titolo e domande
    inner = course_data.get("course", course_data)
    titolo = inner.get("title") or course_data.get("name") or "Corso"
    raw_q = inner.get("questions") or course_data.get("questions") or []
    pool_domande = [dict(q) if hasattr(q, "items") else q.model_dump() if hasattr(q, "model_dump") else q for q in raw_q]

    conn = open_db(resolve_db_path())
    try:
        return crea_duello(
            conn=conn,
            creatore_id=utente.user_id,
            extraction_id=richiesta.extraction_id,
            titolo_corso=titolo,
            pool_domande=pool_domande,
            n_domande=richiesta.n_domande,
        )
    except NotEnoughQuestionsError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUEL_NOT_ENOUGH_QUESTIONS",
                "message": "Il corso non contiene abbastanza domande eleggibili per il duello.",
                "richieste": exc.richieste,
                "eleggibili": exc.eleggibili,
            },
        ) from exc
    except DuelActiveLimitReached as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "DUEL_ACTIVE_LIMIT_REACHED", "message": str(exc)},
        ) from exc
    finally:
        conn.close()


@public_router.get("/invite/{codice}", response_model=DuelloAnteprima)
def anteprima_invito_duello(codice: str) -> DuelloAnteprima:
    """Anteprima pubblica della sfida senza rivelare domande o soluzioni."""
    conn = open_db(resolve_db_path())
    try:
        d_row = conn.execute("SELECT * FROM duelli WHERE codice_invito = ?", (codice.strip(),)).fetchone()
        if not d_row:
            raise HTTPException(
                status_code=404,
                detail={"code": "DUEL_NOT_FOUND", "message": "Invito a duello non trovato."},
            )

        u_c = conn.execute("SELECT nome_visualizzato, email FROM utenti WHERE user_id = ?", (d_row["creatore_id"],)).fetchone()
        creatore_nome = maschera_nome_o_iniziali(u_c["nome_visualizzato"] if u_c else None, u_c["email"] if u_c else None)
        adesso = datetime.now(timezone.utc)
        scade_dt = datetime.fromisoformat(d_row["scade_il"])

        giocate = conn.execute("SELECT * FROM duelli_giocate WHERE duello_id = ?", (d_row["duello_id"],)).fetchall()
        c_cons = any(r["consegnata_il"] and r["user_id"] == d_row["creatore_id"] for r in giocate)
        a_cons = any(r["consegnata_il"] and r["user_id"] == d_row["avversario_id"] for r in giocate)

        stato = stato_effettivo(
            stato_salvato=d_row["stato_salvato"],
            avversario_id=d_row["avversario_id"],
            c_consegnata=c_cons,
            a_consegnata=a_cons,
            scade_il=scade_dt,
            adesso=adesso,
        )

        return DuelloAnteprima(
            duello_id=d_row["duello_id"],
            titolo_corso=d_row["titolo_corso"],
            n_domande=d_row["n_domande"],
            creatore_nome=creatore_nome,
            scade_il=scade_dt,
            stato=stato,
        )
    finally:
        conn.close()


@router.post("/{duello_id}/accept", response_model=DuelloVista)
def accetta_sfida_duello(
    duello_id: str,
    richiesta: AccettaDuelloRichiesta | None = None,
    utente: Utente = Depends(utente_corrente),
) -> DuelloVista:
    """L'utente autenticato (anche piano Base) accetta la sfida diventando l'avversario."""
    _richiedi_auth_duelli(utente)
    conn = open_db(resolve_db_path())
    try:
        codice = richiesta.codice_invito if richiesta else None
        accetta_duello(conn, duello_id=duello_id, avversario_id=utente.user_id, codice_invito=codice)
        return ottieni_vista_duello(conn, duello_id, utente.user_id)
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    except DuelSelfAccept as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_SELF_ACCEPT", "message": str(exc)}) from exc
    except DuelAlreadyAccepted as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_ALREADY_ACCEPTED", "message": str(exc)}) from exc
    except DuelExpired as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_EXPIRED", "message": str(exc)}) from exc
    except DuelNotOpen as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_NOT_OPEN", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.post("/{duello_id}/start", response_model=StartGiocataRisposta)
def avvia_giocata_duello(
    duello_id: str,
    utente: Utente = Depends(utente_corrente),
) -> StartGiocataRisposta:
    """Inizia la sessione di gioco: restituisce le domande senza risposte né spiegazioni."""
    _richiedi_auth_duelli(utente)
    conn = open_db(resolve_db_path())
    try:
        domande, tempo_s, iniziata_dt = inizia_giocata(conn, duello_id, utente.user_id)
        return StartGiocataRisposta(domande=domande, tempo_max_giocata_s=tempo_s, iniziata_il=iniziata_dt)
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    except DuelExpired as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_EXPIRED", "message": str(exc)}) from exc
    except DuelNotOpen as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_NOT_OPEN", "message": str(exc)}) from exc
    except DuelAlreadySubmitted as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_ALREADY_SUBMITTED", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.post("/{duello_id}/submit", response_model=ConsegnaRisposta)
def consegna_risposte_duello(
    duello_id: str,
    richiesta: ConsegnaRichiesta,
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> ConsegnaRisposta:
    """Consegna le risposte del duello e ne calcola il punteggio lato server."""
    _richiedi_auth_duelli(utente)
    store = getattr(request.app.state, "store", None)
    store_root = store.root if store else None

    conn = open_db(resolve_db_path())
    try:
        corrette, tempo_ms, chiuso = consegna_giocata(
            conn=conn,
            duello_id=duello_id,
            user_id=utente.user_id,
            risposte=richiesta.risposte,
            store_root=store_root,
        )
        return ConsegnaRisposta(corrette=corrette, tempo_totale_ms=tempo_ms, duello_chiuso=chiuso)
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    except DuelExpired as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_EXPIRED", "message": str(exc)}) from exc
    except DuelNotStarted as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_NOT_STARTED", "message": str(exc)}) from exc
    except DuelAlreadySubmitted as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_ALREADY_SUBMITTED", "message": str(exc)}) from exc
    except DuelTimeLimitExceeded as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_TIME_LIMIT_EXCEEDED", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.get("/{duello_id}", response_model=DuelloVista)
def get_duello_vista(
    duello_id: str,
    utente: Utente = Depends(utente_corrente),
) -> DuelloVista:
    """Restituisce lo stato corrente e la vista completa del duello per il partecipante."""
    _richiedi_auth_duelli(utente)
    conn = open_db(resolve_db_path())
    try:
        return ottieni_vista_duello(conn, duello_id, utente.user_id)
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.get("/{duello_id}/result", response_model=DuelloRisultatoRisposta)
def get_risultato_duello(
    duello_id: str,
    request: Request,
    utente: Utente = Depends(utente_corrente),
) -> DuelloRisultatoRisposta:
    """Restituisce esito e classifica. Le soluzioni sono incluse solo se l'utente ha consegnato."""
    _richiedi_auth_duelli(utente)
    store = getattr(request.app.state, "store", None)
    store_root = store.root if store else None

    conn = open_db(resolve_db_path())
    try:
        return risultato_duello(conn, duello_id, utente.user_id, store_root=store_root)
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    except DuelNotFinished as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_NOT_FINISHED", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.post("/{duello_id}/cancel")
def annulla_duello_creatore(
    duello_id: str,
    utente: Utente = Depends(utente_corrente),
) -> dict[str, bool]:
    """Annulla la sfida (solo creatore e solo se ancora in_attesa)."""
    _richiedi_auth_duelli(utente)
    conn = open_db(resolve_db_path())
    try:
        annulla_duello(conn, duello_id, utente.user_id)
        return {"ok": True}
    except DuelNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "DUEL_NOT_FOUND", "message": str(exc)}) from exc
    except DuelNotCancellable as exc:
        raise HTTPException(status_code=409, detail={"code": "DUEL_NOT_CANCELLABLE", "message": str(exc)}) from exc
    finally:
        conn.close()


@router.get("", response_model=DuelliElencoRisposta)
def elenca_miei_duelli(
    utente: Utente = Depends(utente_corrente),
    limit: int = Query(default=20, ge=1, le=50),
    cursor: int = Query(default=0, ge=0),
) -> DuelliElencoRisposta:
    """Restituisce l'elenco paginato dei duelli in cui l'utente partecipa."""
    _richiedi_auth_duelli(utente)
    conn = open_db(resolve_db_path())
    try:
        righe = conn.execute(
            """
            SELECT duello_id FROM duelli
            WHERE creatore_id = ? OR avversario_id = ?
            ORDER BY creato_il DESC
            LIMIT ? OFFSET ?
            """,
            (utente.user_id, utente.user_id, limit, cursor),
        ).fetchall()

        viste = [ottieni_vista_duello(conn, r["duello_id"], utente.user_id) for r in righe]
        tot_row = conn.execute(
            "SELECT COUNT(*) AS tot FROM duelli WHERE creatore_id = ? OR avversario_id = ?",
            (utente.user_id, utente.user_id),
        ).fetchone()
        tot = tot_row["tot"] if tot_row else len(viste)
        return DuelliElencoRisposta(duelli=viste, totale=tot)
    finally:
        conn.close()
