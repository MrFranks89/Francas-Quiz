"""HTTP boundary for generation; provider is configured on the server only."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from .esclusione_pagine import EsclusioneNonValida, applica_esclusione, non_lette_rimaste, registra_esclusione

from .generation import GenerationError, config_status
from .generation.chunks import plan_chunks
from .generation.concept_provider import extract_concept_tree
from .pagine_non_lette import messaggio_blocco
from .ripresa_generazione import cancella as cancella_ripresa
from .routes import read_record
from .spesa_generazione import SpesaRifiuto, configurazione_spesa, genera_con_tetto, preventivo_pubblico

router = APIRouter()


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='Corso dal documento', min_length=1, max_length=200)
    acknowledgeWarnings: StrictBool = False
    # Pagine escluse su richiesta dell'utente (esclusione_pagine.py): validate nella rotta per
    # rispondere 422 con un messaggio leggibile.
    excludePages: list[StrictInt] = Field(default_factory=list, max_length=10000)
    # Ricominciare da capo scartando i blocchi salvati da una generazione interrotta
    # (ripresa_generazione.py); predefinito: si riprende dal primo blocco mancante.
    restart: StrictBool = False


class ConceptTreeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    excludePages: list[StrictInt] = Field(default_factory=list, max_length=10000)


def _generation_http_error(error: GenerationError) -> HTTPException:
    if error.code == 'not_configured':
        status = 503
    elif error.code.startswith('provider_') or error.code in ('invalid_generated_content', 'invented_source', 'invalid_course'):
        status = 502
    else:
        status = 422
    # `cause`: causa strutturata e già oscurata di un errore del fornitore (generation/causa.py);
    # l'app mostra `message` (apps/learner/src/api/errors.ts), che per questi errori la descrive.
    dettaglio = {'code': error.code, 'message': str(error)}
    if error.causa:
        dettaglio['cause'] = error.causa
    # Blocco fallito durante la generazione: quanti blocchi sono salvati per la ripresa e quanti in
    # totale (`savedChunks`, `totalChunks`, ripresa_generazione.Ripresa.stato), per il pannello dell'app.
    if error.ripresa:
        dettaglio.update(error.ripresa)
    return HTTPException(status, dettaglio)


def _escludi(extraction: dict, pagine: list[int]) -> dict:
    try:
        return applica_esclusione(extraction, pagine)
    except EsclusioneNonValida as error:
        raise HTTPException(422, {'code': error.code, 'message': str(error)}) from error


@router.get('/generation/config')
def configuration(request: Request):
    return {**config_status(), 'spending': configurazione_spesa(request.app.state.store)}


@router.get('/extractions/{identifier}/generation-estimate')
def generation_estimate(identifier: str, request: Request, excludePages: list[int] = Query(default=[])):
    """Costo massimo garantito prima di generare: stessa decisione applicata da generate_course,
    sulle stesse pagine (esclusione compresa). `unreadPages`: pagine non lette che bloccano ancora."""
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    stima = preventivo_pubblico(_escludi(extraction, excludePages),
                                getattr(request.app.state, 'generation_provider', None), store, excludePages)
    pagine = non_lette_rimaste(extraction, excludePages)
    stima = {**stima, 'unreadPages': pagine, 'excludedPages': sorted(excludePages)}
    if pagine and stima['allowed']:
        # Come generate_course: le pagine non lette rimaste bloccano prima del fornitore.
        stima.update(allowed=False, refusal={'code': 'unread_pages', 'message': messaggio_blocco(pagine)})
    return stima


@router.post('/extractions/{identifier}/generate', status_code=201)
def generate_course(identifier: str, body: GenerationRequest, request: Request):
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    if not body.title.strip():
        raise HTTPException(422, {'code': 'invalid_title', 'message': 'Inserire un titolo.'})
    # Vale anche con «Ho verificato»: da una scansione non letta il corso nascerebbe dalle sole
    # intestazioni e la pagina resterebbe esclusa in silenzio. Si esclude solo dichiarandolo: con
    # una nuova selezione che non la contiene, con `excludePages` (esclusione_pagine.py), oppure la
    # si legge con l'OCR (pagine_non_lette.py).
    da_generare = _escludi(extraction, body.excludePages)
    if pagine := non_lette_rimaste(extraction, body.excludePages):
        raise HTTPException(422, {'code': 'unread_pages', 'message': messaggio_blocco(pagine), 'pages': pagine})
    draft_id = store.new_id()
    try:
        # Preventivo, limiti del server e registro prima di qualunque chiamata (spesa_generazione.py).
        # Blocchi salvati da una generazione interrotta: riusati se l'impronta coincide (stesse pagine
        # escluse, stesso fornitore e modello...), scartati con `restart` (ripresa_generazione.py).
        result = genera_con_tetto(da_generare, getattr(request.app.state, 'generation_provider', None), store, draft_id,
                                  escluse=body.excludePages, ricomincia=body.restart,
                                  title=body.title.strip(), acknowledge_warnings=body.acknowledgeWarnings)
    except SpesaRifiuto as rifiuto:
        raise HTTPException(rifiuto.status, {'code': rifiuto.code, 'message': str(rifiuto)}) from rifiuto
    except GenerationError as error:
        raise _generation_http_error(error) from error
    result = {'id': draft_id, 'revision': 1, **registra_esclusione(result, body.excludePages)}
    store.save(draft_id, 'draft.json', result)
    # Solo a bozza salvata: se il salvataggio fallisse, i blocchi resterebbero riusabili.
    cancella_ripresa(store.root, identifier)
    return result


@router.post('/extractions/{identifier}/concept-tree', status_code=200)
def concept_tree(identifier: str, request: Request, body: ConceptTreeRequest | None = None):
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    exclude_pages = body.excludePages if body is not None else []
    da_generare = _escludi(extraction, exclude_pages)
    provider = getattr(request.app.state, 'concept_provider', None)
    if provider is None:
        gen_provider = getattr(request.app.state, 'generation_provider', None)
        if gen_provider is not None and hasattr(gen_provider, 'concept_tree'):
            provider = gen_provider
    try:
        chunks = plan_chunks(da_generare['blocks'])
        tree = extract_concept_tree(chunks[0], provider=provider)
    except GenerationError as error:
        raise _generation_http_error(error) from error
    return tree.model_dump()


@router.get('/drafts/{identifier}')
def get_draft(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'draft.json')
