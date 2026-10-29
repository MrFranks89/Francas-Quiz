"""Risposte giuste riconoscibili senza conoscere la materia: posizione sbilanciata o opzione più lunga.

Il lettore mescola le opzioni alla visualizzazione, quindi la posizione è un segnale sul generatore,
non un indizio per chi svolge il quiz; la lunghezza invece resta visibile in qualunque ordine.
"""
from math import comb

# Valori critici del chi quadro con α = 0,05 per gradi di libertà 1..5 (fino a 6 opzioni, ModuleDraft).
# Fonte: NIST/SEMATECH e-Handbook of Statistical Methods, 1.3.6.7.4 «Critical Values of the Chi-Square Distribution».
CHI_QUADRO_05 = {1: 3.841, 2: 5.991, 3: 7.815, 4: 9.488, 5: 11.070}
# Il test del chi quadro è affidabile solo con almeno 5 attese per posizione (regola usuale).
ATTESA_MINIMA = 5
# Soglia della coda binomiale per «sistematicamente la più lunga».
ALFA_LUNGHEZZA = 0.01


def _coda_binomiale(n: int, k: int, p: float) -> float:
    """P(X ≥ k) con X ~ Binomiale(n, p)."""
    return sum(comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k, n + 1))


def analizza_risposte(course: dict) -> dict:
    # Vero/falso escluso: opzioni fisse «Vero», «Falso» in quest'ordine e mai mescolate
    # (displayOptions in packages/learning-engine/src/options.ts), quindi né la posizione né la
    # lunghezza della giusta dicono qualcosa sul generatore. `kind` assente vale 'single'.
    domande = [q for q in course['questions'] if q.get('kind', 'single') != 'truefalse']
    escluse = len(course['questions']) - len(domande)
    larghezza = max((len(q['options']) for q in domande), default=0)
    posizioni, attese = [0] * larghezza, [0.0] * larghezza
    piu_lunga, attesa_lunga = 0, 0.0
    for q in domande:
        k = len(q['options'])
        giusta = [o['id'] for o in q['options']].index(q['correctOptionId'])
        posizioni[giusta] += 1
        for i in range(k):
            attese[i] += 1 / k
        lunghezze = [len(o['text'].strip()) for o in q['options']]
        if lunghezze[giusta] == max(lunghezze) and lunghezze.count(max(lunghezze)) == 1:
            piu_lunga += 1
        attesa_lunga += 1 / k
    n = len(domande)
    valutabili = larghezza >= 2 and all(a >= ATTESA_MINIMA for a in attese)
    chi = sum((o - a) ** 2 / a for o, a in zip(posizioni, attese) if a) if valutabili else None
    avvisi = []
    if valutabili and chi > CHI_QUADRO_05[larghezza - 1]:
        avvisi.append(f'Risposta giusta per posizione sbilanciata: {posizioni} su {n} domande '
                      f'(attese {[round(a, 1) for a in attese]}, chi quadro {chi:.2f}).')
    p_lunga = _coda_binomiale(n, piu_lunga, attesa_lunga / n) if n and piu_lunga > attesa_lunga else 1.0
    if p_lunga < ALFA_LUNGHEZZA:
        avvisi.append(f'Risposta giusta sistematicamente la più lunga: {piu_lunga} su {n} domande '
                      f'(attese {attesa_lunga:.1f}).')
    return dict(domande=n, escluseVeroFalso=escluse, posizioni=posizioni, posizioniValutabili=valutabili, chiQuadro=chi,
                piuLunga=piu_lunga, attesaPiuLunga=round(attesa_lunga, 2), avvisi=avvisi)


__all__ = ['analizza_risposte']
