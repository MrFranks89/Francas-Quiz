"""Esclusione esplicita di pagine da una generazione, decisa dall'utente.

Nessuna esclusione silenziosa: le pagine escluse si tolgono solo dal materiale mandato al fornitore
(i loro blocchi), mai dall'estrazione salvata, e restano scritte nella bozza in tre punti:
- un avviso, `avviso_esclusione`, copiato da generate() fra gli avvisi della bozza;
- il campo `excludedPages` del risultato;
- `coverage.excludedPages`, con il motivo `user_request`: pagina esclusa motivatamente, non persa
  (registro di copertura, docs/ROADMAP.md).
Il preventivo (GET /extractions/{id}/generation-estimate) usa la stessa funzione, quindi il costo
mostrato è calcolato sulle stesse pagine che la generazione manderebbe.
"""
from .pagine_non_lette import pagine_non_lette

MOTIVO = 'user_request'


class EsclusioneNonValida(ValueError):
    code = 'invalid_excluded_pages'


def _elenco(pagine: list[int]) -> str:
    testi = [str(p) for p in pagine]
    return testi[0] if len(testi) == 1 else f"{', '.join(testi[:-1])} e {testi[-1]}"


def avviso_esclusione(pagine: list[int]) -> str:
    ordinate = sorted(pagine)
    return f"Escluse dal corso su richiesta: {'pagina' if len(ordinate) == 1 else 'pagine'} {_elenco(ordinate)}"


def pagine_selezionate(extraction: dict) -> range | None:
    """Pagine dell'estrazione secondo la selezione salvata da routes.extract (models.selected_pages).
    None per i documenti senza pagine (testo, Word)."""
    selezione = extraction.get('selection') or {}
    if selezione.get('mode') == 'range':
        return range(selezione['fromPage'], selezione['toPage'] + 1)
    if selezione.get('mode') == 'all' and extraction.get('pageCount'):
        return range(1, extraction['pageCount'] + 1)
    return None


def applica_esclusione(extraction: dict, pagine: list[int]) -> dict:
    """Copia dell'estrazione senza i blocchi delle pagine escluse e con l'avviso dell'esclusione in
    testa. L'estrazione ricevuta non viene modificata. Elenco vuoto: estrazione invariata."""
    if not pagine:
        return extraction
    if len(set(pagine)) != len(pagine):
        doppie = sorted({p for p in pagine if pagine.count(p) > 1})
        raise EsclusioneNonValida(f'Pagine da escludere indicate più volte: {_elenco(doppie)}.')
    selezionate = pagine_selezionate(extraction)
    if selezionate is None:
        raise EsclusioneNonValida('Questo documento non ha pagine numerate: tutte le pagine indicate sono fuori dalla selezione.')
    if fuori := sorted(p for p in pagine if p not in selezionate):
        raise EsclusioneNonValida(f'Pagine da escludere fuori dalla selezione ({selezionate.start}–{selezionate.stop - 1}): '
                                  f'{_elenco(fuori)}.')
    escluse = set(pagine)
    blocchi = [b for b in extraction.get('blocks', []) if b.get('page') not in escluse]
    if not blocchi:
        raise EsclusioneNonValida('Escludendo queste pagine non resta nessun testo da cui generare il corso.')
    return {**extraction, 'blocks': blocchi, 'warnings': [avviso_esclusione(pagine), *extraction.get('warnings', [])]}


def non_lette_rimaste(extraction: dict, pagine: list[int]) -> list[int]:
    """Pagine non lette (pagine_non_lette.py) che l'esclusione non copre: continuano a bloccare."""
    return [p for p in pagine_non_lette(extraction.get('warnings', [])) if p not in set(pagine)]


def registra_esclusione(risultato: dict, pagine: list[int]) -> dict:
    """Campi strutturati dell'esclusione nel risultato di generate(); presenti anche se vuoti."""
    ordinate = sorted(pagine)
    copertura = {**risultato['coverage'], 'excludedPages': [{'page': p, 'reason': MOTIVO} for p in ordinate]}
    return {**risultato, 'coverage': copertura, 'excludedPages': ordinate}
