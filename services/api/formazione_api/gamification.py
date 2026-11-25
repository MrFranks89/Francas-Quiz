"""Modelli Pydantic e persistenza thread-safe per la gamification reale (TASK-12/13)."""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import uuid
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

# Lock globale di processo per tutte le estrazioni (come _LOCK_QUIZ in branch_quiz.py)
_LOCK_GAMIFICATION = threading.Lock()

DATA_PATTERN = r'^\d{4}-\d{2}-\d{2}$'
ID_BREVE = Field(min_length=1, max_length=120)
EVENT_ID_PATTERN = r'^[A-Za-z0-9_-]{8,64}$'
CARD_ID_PATTERN = r'^[A-Za-z0-9_.:-]{1,120}$'


# ---------- Stato persistito ----------

class Streak(BaseModel):
    days: int = 0
    lastActivityDate: str | None = Field(default=None, pattern=DATA_PATTERN)


class EsitiDomanda(BaseModel):
    corrette: int = 0
    errate: int = 0


class RisultatoDomanda(BaseModel):
    esiti: EsitiDomanda = Field(default_factory=EsitiDomanda)
    ultimoEsito: Literal['corretta', 'errata']
    ultimaData: str = Field(pattern=DATA_PATTERN)


class CartaFlashcard(BaseModel):
    box: Literal[1, 2, 3] = 1
    nextDue: str = Field(pattern=DATA_PATTERN)


class Poteri(BaseModel):
    """Usi rimasti (non usi totali)."""
    fiftyFifty: int = 3
    salta: int = 3


class EventoElaborato(BaseModel):
    """Registro di idempotenza: ultimi N eventi (FIFO)."""
    eventId: str
    tipo: str
    xp: int = 0


class GamificationState(BaseModel):
    schemaVersion: Literal[1] = 1
    extractionId: str
    xp: int = 0
    livello: int = 1
    streak: Streak = Field(default_factory=Streak)
    risultatiQuiz: dict[str, RisultatoDomanda] = Field(default_factory=dict)
    flashcards: dict[str, CartaFlashcard] = Field(default_factory=dict)
    recordSopravvivenza: int = 0
    recordTimeAttack: int = 0
    mastery: dict[str, int] = Field(default_factory=dict)  # scopeId -> 0..3
    poteri: Poteri = Field(default_factory=Poteri)
    eventiElaborati: list[EventoElaborato] = Field(default_factory=list)
    aggiornatoAt: str | None = None


# ---------- Eventi (unione discriminata su `tipo`) ----------

class _EventoBase(BaseModel):
    model_config = ConfigDict(extra='forbid')
    eventId: str = Field(pattern=EVENT_ID_PATTERN)
    clientDate: str = Field(pattern=DATA_PATTERN)
    clientTz: str | None = Field(default=None, max_length=64)


class RisultatoDomandaIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    questionId: str = ID_BREVE
    corretta: bool


class QuizCompletato(_EventoBase):
    tipo: Literal['quiz_completato']
    scopeId: str | None = Field(default=None, max_length=120)
    risultati: list[RisultatoDomandaIn] = Field(min_length=1, max_length=50)


class SfidaCompletata(_EventoBase):
    tipo: Literal['sfida_completata']
    sfidaId: str = ID_BREVE


class FlashcardValutata(_EventoBase):
    tipo: Literal['flashcard_valutata']
    cardId: str = Field(pattern=CARD_ID_PATTERN)
    valutazione: Literal['facile', 'medio', 'difficile']


class RecuperoCompletato(_EventoBase):
    tipo: Literal['recupero_completato']
    scopeId: str = ID_BREVE
    risultati: list[RisultatoDomandaIn] = Field(default_factory=list, max_length=50)


class SopravvivenzaFine(_EventoBase):
    tipo: Literal['sopravvivenza_fine']
    scopeId: str | None = Field(default=None, max_length=120)
    serie: int = Field(ge=0, le=200)
    risultati: list[RisultatoDomandaIn] = Field(default_factory=list, max_length=200)


class TimeAttackFine(_EventoBase):
    tipo: Literal['time_attack_fine']
    scopeId: str | None = Field(default=None, max_length=120)
    punteggio: int = Field(ge=0, le=200)
    durataSecondi: int = Field(ge=1, le=3600)
    risultati: list[RisultatoDomandaIn] = Field(default_factory=list, max_length=200)


class PotereUsato(_EventoBase):
    tipo: Literal['potere_usato']
    potere: Literal['fiftyFifty', 'salta']


class MasteryAvanzata(_EventoBase):
    tipo: Literal['mastery_avanzata']
    scopeId: str = ID_BREVE
    nuovoLivello: int = Field(ge=1, le=3)


EventoGamification = Annotated[
    Union[
        QuizCompletato,
        SfidaCompletata,
        FlashcardValutata,
        RecuperoCompletato,
        SopravvivenzaFine,
        TimeAttackFine,
        PotereUsato,
        MasteryAvanzata,
    ],
    Field(discriminator='tipo'),
]


# ---------- Risposte e Mazzo ----------

class EsitoEvento(BaseModel):
    eventId: str
    applicato: bool
    duplicato: bool = False
    xpAccreditati: int = 0
    livelloPrecedente: int
    livelloAttuale: int
    levelUp: bool
    streakAggiornata: bool
    warnings: list[str] = Field(default_factory=list)


class GamificationStateResponse(BaseModel):
    """Stato per il client: include i campi calcolati e omette eventiElaborati."""
    schemaVersion: Literal[1] = 1
    extractionId: str
    xp: int
    livello: int
    xpInizioLivello: int
    xpProssimoLivello: int | None
    streak: Streak
    risultatiQuiz: dict[str, RisultatoDomanda]
    flashcards: dict[str, CartaFlashcard]
    recordSopravvivenza: int
    recordTimeAttack: int
    mastery: dict[str, int]
    poteri: Poteri
    aggiornatoAt: str | None
    esito: EsitoEvento | None = None


class FonteCarta(BaseModel):
    blockId: str
    ref: str | None = None


class CartaMazzo(BaseModel):
    cardId: str
    branchId: str
    nodeId: str
    fronte: str
    retro: str
    fonti: list[FonteCarta]
    box: Literal[1, 2, 3]
    nextDue: str
    nuova: bool


class MazzoFlashcards(BaseModel):
    oggi: str
    totaleDovute: int
    totaleNuove: int
    carte: list[CartaMazzo]
    warnings: list[str] = Field(default_factory=list)


# ---------- Persistenza su file ----------

def stato_iniziale(extraction_id: str) -> GamificationState:
    """Restituisce lo stato pulito iniziale per una nuova estrazione."""
    return GamificationState(
        extractionId=extraction_id,
        xp=0,
        livello=1,
        poteri=Poteri(fiftyFifty=3, salta=3),
    )


def percorso_gamification(store_root: str, extraction_id: str) -> str:
    """Restituisce il percorso assoluto del file {extraction_id}.gamification.json."""
    if not re.match(r'^[A-Za-z0-9_-]{1,120}$', extraction_id):
        raise ValueError(f'extraction_id non valido: {extraction_id}')
    return os.path.join(store_root, f'{extraction_id}.gamification.json')


def carica_stato(store_root: str, extraction_id: str) -> GamificationState:
    """Carica lo stato persistito. Se assente, restituisce lo stato iniziale senza scrivere.
    Se il file è corrotto, lo rinomina in .corrotto e riparte dallo stato iniziale.
    """
    path = percorso_gamification(store_root, extraction_id)
    if not os.path.exists(path):
        return stato_iniziale(extraction_id)

    try:
        with open(path, 'r', encoding='utf-8') as f:
            dati = json.load(f)
        return GamificationState.model_validate(dati)
    except Exception as err:
        corrotto = f'{path}.corrotto'
        logger.warning('File gamification corrotto per %s, rinominato in %s: %s', extraction_id, corrotto, err)
        try:
            os.replace(path, corrotto)
        except Exception:
            pass
        return stato_iniziale(extraction_id)


def salva_stato(store_root: str, stato: GamificationState) -> None:
    """Salva atomicamente lo stato tramite file temporaneo e rename."""
    path = percorso_gamification(store_root, stato.extractionId)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f'{path}.{uuid.uuid4().hex}.tmp'
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(stato.model_dump(mode='json'), f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def crea_risposta_stato(stato: GamificationState, esito: EsitoEvento | None = None) -> GamificationStateResponse:
    """Converte un GamificationState interno in GamificationStateResponse per il client."""
    from .gamification_regole import xp_inizio_livello, xp_prossimo_livello

    return GamificationStateResponse(
        schemaVersion=stato.schemaVersion,
        extractionId=stato.extractionId,
        xp=stato.xp,
        livello=stato.livello,
        xpInizioLivello=xp_inizio_livello(stato.livello),
        xpProssimoLivello=xp_prossimo_livello(stato.livello),
        streak=stato.streak,
        risultatiQuiz=stato.risultatiQuiz,
        flashcards=stato.flashcards,
        recordSopravvivenza=stato.recordSopravvivenza,
        recordTimeAttack=stato.recordTimeAttack,
        mastery=stato.mastery,
        poteri=stato.poteri,
        aggiornatoAt=stato.aggiornatoAt,
        esito=esito,
    )
