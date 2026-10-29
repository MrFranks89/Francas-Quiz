"""Tipi di domanda nel contratto Python: stessi valori e stesse regole di packages/contracts/src/tipi.ts."""
import json
import re
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from formazione_api.generation.models import Course, errori_tipo

ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / 'packages' / 'contracts' / 'fixtures' / 'sample-course.json'
TIPI_TS = ROOT / 'packages' / 'contracts' / 'src' / 'tipi.ts'


def sample():
    return json.loads(SAMPLE.read_text(encoding='utf-8'))


def test_il_backend_accetta_il_corso_campione_con_ogni_tipo():
    course = Course.model_validate(sample())
    assert {q.kind for q in course.questions} == {'single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement'}
    # Il JSON del backend resta leggibile da Zod: niente null per i campi facoltativi assenti.
    dumped = course.model_dump()
    assert dumped['questions'][0]['kind'] == 'single'
    assert 'situation' not in dumped['questions'][0] and 'rationale' not in dumped['questions'][0]['options'][0]
    assert dumped['questions'] == [
        {**q, 'kind': q.get('kind', 'single')} for q in sample()['questions']]


def test_stessi_tipi_e_livelli_del_contratto_typescript():
    sorgente = TIPI_TS.read_text(encoding='utf-8')
    tipi = re.search(r'TIPI_DOMANDA = \[(.*?)\]', sorgente).group(1)
    livelli = re.search(r'DIFFICOLTA = \[(.*?)\]', sorgente).group(1)
    assert re.findall(r"'(\w+)'", tipi) == list(Course.model_fields['questions'].annotation.__args__[0]
                                                 .model_fields['kind'].annotation.__args__)
    assert re.findall(r"'(\w+)'", livelli) == ['base', 'medio', 'avanzato']


def domanda(course, kind):
    return next(q for q in course['questions'] if q.get('kind') == kind)


@pytest.mark.parametrize('muta,atteso', [
    (lambda c: c['questions'][0].update(situation='Contesto'), 'vale solo per il tipo scenario'),
    (lambda c: domanda(c, 'truefalse')['options'].reverse(), '«Vero» e «Falso»'),
    (lambda c: domanda(c, 'fillblank').update(prompt='Il ___ accoglie il ___.'), 'esattamente uno spazio'),
    (lambda c: domanda(c, 'scenario').pop('situation'), 'la situazione è obbligatoria'),
    (lambda c: domanda(c, 'oddOneOut')['options'][1].update(text='Accogliere il nuovo collega'), 'Opzioni duplicate'),
    (lambda c: domanda(c, 'oddOneOut')['options'][2].update(text='Assegnare le ferie e decidere i turni di tutto il reparto'),
     'più lunga di 1,5 volte'),
    (lambda c: domanda(c, 'correctStatement').update(wrong='cliente'), 'esattamente una volta'),
    (lambda c: domanda(c, 'correctStatement').update(sentence='Il fornitore e il fornitore accolgono.'), 'esattamente una volta'),
    (lambda c: c['questions'][0].update(difficulty='facile'), None),
    (lambda c: domanda(c, 'fillblank')['options'][1].update(rationale='  '), None),
])
def test_regole_per_tipo(muta, atteso):
    course = sample()
    muta(course)
    with pytest.raises(ValidationError) as errore:
        Course.model_validate(course)
    if atteso:
        assert atteso in str(errore.value)


def test_soglia_della_lunghezza_in_punti_di_codice():
    opts = lambda giusta: [('a', giusta), ('b', 'xxxx'), ('c', 'yy')]
    assert errori_tipo('oddOneOut', 'Intruso?', opts('aaaaaa'), 'a') == []
    assert len(errori_tipo('oddOneOut', 'Intruso?', opts('aaaaaaa'), 'a')) == 1
    assert errori_tipo('oddOneOut', 'Intruso?', opts('aaaaa\U0001F600'), 'a') == []
    assert errori_tipo('single', 'Domanda?', [('a', 'giusta molto molto lunga'), ('b', 'no')], 'a') == []


def test_null_esplicito_su_campo_facoltativo_rifiutato_anche_da_zod():
    # Zod `optional()` rifiuta null; il backend lo accetta come assente ma non lo riscrive:
    # si verifica solo che il dump non contenga null, così TS e Python leggono lo stesso JSON.
    course = sample()
    course['questions'][0]['situation'] = None
    dumped = Course.model_validate(deepcopy(course)).model_dump()
    assert 'situation' not in dumped['questions'][0]
