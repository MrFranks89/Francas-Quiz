import json
from copy import deepcopy
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from formazione_api.editing_routes import router
from formazione_api.storage import Store


@pytest.fixture
def editor(tmp_path):
    app = FastAPI()
    app.state.store = Store(tmp_path)
    app.include_router(router)
    identifier = app.state.store.new_id()
    course = json.loads((Path(__file__).parent / 'fixtures/generated-course.json').read_text(encoding='utf-8'))
    draft = dict(id=identifier, status='draft', course=course, warnings=['Bozza sintetica di test'])
    app.state.store.save(identifier, 'draft.json', draft)
    return TestClient(app), identifier, draft, app.state.store


def test_edit_gate_rules_and_publish_snapshot(editor):
    client, identifier, draft, store = editor
    course = deepcopy(draft['course'])
    course['title'] = 'Titolo rivisto'
    course['modules'][0]['exam'].update(mode='gate', passingScore=4, maxAttempts=3)  # 4 su 6: la soglia minima del 60%
    response = client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course))
    assert response.status_code == 200
    assert response.json()['revision'] == 2
    assert response.json()['course'] == course
    body = dict(expectedRevision=2, confirmReviewed=True)
    published = client.post(f'/drafts/{identifier}/publish', json=body)
    assert published.status_code == 200
    assert published.json()['status'] == 'published'
    assert published.json()['course']['modules'][0]['exam']['mode'] == 'gate'
    assert client.post(f'/drafts/{identifier}/publish', json=body).json() == published.json()
    assert client.get(f'/courses/{identifier}').json() == published.json()
    course['title'] = 'Tentativo dopo pubblicazione'
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=2, course=course)).status_code == 409
    assert store.read(identifier, 'course.json') == published.json()
    assert store.read(identifier, 'draft.json')['status'] == 'draft'


@pytest.mark.parametrize('field,value', [('id','other'),('version',2),('sources',[])])
def test_identity_and_sources_immutable(editor, field, value):
    client, identifier, draft, store = editor
    course = deepcopy(draft['course'])
    course[field] = value
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code == 422
    assert store.read(identifier, 'draft.json') == draft


@pytest.mark.parametrize('field,value', [('excerpt','Alterato'),('page',1),('documentId','another'),('label','Altro')])
def test_source_metadata_and_excerpt_immutable(editor, field, value):
    client, identifier, draft, _ = editor
    course = deepcopy(draft['course'])
    course['sources'][0][field] = value
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code == 422


def test_stale_revision_edit_and_publish(editor):
    client, identifier, draft, _ = editor
    edit = dict(expectedRevision=1, course=draft['course'])
    assert client.put(f'/drafts/{identifier}', json=edit).status_code == 200
    assert client.put(f'/drafts/{identifier}', json=edit).status_code == 409
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=True)).status_code == 409


@pytest.mark.parametrize('confirmation', [False,'true',1,None])
def test_review_confirmation_strict(editor, confirmation):
    client, identifier, _, _ = editor
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=confirmation)).status_code == 422
    assert client.get(f'/courses/{identifier}').status_code == 404


@pytest.mark.parametrize('revision', [0,True,'1',1.1])
def test_revision_strict(editor, revision):
    client, identifier, draft, _ = editor
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=revision, course=draft['course'])).status_code == 422
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=revision, confirmReviewed=True)).status_code == 422


def test_missing_invalid_and_unpublished_courses(editor):
    client, identifier, draft, _ = editor
    assert client.get(f'/courses/{identifier}').status_code == 404
    for missing in ['invalid', 'a'*32]:
        assert client.get(f'/courses/{missing}').status_code == 404
        assert client.put(f'/drafts/{missing}', json=dict(expectedRevision=1, course=draft['course'])).status_code == 404
        assert client.post(f'/drafts/{missing}/publish', json=dict(expectedRevision=1, confirmReviewed=True)).status_code == 404


def test_semantically_invalid_course_not_saved(editor):
    client, identifier, draft, store = editor
    course = deepcopy(draft['course'])
    course['questions'][0]['correctOptionId'] = 'invented'
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code == 422
    assert store.read(identifier, 'draft.json') == draft


def test_duplicate_publish_stale_revision_is_conflict(editor):
    client, identifier, _, _ = editor
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=True)).status_code == 200
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=2, confirmReviewed=True)).status_code == 409


def test_publish_revalidates_persisted_course(editor):
    client, identifier, draft, store = editor
    draft['course']['questions'][0]['correctOptionId'] = 'broken-persisted-data'
    store.save(identifier, 'draft.json', draft)
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=True)).status_code == 422
    assert client.get(f'/courses/{identifier}').status_code == 404


def test_concurrent_updates_only_one_revision_wins(editor):
    client, identifier, draft, store = editor
    def update(title):
        course = deepcopy(draft['course'])
        course['title'] = title
        with TestClient(client.app) as connection:
            return connection.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(update, ['Revisione A', 'Revisione B']))
    assert sorted(results) == [200, 409]
    assert store.read(identifier, 'draft.json')['revision'] == 2
