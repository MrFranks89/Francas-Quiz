"""HTTP boundary for generation; provider is configured on the server only."""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from .esclusione_pagine import EsclusioneNonValida, applica_esclusione, non_lette_rimaste, registra_esclusione

from .generation import GenerationError, config_status
from .pagine_non_lette import messaggio_blocco
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
                                getattr(request.app.state, 'generation_provider', None), store)
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
        result = genera_con_tetto(da_generare, getattr(request.app.state, 'generation_provider', None), store, draft_id,
                                  title=body.title.strip(), acknowledge_warnings=body.acknowledgeWarnings)
    except SpesaRifiuto as rifiuto:
        raise HTTPException(rifiuto.status, {'code': rifiuto.code, 'message': str(rifiuto)}) from rifiuto
    except GenerationError as error:
        if error.code == 'not_configured':
            status = 503
        elif error.code.startswith('provider_') or error.code in ('invalid_generated_content', 'invented_source', 'invalid_course'):
            status = 502
        else:
            status = 422
        raise HTTPException(status, {'code': error.code, 'message': str(error)}) from error
    result = {'id': draft_id, 'revision': 1, **registra_esclusione(result, body.excludePages)}
    store.save(draft_id, 'draft.json', result)
    return result


@router.get('/drafts/{identifier}')
def get_draft(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'draft.json')
