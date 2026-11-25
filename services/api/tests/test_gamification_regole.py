"""Test unitari per le regole didattiche pure di gamification (D.1)."""
from datetime import date

import pytest

from formazione_api.gamification import (
    CartaFlashcard,
    FlashcardValutata,
    GamificationState,
    MasteryAvanzata,
    PotereUsato,
    Poteri,
    QuizCompletato,
    RecuperoCompletato,
    RisultatoDomanda,
    RisultatoDomandaIn,
    SfidaCompletata,
    SopravvivenzaFine,
    Streak,
    TimeAttackFine,
)
from formazione_api.gamification_regole import (
    FINESTRA_EVENTI,
    LIVELLO_MAX,
    MAX_CARTE_STATO,
    MAX_RISULTATI_STATO,
    aggiorna_streak,
    applica_evento,
    avanza_flashcard,
    livello_da_xp,
    soglia,
    xp_inizio_livello,
    xp_prossimo_livello,
)


def _crea_stato_base() -> GamificationState:
    return GamificationState(
        extractionId="test-ext-1",
        xp=0,
        livello=1,
        poteri=Poteri(fiftyFifty=3, salta=3),
    )


def test_livello_da_xp_soglie():
    # soglia(L) = 50 * L * (L - 1)
    # L1=0, L2=100, L3=300, L4=600, L5=1000
    assert livello_da_xp(0) == 1
    assert livello_da_xp(99) == 1
    assert livello_da_xp(100) == 2
    assert livello_da_xp(299) == 2
    assert livello_da_xp(300) == 3
    assert livello_da_xp(599) == 3
    assert livello_da_xp(600) == 4
    assert livello_da_xp(999) == 4
    assert livello_da_xp(1000) == 5
    assert livello_da_xp(10_000_000) == LIVELLO_MAX


def test_soglia_livello_e_prossimo():
    assert xp_inizio_livello(1) == 0
    assert xp_prossimo_livello(1) == 100
    assert xp_inizio_livello(2) == 100
    assert xp_prossimo_livello(2) == 300
    assert xp_inizio_livello(LIVELLO_MAX) == soglia(LIVELLO_MAX)
    assert xp_prossimo_livello(LIVELLO_MAX) is None


def test_xp_per_tipo_evento():
    stato = _crea_stato_base()

    # 3 corrette su 5 -> 30 XP
    ev_quiz = QuizCompletato(
        eventId="ev-quiz-001",
        clientDate="2026-11-24",
        tipo="quiz_completato",
        risultati=[
            RisultatoDomandaIn(questionId="q1", corretta=True),
            RisultatoDomandaIn(questionId="q2", corretta=True),
            RisultatoDomandaIn(questionId="q3", corretta=False),
            RisultatoDomandaIn(questionId="q4", corretta=True),
            RisultatoDomandaIn(questionId="q5", corretta=False),
        ],
    )
    esito = applica_evento(stato, ev_quiz)
    assert esito.xpAccreditati == 30
    assert stato.xp == 30

    # Flashcard facile=20, medio=15, difficile=10
    e_facile = FlashcardValutata(eventId="ev-fc-001", clientDate="2026-11-24", tipo="flashcard_valutata", cardId="c1", valutazione="facile")
    e_medio = FlashcardValutata(eventId="ev-fc-002", clientDate="2026-11-24", tipo="flashcard_valutata", cardId="c2", valutazione="medio")
    e_diff = FlashcardValutata(eventId="ev-fc-003", clientDate="2026-11-24", tipo="flashcard_valutata", cardId="c3", valutazione="difficile")
    assert applica_evento(stato, e_facile).xpAccreditati == 20
    assert applica_evento(stato, e_medio).xpAccreditati == 15
    assert applica_evento(stato, e_diff).xpAccreditati == 10

    # Sfida = 50 XP
    e_sfida = SfidaCompletata(eventId="ev-sfida-001", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf1")
    assert applica_evento(stato, e_sfida).xpAccreditati == 50

    # Recupero = 25 XP
    e_rec = RecuperoCompletato(eventId="ev-rec-001", clientDate="2026-11-24", tipo="recupero_completato", scopeId="sc1")
    assert applica_evento(stato, e_rec).xpAccreditati == 25


def test_xp_giochi():
    stato = _crea_stato_base()
    # Sopravvivenza: serie=4 -> 40 XP
    e_sopr = SopravvivenzaFine(eventId="ev-sopr-001", clientDate="2026-11-24", tipo="sopravvivenza_fine", serie=4)
    assert applica_evento(stato, e_sopr).xpAccreditati == 40
    assert stato.recordSopravvivenza == 4

    # Time Attack: punteggio=7 -> 70 XP
    e_time = TimeAttackFine(eventId="ev-time-001", clientDate="2026-11-24", tipo="time_attack_fine", punteggio=7, durataSecondi=60)
    assert applica_evento(stato, e_time).xpAccreditati == 70
    assert stato.recordTimeAttack == 7

    # Serie zero -> 0 XP
    e_zero = SopravvivenzaFine(eventId="ev-sopr-002", clientDate="2026-11-24", tipo="sopravvivenza_fine", serie=0)
    assert applica_evento(stato, e_zero).xpAccreditati == 0
    assert stato.recordSopravvivenza == 4  # non regredisce


def test_quiz_completato_aggiorna_risultati():
    stato = _crea_stato_base()
    # Prima esecuzione
    ev1 = QuizCompletato(
        eventId="ev-q-agg-1",
        clientDate="2026-11-24",
        tipo="quiz_completato",
        risultati=[RisultatoDomandaIn(questionId="q1", corretta=True)],
    )
    applica_evento(stato, ev1)
    res = stato.risultatiQuiz["q1"]
    assert res.esiti.corrette == 1
    assert res.esiti.errate == 0
    assert res.ultimoEsito == "corretta"

    # Seconda esecuzione con errore
    ev2 = QuizCompletato(
        eventId="ev-q-agg-2",
        clientDate="2026-11-25",
        tipo="quiz_completato",
        risultati=[RisultatoDomandaIn(questionId="q1", corretta=False)],
    )
    applica_evento(stato, ev2)
    res = stato.risultatiQuiz["q1"]
    assert res.esiti.corrette == 1
    assert res.esiti.errate == 1
    assert res.ultimoEsito == "errata"
    assert res.ultimaData == "2026-11-25"


def test_recupero_non_paga_corrette():
    stato = _crea_stato_base()
    # Evento recupero con 3 domande corrette: paga comunque 25 XP fisso (non 25 + 30)
    ev = RecuperoCompletato(
        eventId="ev-rec-no-double",
        clientDate="2026-11-24",
        tipo="recupero_completato",
        scopeId="sc-rec",
        risultati=[
            RisultatoDomandaIn(questionId="q1", corretta=True),
            RisultatoDomandaIn(questionId="q2", corretta=True),
            RisultatoDomandaIn(questionId="q3", corretta=True),
        ],
    )
    esito = applica_evento(stato, ev)
    assert esito.xpAccreditati == 25
    assert stato.xp == 25
    assert stato.risultatiQuiz["q1"].ultimoEsito == "corretta"


@pytest.mark.parametrize(
    "last_date,current_days,new_date,expected_days,expected_changed",
    [
        (None, 0, "2026-11-20", 1, True),
        ("2026-11-20", 1, "2026-11-20", 1, False),  # stesso giorno
        ("2026-11-20", 1, "2026-11-21", 2, True),   # giorno consecutivo
        ("2026-11-20", 5, "2026-11-22", 1, True),   # buco di 2 giorni -> riparte da 1
        ("2026-11-25", 4, "2026-11-20", 4, False),  # evento retrodatato
    ],
)
def test_streak_casi(last_date, current_days, new_date, expected_days, expected_changed):
    streak = Streak(days=current_days, lastActivityDate=last_date)
    cambiata = aggiorna_streak(streak, new_date)
    assert cambiata is expected_changed
    assert streak.days == expected_days
    if expected_changed:
        assert streak.lastActivityDate == new_date


def test_streak_mezzanotte():
    stato = _crea_stato_base()
    ev1 = SfidaCompletata(eventId="ev-mid-1", clientDate="2026-11-23", tipo="sfida_completata", sfidaId="sf1")
    ev2 = SfidaCompletata(eventId="ev-mid-2", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf1")
    applica_evento(stato, ev1)
    assert stato.streak.days == 1
    applica_evento(stato, ev2)
    assert stato.streak.days == 2


def test_potere_usato_non_conta_come_attivita():
    stato = _crea_stato_base()
    # Inizialmente streak vuota
    ev = PotereUsato(eventId="ev-pot-001", clientDate="2026-11-24", tipo="potere_usato", potere="fiftyFifty")
    esito = applica_evento(stato, ev)
    assert esito.applicato is True
    assert esito.streakAggiornata is False
    assert stato.streak.days == 0
    assert stato.streak.lastActivityDate is None


@pytest.mark.parametrize(
    "box_in,valutazione,expected_box,expected_days_delta",
    [
        (None, "facile", 2, 3),        # nuova (box 1) + facile -> box 2 (+3 gg)
        (1, "medio", 1, 1),           # box 1 + medio -> box 1 (+1 gg)
        (3, "difficile", 1, 1),       # box 3 + difficile -> box 1 (+1 gg)
        (3, "facile", 3, 7),          # box 3 + facile -> box 3 (+7 gg)
    ],
)
def test_leitner_transizioni(box_in, valutazione, expected_box, expected_days_delta):
    carta_in = CartaFlashcard(box=box_in, nextDue="2026-11-20") if box_in else None
    oggi = "2026-11-20"
    nuova = avanza_flashcard(carta_in, valutazione, oggi)
    assert nuova.box == expected_box
    d_oggi = date.fromisoformat(oggi)
    d_due = date.fromisoformat(nuova.nextDue)
    assert (d_due - d_oggi).days == expected_days_delta


def test_record_sopravvivenza_e_time_attack_solo_massimo():
    stato = _crea_stato_base()
    applica_evento(stato, SopravvivenzaFine(eventId="ev-sop-1", clientDate="2026-11-24", tipo="sopravvivenza_fine", serie=8))
    assert stato.recordSopravvivenza == 8
    # Serie peggiore non abbassa il record
    applica_evento(stato, SopravvivenzaFine(eventId="ev-sop-2", clientDate="2026-11-24", tipo="sopravvivenza_fine", serie=3))
    assert stato.recordSopravvivenza == 8

    applica_evento(stato, TimeAttackFine(eventId="ev-time-1", clientDate="2026-11-24", tipo="time_attack_fine", punteggio=15, durataSecondi=60))
    assert stato.recordTimeAttack == 15
    applica_evento(stato, TimeAttackFine(eventId="ev-time-2", clientDate="2026-11-24", tipo="time_attack_fine", punteggio=5, durataSecondi=60))
    assert stato.recordTimeAttack == 15


def test_poteri_uso_esaurimento_e_ricarica():
    stato = _crea_stato_base()
    assert stato.poteri.fiftyFifty == 3

    # Usa 3 volte fino a zero
    for i in range(3):
        res = applica_evento(stato, PotereUsato(eventId=f"ev-p50-{i}", clientDate="2026-11-24", tipo="potere_usato", potere="fiftyFifty"))
        assert res.applicato is True

    assert stato.poteri.fiftyFifty == 0

    # Quarto tentativo -> esaurito
    res_esaurito = applica_evento(stato, PotereUsato(eventId="ev-p50-exhaust", clientDate="2026-11-24", tipo="potere_usato", potere="fiftyFifty"))
    assert res_esaurito.applicato is False
    assert "POTERE_ESAURITO" in res_esaurito.warnings

    # Level-up (passa da 0 a 100 XP -> livello 2): ricarica +1 a testa
    ev_level = SfidaCompletata(eventId="e-levelup-1", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf1")  # +50 XP
    ev_level2 = SfidaCompletata(eventId="e-levelup-2", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf2") # +50 XP -> tot 100
    applica_evento(stato, ev_level)
    assert stato.livello == 1
    res_lvl2 = applica_evento(stato, ev_level2)
    assert res_lvl2.levelUp is True
    assert stato.livello == 2
    assert stato.poteri.fiftyFifty == 1  # 0 + 1
    assert stato.poteri.salta == 4        # 3 + 1


def test_mastery_consecutiva():
    stato = _crea_stato_base()
    # 0 -> 1: ok (+40 XP)
    esito1 = applica_evento(stato, MasteryAvanzata(eventId="e-mast-1", clientDate="2026-11-24", tipo="mastery_avanzata", scopeId="b1", nuovoLivello=1))
    assert esito1.applicato is True
    assert esito1.xpAccreditati == 40
    assert stato.mastery["b1"] == 1

    # Salto non consecutivo: 1 -> 3 fallisce
    esito_bad = applica_evento(stato, MasteryAvanzata(eventId="e-mast-bad", clientDate="2026-11-24", tipo="mastery_avanzata", scopeId="b1", nuovoLivello=3))
    assert esito_bad.applicato is False
    assert "MASTERY_NON_CONSECUTIVA" in esito_bad.warnings
    assert stato.mastery["b1"] == 1


def test_evento_duplicato_non_modifica_stato():
    stato = _crea_stato_base()
    ev = SfidaCompletata(eventId="ev-dup-001", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf1")
    esito1 = applica_evento(stato, ev)
    assert esito1.applicato is True
    assert esito1.duplicato is False
    assert stato.xp == 50

    # Secondo invio dello stesso eventId
    esito2 = applica_evento(stato, ev)
    assert esito2.applicato is False
    assert esito2.duplicato is True
    assert esito2.xpAccreditati == 0
    assert stato.xp == 50


def test_finestra_eventi_fifo():
    stato = _crea_stato_base()
    primo_id = "ev-fifo-0"
    applica_evento(stato, SfidaCompletata(eventId=primo_id, clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf0"))
    assert any(e.eventId == primo_id for e in stato.eventiElaborati)

    # Invia FINESTRA_EVENTI altri eventi
    for i in range(1, FINESTRA_EVENTI + 2):
        ev = SfidaCompletata(eventId=f"ev-fifo-{i}", clientDate="2026-11-24", tipo="sfida_completata", sfidaId=f"sf{i}")
        applica_evento(stato, ev)

    assert len(stato.eventiElaborati) == FINESTRA_EVENTI
    # Il primissimo evento è uscito dalla finestra FIFO
    assert not any(e.eventId == primo_id for e in stato.eventiElaborati)


def test_levelup_flag():
    stato = _crea_stato_base()
    # Con 100 XP passa a livello 2
    ev = SfidaCompletata(eventId="e-lvlup-check-1", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf1")
    applica_evento(stato, ev)
    ev2 = SfidaCompletata(eventId="e-lvlup-check-2", clientDate="2026-11-24", tipo="sfida_completata", sfidaId="sf2")
    esito = applica_evento(stato, ev2)
    assert esito.levelUp is True
    assert esito.livelloPrecedente == 1
    assert esito.livelloAttuale == 2


def test_tetti_stato():
    stato = _crea_stato_base()
    # Riempi artificialmente lo stato delle flashcard fino a MAX_CARTE_STATO
    for i in range(MAX_CARTE_STATO):
        stato.flashcards[f"c-{i}"] = CartaFlashcard(box=1, nextDue="2026-11-24")

    # Nuova carta oltre il tetto
    ev_fc = FlashcardValutata(eventId="e-fc-overflow", clientDate="2026-11-24", tipo="flashcard_valutata", cardId="c-overflow-new", valutazione="facile")
    esito_fc = applica_evento(stato, ev_fc)
    assert "STATO_CARTE_TRONCATO" in esito_fc.warnings
    assert "c-overflow-new" not in stato.flashcards

    # Riempi risultatiQuiz fino a MAX_RISULTATI_STATO
    for i in range(MAX_RISULTATI_STATO):
        stato.risultatiQuiz[f"q-{i}"] = RisultatoDomanda(ultimoEsito="corretta", ultimaData="2026-11-24")

    ev_q = QuizCompletato(
        eventId="e-q-overflow",
        clientDate="2026-11-24",
        tipo="quiz_completato",
        risultati=[RisultatoDomandaIn(questionId="q-overflow-new", corretta=True)],
    )
    esito_q = applica_evento(stato, ev_q)
    assert "STATO_RISULTATI_TRONCATO" in esito_q.warnings
    assert "q-overflow-new" not in stato.risultatiQuiz
