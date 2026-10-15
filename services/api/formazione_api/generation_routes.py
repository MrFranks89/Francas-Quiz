"""HTTP boundary for generation; provider is configured on the server only."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from .generation import GenerationError, config_status, generate
from .routes import read_record

router = APIRouter()


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='Corso dal documento', min_length=1, max_length=200)
    acknowledgeWarnings: StrictBool = False


@router.get('/generation/config')
def configuration():
    return config_status()


@router.post('/extractions/{identifier}/generate', status_code=201)
def generate_course(identifier: str, body: GenerationRequest, request: Request):
    store = request.app.state.store
    extraction = read_record(store, identifier, 'extraction.json')
    if not body.title.strip():
        raise HTTPException(422, {'code': 'invalid_title', 'message': 'Inserire un titolo.'})
    try:
        result = generate(extraction, provider=getattr(request.app.state, 'generation_provider', None),
                          title=body.title.strip(), acknowledge_warnings=body.acknowledgeWarnings)
    except GenerationError as error:
        if error.code == 'not_configured':
            status = 503
        elif error.code.startswith('provider_') or error.code in ('invalid_generated_content', 'invented_source', 'invalid_course'):
            status = 502
        else:
            status = 422
        raise HTTPException(status, {'code': error.code, 'message': str(error)}) from error
    draft_id = store.new_id()
    result = {'id': draft_id, 'revision': 1, **result}
    store.save(draft_id, 'draft.json', result)
    return result


@router.get('/drafts/{identifier}')
def get_draft(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'draft.json')
