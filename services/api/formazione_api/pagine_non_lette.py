"""Pagine il cui testo non è stato letto: scansioni senza OCR, o OCR che non ha letto niente.

Gli avvisi si scrivono e si leggono solo qui, così il formato del testo non può divergere fra chi
li produce (extractors.py, docling_adapter.py) e chi blocca la generazione (generation_routes.py,
measurement/corsa.py). Un'estrazione con una di queste pagine non genera un corso: il testo che
ne resta è solo l'intestazione, e generare comunque escluderebbe la pagina in silenzio.
"""
import re


def avviso_scansione(page: int) -> str:
    """Estrazione nativa: pagina con poco testo e un'immagine che la copre (criterio in extractors.py)."""
    return f'Pagina {page}: probabile scansione: richiede OCR.'


def avviso_ocr_vuoto(page: int) -> str:
    """OCR completato, ma sulla scansione non ha letto più del testo nativo già presente."""
    return f'Pagina {page}: OCR senza testo utile: la scansione non è stata letta.'


_NON_LETTA = re.compile(r'^Pagina (\d+): (?:probabile scansione: richiede OCR|OCR senza testo utile)')


def pagine_non_lette(warnings: list[str]) -> list[int]:
    """Numeri di pagina, in ordine, degli avvisi prodotti da avviso_scansione o avviso_ocr_vuoto."""
    return sorted({int(m.group(1)) for w in warnings if (m := _NON_LETTA.match(w))})


def messaggio_blocco(pagine: list[int]) -> str:
    elenco = ', '.join(map(str, pagine))
    return (f'Pagine scansionate senza testo letto: {elenco}. Il corso verrebbe generato dalle sole '
            "intestazioni. Estrarre di nuovo con l'OCR, oppure selezionare un intervallo che escluda "
            'queste pagine.')
