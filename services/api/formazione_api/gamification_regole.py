"""Regole pure di calcolo didattico e derivazione del mazzo flashcard (TASK-12/13)."""
from __future__ import annotations

import hashlib
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from .gamification import (
    CartaFlashcard,
    CartaMazzo,
    EsitiDomanda,
    EsitoEvento,
    EventoElaborato,
    EventoGamification,
    FonteCarta,
    GamificationState,
    MazzoFlashcards,
    RisultatoDomanda,
    RisultatoDomandaIn,
    Streak,
)

# Costanti didattiche ratificate
XP_CORRETTA = 10
XP_FLASHCARD: dict[Literal['facile', 'medio', 'difficile'], int] = {
    'facile': 20,
    'medio': 15,
    'difficile': 10,
}
XP_SFIDA = 50
XP_RECUPERO = 25
INTERVALLI_LEITNER: dict[int, int] = {1: 1, 2: 3, 3: 7}
XP_PER_PUNTO_GIOCO = 10
XP_MASTERY = 40
POTERI_INIZIALI = {'fiftyFifty': 3, 'salta': 3}
POTERI_PER_LIVELLO = {'fiftyFifty': 1, 'salta': 1}
LIVELLO_MAX = 50
FINESTRA_EVENTI = 1000
MAX_CARTE_STATO = 5000
MAX_RISULTATI_STATO = 5000


def soglia(livello: int) -> int:
    """Calcola la soglia minima di XP per un livello L: 50 * L * (L - 1)."""
    if livello <= 1:
        return 0
    return 50 * livello * (livello - 1)


def livello_da_xp(xp: int) -> int:
    """Restituisce il livello calcolato dagli XP (1..LIVELLO_MAX)."""
    liv = 1
    while liv < LIVELLO_MAX and soglia(liv + 1) <= xp:
        liv += 1
    return liv


def xp_inizio_livello(livello: int) -> int:
    """Restituisce gli XP iniziali del livello specificato."""
    return soglia(livello)


def xp_prossimo_livello(livello: int) -> int | None:
    """Restituisce gli XP necessari per il livello successivo o None se massimo."""
    if livello >= LIVELLO_MAX:
        return None
    return soglia(livello + 1)


def aggiorna_streak(streak: Streak, client_date_str: str) -> bool:
    """Aggiorna lo streak didattico basato sulla data locale del client."""
    d = date.fromisoformat(client_date_str)
    if streak.lastActivityDate is None:
        streak.days = 1
        streak.lastActivityDate = client_date_str
        return True

    ultima = date.fromisoformat(streak.lastActivityDate)
    if d == ultima:
        return False
    if d == ultima + timedelta(days=1):
        streak.days += 1
        streak.lastActivityDate = client_date_str
        return True
    if d > ultima + timedelta(days=1):
        streak.days = 1
        streak.lastActivityDate = client_date_str
        return True
    # d < ultima (evento retrodatato): non regredisce
    return False


def avanza_flashcard(
    carta: CartaFlashcard | None,
    valutazione: Literal['facile', 'medio', 'difficile'],
    oggi_str: str,
) -> CartaFlashcard:
    """Applica la transizione Leitner (ratifica O-3) e calcola la data di prossima scadenza."""
    box_attuale = carta.box if carta else 1
    if valutazione == 'facile':
        box_nuovo = min(3, box_attuale + 1)
    elif valutazione == 'medio':
        box_nuovo = box_attuale
    else:
        box_nuovo = 1

    box_digit = 1 if box_nuovo == 1 else (2 if box_nuovo == 2 else 3)
    oggi_d = date.fromisoformat(oggi_str)
    giorni = INTERVALLI_LEITNER[box_digit]
    next_due = oggi_d + timedelta(days=giorni)
    return CartaFlashcard(box=box_digit, nextDue=next_due.isoformat())


def aggiorna_risultati(
    stato: GamificationState,
    risultati: list[RisultatoDomandaIn],
    data_str: str,
) -> list[str]:
    """Registra gli esiti delle domande dei quiz nello stato persistito."""
    warnings: list[str] = []
    for r in risultati:
        if r.questionId in stato.risultatiQuiz:
            voce = stato.risultatiQuiz[r.questionId]
            if r.corretta:
                voce.esiti.corrette += 1
            else:
                voce.esiti.errate += 1
            voce.ultimoEsito = 'corretta' if r.corretta else 'errata'
            voce.ultimaData = data_str
        else:
            if len(stato.risultatiQuiz) >= MAX_RISULTATI_STATO:
                if 'STATO_RISULTATI_TRONCATO' not in warnings:
                    warnings.append('STATO_RISULTATI_TRONCATO')
                continue
            stato.risultatiQuiz[r.questionId] = RisultatoDomanda(
                esiti=EsitiDomanda(
                    corrette=1 if r.corretta else 0,
                    errate=0 if r.corretta else 1,
                ),
                ultimoEsito='corretta' if r.corretta else 'errata',
                ultimaData=data_str,
            )
    return warnings


def applica_evento(
    stato: GamificationState,
    evento: EventoGamification,
    _oggi_server: date | None = None,
) -> EsitoEvento:
    """Elabora un evento gamification applicando regole pure dentro la sezione critica."""
    # 1. Idempotenza (FIFO sugli ultimi FINESTRA_EVENTI)
    for ev in stato.eventiElaborati:
        if ev.eventId == evento.eventId:
            return EsitoEvento(
                eventId=evento.eventId,
                applicato=False,
                duplicato=True,
                xpAccreditati=0,
                livelloPrecedente=stato.livello,
                livelloAttuale=stato.livello,
                levelUp=False,
                streakAggiornata=False,
                warnings=[],
            )

    xp = 0
    warnings: list[str] = []
    applicato = True
    livello_prima = stato.livello

    tipo = evento.tipo
    if tipo == 'quiz_completato':
        w = aggiorna_risultati(stato, evento.risultati, evento.clientDate)
        warnings.extend(w)
        xp = XP_CORRETTA * sum(1 for r in evento.risultati if r.corretta)

    elif tipo == 'sfida_completata':
        xp = XP_SFIDA

    elif tipo == 'flashcard_valutata':
        carta_prec = stato.flashcards.get(evento.cardId)
        if carta_prec is None and len(stato.flashcards) >= MAX_CARTE_STATO:
            warnings.append('STATO_CARTE_TRONCATO')
        else:
            stato.flashcards[evento.cardId] = avanza_flashcard(
                carta_prec, evento.valutazione, evento.clientDate
            )
        xp = XP_FLASHCARD[evento.valutazione]

    elif tipo == 'recupero_completato':
        if evento.risultati:
            w = aggiorna_risultati(stato, evento.risultati, evento.clientDate)
            warnings.extend(w)
        xp = XP_RECUPERO

    elif tipo == 'sopravvivenza_fine':
        if evento.risultati:
            w = aggiorna_risultati(stato, evento.risultati, evento.clientDate)
            warnings.extend(w)
        stato.recordSopravvivenza = max(stato.recordSopravvivenza, evento.serie)
        xp = XP_PER_PUNTO_GIOCO * evento.serie

    elif tipo == 'time_attack_fine':
        if evento.risultati:
            w = aggiorna_risultati(stato, evento.risultati, evento.clientDate)
            warnings.extend(w)
        stato.recordTimeAttack = max(stato.recordTimeAttack, evento.punteggio)
        xp = XP_PER_PUNTO_GIOCO * evento.punteggio

    elif tipo == 'potere_usato':
        potere_nome = evento.potere
        cariche = getattr(stato.poteri, potere_nome, 0)
        if cariche > 0:
            setattr(stato.poteri, potere_nome, cariche - 1)
        else:
            applicato = False
            warnings.append('POTERE_ESAURITO')

    elif tipo == 'mastery_avanzata':
        attuale = stato.mastery.get(evento.scopeId, 0)
        if evento.nuovoLivello == attuale + 1:
            stato.mastery[evento.scopeId] = evento.nuovoLivello
            xp = XP_MASTERY
        else:
            applicato = False
            warnings.append('MASTERY_NON_CONSECUTIVA')

    stato.xp += xp
    livello_dopo = livello_da_xp(stato.xp)
    level_up = livello_dopo > livello_prima

    if level_up:
        guadagno = livello_dopo - livello_prima
        stato.poteri.fiftyFifty += guadagno * POTERI_PER_LIVELLO['fiftyFifty']
        stato.poteri.salta += guadagno * POTERI_PER_LIVELLO['salta']

    stato.livello = livello_dopo

    streak_cambiata = False
    if applicato and tipo != 'potere_usato':
        streak_cambiata = aggiorna_streak(stato.streak, evento.clientDate)

    # Registrazione FIFO evento elaborato
    stato.eventiElaborati.append(
        EventoElaborato(eventId=evento.eventId, tipo=tipo, xp=xp)
    )
    if len(stato.eventiElaborati) > FINESTRA_EVENTI:
        stato.eventiElaborati = stato.eventiElaborati[-FINESTRA_EVENTI:]

    stato.aggiornatoAt = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    return EsitoEvento(
        eventId=evento.eventId,
        applicato=applicato,
        duplicato=False,
        xpAccreditati=xp,
        livelloPrecedente=livello_prima,
        livelloAttuale=livello_dopo,
        levelUp=level_up,
        streakAggiornata=streak_cambiata,
        warnings=warnings,
    )


def normalizza_stringa(testo: str) -> str:
    """Normalizza una stringa per matching e hashing deterministico."""
    nfkd = unicodedata.normalize('NFKD', testo)
    senza_diacritici = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return ' '.join(senza_diacritici.lower().split())


def costruisci_mazzo(
    tree: dict[str, Any],
    stato: GamificationState,
    oggi_str: str,
    branch_id: str | None = None,
    limite: int = 20,
    includi_nuove: bool = True,
) -> MazzoFlashcards:
    """Deriva deterministicamente il mazzo flashcard da concept-tree.json (§A.5)."""
    branches = tree.get('branches', [])
    if branch_id:
        target_branch = next((b for b in branches if b.get('id') == branch_id), None)
        if not target_branch:
            raise KeyError(f'Ramo {branch_id} non trovato.')
        branches_target = [target_branch]
    else:
        branches_target = branches

    carte_tutte: list[CartaMazzo] = []
    for b in branches_target:
        bid = b.get('id', '')
        for n in b.get('nodes', []):
            nid = n.get('id', '')
            title = n.get('title', '').strip()
            summary = n.get('summary', '').strip()
            origin_blocks = n.get('originBlocks', [])
            source_refs = n.get('sourceRefs', [])

            # Fonti
            fonti: list[FonteCarta] = []
            for idx, block_id in enumerate(origin_blocks):
                ref = source_refs[idx] if idx < len(source_refs) else None
                fonti.append(FonteCarta(blockId=block_id, ref=ref))

            # 1. Carta principale del nodo
            card_id_nodo = f'card-{nid}'
            stato_carta_nodo = stato.flashcards.get(card_id_nodo)
            if stato_carta_nodo is None:
                nuova = True
                box: Literal[1, 2, 3] = 1
                next_due = oggi_str
            else:
                nuova = False
                box = stato_carta_nodo.box
                next_due = stato_carta_nodo.nextDue

            carte_tutte.append(
                CartaMazzo(
                    cardId=card_id_nodo,
                    branchId=bid,
                    nodeId=nid,
                    fronte=title,
                    retro=summary,
                    fonti=fonti,
                    box=box,
                    nextDue=next_due,
                    nuova=nuova,
                )
            )

            # 2. Carte per ciascun keyTerm
            key_terms = n.get('keyTerms', [])
            for kt in key_terms:
                kt_clean = str(kt).strip()
                if not kt_clean:
                    continue
                kt_hash = hashlib.sha1(normalizza_stringa(kt_clean).encode('utf-8')).hexdigest()[:6]
                card_id_kt = f'card-{nid}-{kt_hash}'
                stato_carta_kt = stato.flashcards.get(card_id_kt)
                if stato_carta_kt is None:
                    nuova_kt = True
                    box_kt: Literal[1, 2, 3] = 1
                    next_due_kt = oggi_str
                else:
                    nuova_kt = False
                    box_kt = stato_carta_kt.box
                    next_due_kt = stato_carta_kt.nextDue

                carte_tutte.append(
                    CartaMazzo(
                        cardId=card_id_kt,
                        branchId=bid,
                        nodeId=nid,
                        fronte=f'{kt_clean} — {title}',
                        retro=summary,
                        fonti=fonti,
                        box=box_kt,
                        nextDue=next_due_kt,
                        nuova=nuova_kt,
                    )
                )

    dovute: list[CartaMazzo] = []
    nuove: list[CartaMazzo] = []

    for c in carte_tutte:
        if c.nuova:
            nuove.append(c)
        else:
            if c.nextDue <= oggi_str:
                dovute.append(c)

    # Ordinamento deterministico:
    # Dovute: nextDue crescente, poi box crescente, poi cardId
    dovute.sort(key=lambda x: (x.nextDue, x.box, x.cardId))
    # Nuove: ordine naturale di apparizione nell'albero

    totale_dovute = len(dovute)
    totale_nuove = len(nuove)

    risultato = dovute + (nuove if includi_nuove else [])
    carte_selezionate = risultato[:limite]

    return MazzoFlashcards(
        oggi=oggi_str,
        totaleDovute=totale_dovute,
        totaleNuove=totale_nuove,
        carte=carte_selezionate,
        warnings=[],
    )
