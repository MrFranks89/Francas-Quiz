"""Corsi salvati o pubblicati prima delle regole di qualità di singola domanda (decisione del 9 novembre 2026).

In lettura vale solo la validazione strutturale: un corso vecchio si apre sempre. Le regole di qualità
(opzioni duplicate, giusta troppo lunga, formule autoreferenziali, di contesto e di tempo) valgono quando
si genera, si salva una bozza o si pubblica. Il server non valida in lettura: GET /drafts e GET /courses
restituiscono il record com'è; Course (generation/corso.py) si usa solo in scrittura.

fixtures/corso-prima-delle-regole.json è generated-course.json con tre domande scritte come quelle vere
della corsa del 20 ottobre 2026 (var/misure/corse/20261020-095746-20c276a6): una giusta troppo lunga,
un «secondo il testo» nel testo della domanda, un «come indicato» nella spiegazione.
"""
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from formazione_api.editing_routes import router as editing
from formazione_api.generation import generate
from formazione_api.generation.models import violazioni_domanda
from formazione_api.generation_routes import router as generation
from formazione_api.storage import Store

VECCHIO = json.loads((Path(__file__).parent / 'fixtures' / 'corso-prima-delle-regole.json').read_text(encoding='utf-8'))


def _codici(course):
    return sorted(c for q in course['questions'] for c, _ in violazioni_domanda(q))


def test_la_fixture_viola_solo_regole_di_qualita():
    # Esclude che il corso vecchio sia rifiutato per un motivo strutturale invece che di qualità.
    assert _codici(VECCHIO) == ['autoreferenziale', 'autoreferenziale', 'giusta_troppo_lunga']


@pytest.fixture
def server(tmp_path):
    app = FastAPI()
    app.state.store = Store(tmp_path)
    app.include_router(editing)
    app.include_router(generation)
    return TestClient(app), app.state.store


def _salva_bozza(store):
    identifier = store.new_id()
    draft = dict(id=identifier, status='draft', revision=1, course=deepcopy(VECCHIO), warnings=[])
    store.save(identifier, 'draft.json', draft)
    return identifier, draft


def test_una_bozza_vecchia_si_riapre(server):
    client, store = server
    identifier, draft = _salva_bozza(store)
    response = client.get(f'/drafts/{identifier}')
    assert response.status_code == 200
    assert response.json() == draft


def test_un_corso_pubblicato_vecchio_si_riapre(server):
    client, store = server
    identifier, draft = _salva_bozza(store)
    pubblicato = {**draft, 'status': 'published'}
    store.save(identifier, 'course.json', pubblicato)
    response = client.get(f'/courses/{identifier}')
    assert response.status_code == 200
    assert response.json() == pubblicato


def test_salvare_il_corso_vecchio_modificato_e_rifiutato_con_gli_errori(server):
    client, store = server
    identifier, draft = _salva_bozza(store)
    course = deepcopy(VECCHIO)
    course['title'] = 'Titolo rivisto'
    response = client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course))
    assert response.status_code == 422
    dettaglio = response.json()['detail']
    assert 'La risposta giusta è più lunga di 1,5 volte' in dettaglio
    assert '«come indicato»' in dettaglio
    assert '«secondo il testo»' in dettaglio
    assert store.read(identifier, 'draft.json') == draft


def test_pubblicare_il_corso_vecchio_e_rifiutato_con_gli_errori(server):
    client, store = server
    identifier, _ = _salva_bozza(store)
    response = client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=1, confirmReviewed=True))
    assert response.status_code == 422
    assert 'La risposta giusta è più lunga di 1,5 volte' in response.json()['detail']
    assert client.get(f'/courses/{identifier}').status_code == 404


def test_corretto_si_salva_e_si_pubblica(server):
    # Contro-prova: tolte le tre violazioni, lo stesso corso passa. Il rifiuto sopra è delle regole di qualità.
    client, store = server
    identifier, _ = _salva_bozza(store)
    course = deepcopy(VECCHIO)
    course['questions'][0]['options'][1]['text'] = 'La crescita dei servizi ICT nel periodo'
    course['questions'][0]['options'][0]['text'] = 'La riduzione del tempo di lavoro'
    course['questions'][7]['prompt'] = 'Di quanto sono cresciuti gli occupati in Italia dal 2011 al 2022?'
    course['questions'][7]['explanation'] = 'Gli occupati sono cresciuti di circa 700 mila unità.'
    assert _codici(course) == []
    assert client.put(f'/drafts/{identifier}', json=dict(expectedRevision=1, course=course)).status_code == 200
    assert client.post(f'/drafts/{identifier}/publish', json=dict(expectedRevision=2, confirmReviewed=True)).status_code == 200


def test_la_generazione_continua_a_scartare_le_stesse_domande():
    from test_generation import extraction
    from test_scarto_domande import COMUNI, Fornitore

    def domande(refs):
        comuni = dict(COMUNI, sourceRefs=refs)
        return [
            dict(kind='single', prompt='Quale risposta?', options=['Prima', 'Seconda'], correctIndex=0, rationales=['', ''], **comuni),
            {**comuni, **dict(kind='single', prompt=VECCHIO['questions'][0]['prompt'], correctIndex=0, rationales=['', ''],
                              options=[o['text'] for o in VECCHIO['questions'][0]['options']])},
            {**comuni, **dict(kind='single', prompt=VECCHIO['questions'][7]['prompt'], correctIndex=0, rationales=['', ''],
                              options=[o['text'] for o in VECCHIO['questions'][7]['options']])},
            {**comuni, **dict(kind='single', prompt='Quanti sono gli occupati in più?', correctIndex=0, rationales=['', ''],
                              options=[o['text'] for o in VECCHIO['questions'][7]['options']],
                              explanation=VECCHIO['questions'][7]['explanation'])},
        ]
    result = generate(extraction(), Fornitore(domande))
    assert [q['prompt'] for q in result['course']['questions']] == ['Quale risposta?']
    assert [s['rule'] for s in result['scarti']] == ['giusta_troppo_lunga', 'autoreferenziale', 'autoreferenziale']


def test_i_casi_con_regola_sono_le_regole_di_qualita():
    # Allineamento con il contratto TS: i casi con `rule` sono accettati da CorsoLeggibileSchema
    # (packages/contracts/__tests__/lettura.test.ts), quindi devono essere tutti e soli di qualità.
    from formazione_api.generation.regole import CODICI_DI_QUALITA
    casi = json.loads((Path(__file__).parent / 'fixtures' / 'invalid-course-cases.json').read_text(encoding='utf-8'))
    assert {c['rule'] for c in casi if 'rule' in c} == CODICI_DI_QUALITA


def test_le_regole_di_qualita_vengono_dopo_quelle_strutturali():
    # erroriTipo in TS è erroriStrutturaTipo seguito da erroriQualitaTipo: stesso ordine di violazioni_tipo.
    from formazione_api.generation.regole import CODICI_DI_QUALITA, violazioni_tipo
    codici = [c for _, c, _ in violazioni_tipo('fillblank', 'Come hai visto, attualmente?', [('a', 'Uno'), ('b', 'uno')], None,
                                                situation='Situazione')]
    qualita = [c in CODICI_DI_QUALITA for c in codici]
    assert any(qualita) and not all(qualita)
    assert qualita == sorted(qualita)
