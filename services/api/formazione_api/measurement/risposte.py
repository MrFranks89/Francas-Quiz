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


def _multiple(domande: list[dict]) -> tuple[dict, list[str]]:
    """Risposte multiple: le giuste sono sistematicamente le opzioni più lunghe?

    Una domanda conta se le k giuste sono esattamente le k opzioni più lunghe (la più corta delle giuste
    più lunga della più lunga delle sbagliate). Se la lunghezza non dice nulla, accade con probabilità
    1/C(n, k); come per la scelta singola si usa la coda binomiale con soglia ALFA_LUNGHEZZA.
    """
    giuste_piu_lunghe, attesa = 0, 0.0
    for q in domande:
        giuste = set(q['correctOptionIds'])
        lunghezze = {o['id']: len(o['text'].strip()) for o in q['options']}
        sbagliate = [l for i, l in lunghezze.items() if i not in giuste]
        if sbagliate and min(lunghezze[i] for i in giuste) > max(sbagliate):
            giuste_piu_lunghe += 1
        attesa += 1 / comb(len(q['options']), len(giuste))
    n = len(domande)
    p = _coda_binomiale(n, giuste_piu_lunghe, attesa / n) if n and giuste_piu_lunghe > attesa else 1.0
    avvisi = [f'Risposta multipla: le giuste sono sistematicamente le opzioni più lunghe in {giuste_piu_lunghe} '
              f'su {n} domande (attese {attesa:.1f}).'] if p < ALFA_LUNGHEZZA else []
    return dict(domande=n, giustePiuLunghe=giuste_piu_lunghe, attesaGiustePiuLunghe=round(attesa, 2)), avvisi


def analizza_risposte(course: dict) -> dict:
    # Vero/falso escluso: opzioni fisse «Vero», «Falso» in quest'ordine e mai mescolate
    # (displayOptions in packages/learning-engine/src/options.ts), quindi né la posizione né la
    # lunghezza della giusta dicono qualcosa sul generatore. `kind` assente vale 'single'.
    # La risposta multipla ha più giuste: non entra in posizione e lunghezza della scelta singola,
    # si controlla a parte (_multiple).
    domande = [q for q in course['questions'] if q.get('kind', 'single') not in ('truefalse', 'multiple')]
    escluse = sum(q.get('kind') == 'truefalse' for q in course['questions'])
    multiple, avviso_multiple = _multiple([q for q in course['questions'] if q.get('kind') == 'multiple'])
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
    avvisi.extend(avviso_multiple)
    return dict(domande=n, escluseVeroFalso=escluse, multiple=multiple, posizioni=posizioni, posizioniValutabili=valutabili, chiQuadro=chi,
                piuLunga=piu_lunga, attesaPiuLunga=round(attesa_lunga, 2), avvisi=avvisi)


__all__ = ['analizza_risposte']
