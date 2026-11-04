"""Causa di un errore del fornitore AI: strutturata, senza segreti, registrata.

Ogni eccezione del client (SDK `openai` o `anthropic`, oppure un'eccezione qualunque di un client
finto) diventa `provider_error` con:
- un messaggio leggibile in italiano, scelto dal codice HTTP o dal tipo di guasto (messaggio());
- una causa strutturata (`GenerationError.causa`), che finisce nel registro della spesa (voce della
  chiamata, measurement/guardia.FornitoreSorvegliato), nella risposta HTTP (`detail.cause`,
  generation_routes.py) e nel log del server a livello WARNING (errore_fornitore()).

Prima ogni eccezione diventava un messaggio fisso e la causa era persa: il 3 novembre 2026 due
generazioni Gemini fallite non dicevano se per il limite del piano gratuito, la chiave o lo schema.

Attributi letti dalle eccezioni degli SDK installati in .venv (letti, non ricordati):
- `status_code`: APIStatusError (e APIResponseValidationError), da `response.status_code`, in
  openai/_exceptions.py 3.31.0 e anthropic/_exceptions.py 1.15.0. Assente per APIConnectionError
  e APITimeoutError, che non hanno una risposta.
- `body`: APIError, «the API response body», JSON decodificato o testo grezzo, None senza risposta
  (stessi file). OpenAI lo scompone già: `body.get("error", body)` in openai/_client.py
  `_make_status_error`; Anthropic no: {"type": "error", "error": {"type", "message"}}.
- `type`: openai APIError.type (da body["type"]); anthropic APIStatusError.type (da
  body["error"]["type"], valori in anthropic/types/shared/error_type.py).
- `code`: solo openai APIError.code (da body["code"], convertito in stringa).
- `message`: APIError.message, il testo costruito dallo SDK («Error code: 429 - {...}» in
  openai/_base_client.py e anthropic/_base_client.py `_make_status_error_from_response`).
- nomi delle classi APITimeoutError (sottoclasse di APIConnectionError) e APIConnectionError:
  stessi file; confrontati per nome sulla gerarchia, così valgono per entrambi gli SDK.

La forma del corpo d'errore di Gemini sull'endpoint compatibile OpenAI non è documentata nella
pagina di compatibilità letta il 2026-11-03 e non è verificabile senza una chiamata reale: si legge
`message` dal corpo se è un oggetto, o dal primo elemento se è un elenco; altrimenti il messaggio
dello SDK.
"""
import logging
import os
import re

from .errors import GenerationError

log = logging.getLogger(__name__)

LUNGHEZZA_MASSIMA = 500
OSCURATO = '[oscurato]'

# Sequenze simili a chiavi: OpenAI (sk-..., sk-proj-...), Anthropic (sk-ant-...), Google (AIza...);
# intestazioni e parametri che portano una credenziale. Il nome dell'intestazione resta, il valore no.
_SCHEMI = (
    (re.compile(r'sk-[A-Za-z0-9_\-]{6,}'), OSCURATO),
    (re.compile(r'AIza[0-9A-Za-z_\-]{10,}'), OSCURATO),
    (re.compile(r'(?i)(bearer\s+)[^\s\'",}]+'), r'\1' + OSCURATO),
    (re.compile(r'(?i)((?:x-api-key|x-goog-api-key|api[_-]?key|authorization)["\']?\s*[:=]\s*["\']?)'
                r'(?!bearer\s)[^\s\'",}]+'), r'\1' + OSCURATO),
    (re.compile(r'(?i)([?&]key=)[^&\s\'"]+'), r'\1' + OSCURATO),
)


def oscura(testo: str) -> str:
    """Toglie dal testo le sequenze simili a chiavi e i valori delle variabili *_API_KEY del processo
    (una chiave senza un prefisso noto resta comunque esclusa)."""
    for nome, valore in os.environ.items():
        if nome.endswith('_API_KEY') and len(valore.strip()) >= 8:
            testo = testo.replace(valore.strip(), OSCURATO)
    for schema, sostituto in _SCHEMI:
        testo = schema.sub(sostituto, testo)
    return testo


def _pulito(valore, lunghezza=LUNGHEZZA_MASSIMA):
    if valore is None:
        return None
    # Prima si oscura, poi si tronca: un taglio a metà di una chiave non deve sfuggire al filtro.
    testo = oscura(str(valore))
    return testo if len(testo) <= lunghezza else testo[:lunghezza - 1] + '…'


def _messaggio_dal_corpo(corpo):
    if isinstance(corpo, dict):
        if isinstance(corpo.get('error'), (dict, list)):
            return _messaggio_dal_corpo(corpo['error'])
        messaggio = corpo.get('message')
        return messaggio if isinstance(messaggio, str) and messaggio.strip() else None
    if isinstance(corpo, list) and corpo:
        return _messaggio_dal_corpo(corpo[0])
    return None


def _classi(errore) -> set[str]:
    return {classe.__name__ for classe in type(errore).__mro__}


def causa_errore(errore: BaseException) -> dict:
    """Classe, codice HTTP, tipo e codice del fornitore, messaggio troncato; nessun segreto."""
    stato = getattr(errore, 'status_code', None)
    messaggio = (_messaggio_dal_corpo(getattr(errore, 'body', None)) or getattr(errore, 'message', None)
                 or str(errore) or None)
    return dict(classe=type(errore).__name__,
                statoHttp=stato if isinstance(stato, int) else None,
                tipo=_pulito(getattr(errore, 'type', None), 100),
                codice=_pulito(getattr(errore, 'code', None), 100),
                messaggio=_pulito(messaggio))


def messaggio(causa: dict, classi: set[str] | frozenset[str] = frozenset()) -> str:
    """Messaggio in italiano per l'utente, mostrato dall'app come `detail.message`. `classi`: nomi
    della gerarchia dell'eccezione (timeout e connessione si riconoscono anche da una sottoclasse)."""
    stato, classe = causa.get('statoHttp'), causa.get('classe')
    testo = causa.get('messaggio')
    if stato == 429:
        return 'Il fornitore ha rifiutato la richiesta: limite di utilizzo raggiunto (429)'
    if stato == 401:
        return 'Chiave API non valida (401)'
    if stato == 403:
        return 'Il fornitore ha negato l\'accesso con questa chiave (403)'
    if stato in (400, 404, 413, 422):
        descrizione = {400: 'Richiesta non valida per il fornitore', 404: 'Risorsa o modello non trovati dal fornitore',
                       413: 'Richiesta troppo grande per il fornitore', 422: 'Richiesta non valida per il fornitore'}[stato]
        return f'{descrizione} ({stato}): {testo}' if testo else f'{descrizione} ({stato})'
    if stato is not None and stato >= 500:
        return f'Il fornitore non è disponibile al momento ({stato})'
    if stato is not None:
        return f'Il fornitore AI non ha completato la richiesta ({stato})'
    tipi = {classe, *classi}
    if tipi &{'APITimeoutError', 'TimeoutError'}:
        return 'Il fornitore non ha risposto in tempo (timeout)'
    if tipi & {'APIConnectionError', 'ConnectionError'}:
        return 'Impossibile raggiungere il fornitore (errore di connessione)'
    return f'Il fornitore AI non ha completato la richiesta ({classe})'


def errore_fornitore(fornitore: str | None, errore: BaseException) -> GenerationError:
    """GenerationError('provider_error') con la causa, già scritta nel log del server (WARNING).

    L'eccezione dello SDK non viene inghiottita in silenzio: resta in `__cause__` (raise ... from)
    e la sua descrizione, senza segreti, è nel log, nel registro e nella risposta HTTP."""
    causa = causa_errore(errore)
    # APITimeoutError è una sottoclasse di APIConnectionError; ConnectionResetError di ConnectionError.
    testo = messaggio(causa, _classi(errore))
    # Solo la causa già oscurata, mai l'eccezione con la sua traccia (exc_info): il testo grezzo può
    # contenere la chiave.
    log.warning('Fornitore %s: %s — causa %s', fornitore, testo, causa)
    return GenerationError('provider_error', testo, causa=causa)
