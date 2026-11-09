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
    assert {q.kind for q in course.questions} == {'single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement', 'multiple'}
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
    (lambda c: domanda(c, 'multiple').update(correctOptionIds=['option-2-mu-0']), 'almeno 2 risposte giuste'),
    (lambda c: domanda(c, 'multiple').update(correctOptionIds=[f'option-2-mu-{k}' for k in range(4)]), 'almeno una risposta sbagliata'),
    (lambda c: domanda(c, 'multiple').update(correctOptionIds=['option-2-mu-0', 'inventata']), 'opzioni diverse'),
    (lambda c: domanda(c, 'multiple').update(correctOptionId='option-2-mu-0'), 'vanno in correctOptionIds'),
    (lambda c: c['questions'][0].update(correctOptionIds=['option-1-a', 'option-1-b']), 'vale solo per il tipo multiple'),
    (lambda c: c['questions'][0].pop('correctOptionId'), 'Manca la risposta giusta'),
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
    # Anche sulla scelta singola, come le domande del quiz in Civis (verifica-contenuti.mjs 924–930).
    assert len(errori_tipo('single', 'Domanda?', [('a', 'giusta molto molto lunga'), ('b', 'no')], 'a')) == 1


def test_null_esplicito_su_campo_facoltativo_rifiutato_anche_da_zod():
    # Zod `optional()` rifiuta null; il backend lo accetta come assente ma non lo riscrive:
    # si verifica solo che il dump non contenga null, così TS e Python leggono lo stesso JSON.
    course = sample()
    course['questions'][0]['situation'] = None
    dumped = Course.model_validate(deepcopy(course)).model_dump()
    assert 'situation' not in dumped['questions'][0]


def test_bozza_multipla_non_piu_di_meta_giuste():
    # Regole di qualità: non rifiutano la bozza, la pipeline scarta la domanda (test_scarto_domande.py).
    from test_generation import domande_di_prova
    from formazione_api.generation.models import QuestionDraft, violazioni_domanda
    from formazione_api.generation.pipeline import domanda_del_contratto
    base = next(d for d in domande_di_prova(['page-1']) if d['kind'] == 'multiple')
    assert QuestionDraft.model_validate(base).correctIndexes == [0, 1]

    def violazioni(**campi):
        bozza = QuestionDraft.model_validate({**base, **campi})
        return [codice for codice, _ in violazioni_domanda(domanda_del_contratto(bozza, 'q', 'm', 'l'))]
    assert violazioni() == []
    assert violazioni(correctIndexes=[0, 1, 2]) == ['multipla_oltre_meta_giuste']
    assert violazioni(correctIndexes=[0]) == ['multipla_meno_di_due_giuste']
    # Indice fuori dalle opzioni: errore strutturale, la bozza resta rifiutata.
    with pytest.raises(ValidationError):
        QuestionDraft.model_validate({**base, 'correctIndexes': [0, 9]})
