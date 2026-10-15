"""Local single-process editing boundary, not a distributed transaction system."""
from threading import RLock
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from .generation.models import Course
from .routes import read_record

router = APIRouter()
# Covers the entire read/validate/write sequence for all editing endpoints in this
# process. Multiple API workers/processes must use a transactional database instead.
_edit_lock = RLock()


class EditRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expectedRevision: StrictInt = Field(ge=1)
    course: Course


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expectedRevision: StrictInt = Field(ge=1)
    confirmReviewed: StrictBool


def _published(store, identifier):
    try:
        return store.read(identifier, 'course.json')
    except FileNotFoundError:
        return None


def _revision(draft, expected):
    if draft.get('revision', 1) != expected:
        raise HTTPException(409, 'La bozza è stata modificata: ricaricarla prima di continuare.')


@router.put('/drafts/{identifier}')
def edit_draft(identifier: str, body: EditRequest, request: Request):
    store = request.app.state.store
    with _edit_lock:
        draft = read_record(store, identifier, 'draft.json')
        if _published(store, identifier) is not None:
            raise HTTPException(409, 'Corso già pubblicato: la bozza non è più modificabile.')
        _revision(draft, body.expectedRevision)
        original = draft['course']
        edited = body.course.model_dump()
        if any(edited[field] != original[field] for field in ('id', 'version', 'sources')):
            raise HTTPException(422, 'Identità, versione e fonti originali del corso non sono modificabili.')
        updated = {**draft, 'course': edited, 'revision': draft.get('revision', 1) + 1}
        store.save(identifier, 'draft.json', updated)
        return updated


@router.post('/drafts/{identifier}/publish')
def publish_draft(identifier: str, body: PublishRequest, request: Request):
    store = request.app.state.store
    with _edit_lock:
        draft = read_record(store, identifier, 'draft.json')
        if body.confirmReviewed is not True:
            raise HTTPException(422, 'Confermare la revisione dei contenuti prima di pubblicare.')
        snapshot = _published(store, identifier)
        if snapshot is not None:
            _revision(snapshot, body.expectedRevision)
            return snapshot
        _revision(draft, body.expectedRevision)
        # Revalidate even persisted data: publish must not bypass the course contract.
        try:
            course = Course.model_validate(draft['course']).model_dump()
        except ValidationError as error:
            raise HTTPException(422, 'Bozza non valida: correggere i contenuti prima di pubblicare.') from error
        snapshot = {**draft, 'id': identifier, 'status': 'published',
                    'revision': draft.get('revision', 1), 'course': course}
        store.save(identifier, 'course.json', snapshot)
        return snapshot


@router.get('/courses/{identifier}')
def get_course(identifier: str, request: Request):
    return read_record(request.app.state.store, identifier, 'course.json')
