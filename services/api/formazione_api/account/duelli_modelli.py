"""Modelli Pydantic per il sottosistema Duello Asincrono Pro (C4)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

StatoDuello = Literal["in_attesa", "aperto", "completato", "scaduto", "annullato"]
MotivoEsito = Literal["PUNTEGGIO", "TEMPO", "PAREGGIO", "FORFAIT", "NULLA"]
RuoloPartecipante = Literal["creatore", "avversario"]
StatoGiocata = Literal["non_iniziata", "iniziata", "consegnata"]


class DomandaDuelloSnapshot(BaseModel):
    """Snapshot completo congelato di una domanda (include soluzioni e spiegazione)."""
    domanda_id: str
    testo: str
    opzioni: list[str]
    correctIndex: int
    explanation: str


class DomandaPubblica(BaseModel):
    """Domanda pubblica esposta al client durante la giocata (senza soluzioni)."""
    domanda_id: str
    testo: str
    opzioni: list[str]


class RispostaDuello(BaseModel):
    domanda_id: str
    scelta: int | None = Field(default=None, ge=0, le=9)
    ms: int = Field(ge=0, le=600_000)


class ConsegnaRichiesta(BaseModel):
    risposte: list[RispostaDuello] = Field(max_length=20)


class ConsegnaRisposta(BaseModel):
    corrette: int
    tempo_totale_ms: int
    duello_chiuso: bool


class PunteggioGiocata(BaseModel):
    corrette: int
    tempo_totale_ms: int


class EsitoDuello(BaseModel):
    vincitore_id: str | None = None
    motivo: MotivoEsito
    punteggi: dict[str, PunteggioGiocata] = Field(default_factory=dict)


class CreaDuelloRichiesta(BaseModel):
    extraction_id: str
    n_domande: int = Field(default=10, ge=5, le=20)


class DuelloCreato(BaseModel):
    duello_id: str
    codice_invito: str
    scade_il: datetime


class DuelloAnteprima(BaseModel):
    duello_id: str
    titolo_corso: str
    n_domande: int
    creatore_nome: str
    scade_il: datetime
    stato: StatoDuello


class DuelloVista(BaseModel):
    duello_id: str
    stato: StatoDuello
    titolo_corso: str
    n_domande: int
    scade_il: datetime
    ruolo: RuoloPartecipante
    la_mia_giocata: StatoGiocata
    giocata_altro: StatoGiocata | None = None
    codice_invito: str | None = None
    avversario_nome: str | None = None
    creatore_nome: str


class DuelloRisultatoRisposta(BaseModel):
    stato: StatoDuello
    esito: EsitoDuello | None = None
    soluzioni: list[DomandaDuelloSnapshot] | None = None


class StartGiocataRisposta(BaseModel):
    domande: list[DomandaPubblica]
    tempo_max_giocata_s: int
    iniziata_il: datetime


class AccettaDuelloRichiesta(BaseModel):
    codice_invito: str | None = None


class DuelliElencoRisposta(BaseModel):
    duelli: list[DuelloVista]
    totale: int
