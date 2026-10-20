"""Soglia minima degli esami: passingScore non può scendere sotto ⌈60%·n⌉ delle domande.

Il 60% viene da packages/contracts/fixtures/grading-scale.json tramite SOGLIA_SUPERAMENTO_PERCENTO
(confrontata con il file da test_grading_scale.py).
"""
import json
import re
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from formazione_api.editing_routes import router
from formazione_api.generation.models import Course, errore_soglia_minima, soglia_minima
from formazione_api.storage import Store

FIXTURE = Path(__file__).parent / 'fixtures' / 'generated-course.json'


def con_esame(n, passing_score):
    """Corso generato di prova con n domande nell'esame del primo modulo."""
    course = json.loads(FIXTURE.read_text(encoding='utf-8'))
    module = course['modules'][0]
    base = next(q for q in course['questions'] if q['id'] == module['exam']['questionIds'][0])
    extra = [dict(deepcopy(base), id=f"{base['id']}-extra-{i}") for i in range(n - 1)]
    course['questions'].extend(extra)
    module['lessons'][0]['questionIds'].extend(q['id'] for q in extra)
    module['exam']['questionIds'] = [base['id'], *(q['id'] for q in extra)]
    module['exam']['passingScore'] = passing_score
    return course


def test_soglia_minima_in_interi():
    assert [soglia_minima(n) for n in (1, 2, 3, 4, 5, 7, 10, 20)] == [1, 2, 2, 3, 3, 5, 6, 12]


@pytest.mark.parametrize('n,soglia,accettata', [(7, 4, False), (7, 5, True), (5, 2, False), (5, 3, True), (1, 1, True)])
def test_confini_della_soglia(n, soglia, accettata):
    course = con_esame(n, soglia)
    if accettata:
        Course.model_validate(course)
    else:
        with pytest.raises(ValidationError, match=re.escape(errore_soglia_minima(soglia, n))):
            Course.model_validate(course)


def test_messaggio_leggibile():
    assert errore_soglia_minima(4, 7) == 'La soglia minima è 5 risposte su 7 (60%)'
    assert errore_soglia_minima(0, 1) == 'La soglia minima è 1 risposta su 1 (60%)'
    assert errore_soglia_minima(5, 7) is None


@pytest.fixture
def server(tmp_path):
    app = FastAPI()
    app.state.store = Store(tmp_path)
    app.include_router(router)
    identifier = app.state.store.new_id()
    draft = dict(id=identifier, status='draft', course=con_esame(7, 5), warnings=[])
    app.state.store.save(identifier, 'draft.json', draft)
    return TestClient(app), identifier, draft, app.state.store


def test_salvataggio_sotto_la_soglia_minima_rifiutato_con_422_leggibile(server):
    client, identifier, draft, store = server
    course = deepcopy(draft['course'])
    course['modules'][0]['exam']['passingScore'] = 4
    response = client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course))
    assert response.status_code == 422
    assert isinstance(response.json()['detail'], str)
    assert 'La soglia minima è 5 risposte su 7 (60%)' in response.json()['detail']
    assert store.read(identifier, 'draft.json') == draft
    course['modules'][0]['exam']['passingScore'] = 5
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code == 200


def test_pubblicazione_di_bozza_salvata_sotto_la_soglia_rifiutata_con_422_leggibile(server):
    client, identifier, draft, store = server
    draft['course']['modules'][0]['exam']['passingScore'] = 4
    store.save(identifier, 'draft.json', draft)
    response = client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=True))
    assert response.status_code == 422
    assert 'La soglia minima è 5 risposte su 7 (60%)' in response.json()['detail']
    assert client.get(f'/courses/{identifier}').status_code == 404


def test_il_caso_condiviso_diventa_valido_alla_soglia_minima():
    # Esclude che il caso di invalid-course-cases.json sia rifiutato per un motivo diverso dalla soglia.
    course = json.loads(FIXTURE.read_text(encoding='utf-8'))
    cases = json.loads((FIXTURE.parent / 'invalid-course-cases.json').read_text(encoding='utf-8'))
    case = next(c for c in cases if any(ch['path'][-1] == 'passingScore' for ch in c.get('changes', [])))
    for change in case['changes']:
        target = course
        for key in change['path'][:-1]:
            target = target[key]
        target[change['path'][-1]] = change['value']
    exam = course['modules'][0]['exam']
    with pytest.raises(ValidationError, match=re.escape(errore_soglia_minima(exam['passingScore'], len(exam['questionIds'])))):
        Course.model_validate(course)
    exam['passingScore'] = soglia_minima(len(exam['questionIds']))
    Course.model_validate(course)
