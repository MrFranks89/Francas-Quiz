"""Forma piatta delle bozze di domanda (generation/bozze.py): i vincoli tolti dalla grammatica restano nel codice.

Con un solo oggetto domanda per tutti i tipi, la grammatica inviata ai fornitori non dice più quali campi
sono pieni per quale tipo, né quante opzioni servono. Qui si controlla che ogni vincolo spostato sia
ancora verificato, sul percorso vero della pipeline (generate), e con quale esito:
- forma del campo → errore del modulo (invalid_generated_content), come prima con le varianti;
- coerenza col tipo → scarto della domanda, con i codici già esistenti in regole.py.
"""
import pytest

from formazione_api.generation import GenerationError, generate
from formazione_api.generation.models import QuestionDraft
from formazione_api.generation.pipeline import domanda_del_contratto
from bozze_di_prova import bozza
from test_generation import domande_di_prova, extraction
from test_scarto_domande import Fornitore


def per_tipo(kind, refs=('page-1',)):
    return next(d for d in domande_di_prova(list(refs)) if d['kind'] == kind)


def scarto_di(guasta, kind):
    """Lo scarto prodotto da una sola domanda guasta, accanto a una buona."""
    def domande(refs):
        return [per_tipo('single', refs), {**per_tipo(kind, refs), **guasta}]
    result = generate(extraction(), Fornitore(domande))
    assert len(result['course']['questions']) == 1
    scarto, = result['scarti']
    return [scarto['rule'], *(r['rule'] for r in scarto['otherRules'])]


@pytest.mark.parametrize('kind,guasta,regola', [
    ('single', dict(situation='Una situazione che non serve.'), 'campo_di_altro_tipo'),
    ('multiple', dict(sentence='Una frase.'), 'campo_di_altro_tipo'),
    ('oddOneOut', dict(wrong='parola'), 'campo_di_altro_tipo'),
    ('single', dict(correctIndexes=[0, 1]), 'giuste_multiple_fuori_tipo'),
    ('truefalse', dict(correctIndexes=[0]), 'giuste_multiple_fuori_tipo'),
    ('truefalse', dict(options=['Sì', 'No'], rationales=['', '']), 'vero_falso_opzioni'),
    ('scenario', dict(situation=''), 'situazione_mancante'),
    ('scenario', dict(situation='   '), 'situazione_mancante'),
    ('correctStatement', dict(sentence='', wrong=''), 'frase_mancante'),
    ('correctStatement', dict(wrong=''), 'parte_sbagliata_mancante'),
])
def test_campo_incoerente_col_tipo_scarta_la_domanda(kind, guasta, regola):
    assert regola in scarto_di(guasta, kind)


@pytest.mark.parametrize('kind,guasta', [
    ('single', dict(options=['Sola'], rationales=[''])),                              # meno di 2 opzioni
    ('fillblank', dict(options=[], rationales=[])),                                   # nessuna opzione
    ('multiple', dict(options=['A', 'B', 'C'], rationales=['', '', ''])),             # multiple: almeno 4
    ('single', dict(options=list('ABCDEFG'), rationales=[''] * 7)),                   # più di 6
    ('multiple', dict(correctIndexes=[0, 4])),                                        # giuste fuori dalle opzioni
    ('single', dict(options=['Prima', ' '])),                                         # opzione vuota senza alternative valide
    ('single', dict(prompt='')),                                                      # testo della domanda vuoto
    ('single', dict(sourceRefs=[])),                                                  # nessuna fonte
])
def test_forma_del_campo_resta_un_errore_del_modulo(kind, guasta):
    def domande(refs):
        return [per_tipo('single', refs), {**per_tipo(kind, refs), **guasta}]
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Fornitore(domande))
    assert error.value.code == 'invalid_generated_content'


def test_discrepanze_tollerate_sanitizzate():
    singola_1based = QuestionDraft.model_validate({**per_tipo('single'), 'correctIndex': 2})
    assert singola_1based.correctIndex == 1
    singola_neg = QuestionDraft.model_validate({**per_tipo('single'), 'correctIndex': -3})
    assert singola_neg.correctIndex == 0
    rationales_corte = QuestionDraft.model_validate({**per_tipo('single'), 'rationales': ['Solo una']})
    assert rationales_corte.rationales == ['Solo una', '']
    rationales_lunghe = QuestionDraft.model_validate({**per_tipo('single'), 'rationales': ['A', 'B', 'C']})
    assert rationales_lunghe.rationales == ['A', 'B']
    vf_rationales = QuestionDraft.model_validate({**per_tipo('truefalse'), 'rationales': ['Perché sì.']})
    assert vf_rationales.rationales == []
    spazi_extra = QuestionDraft.model_validate(
        {**per_tipo('single'), 'options': [' Prima ', '  ', ' Seconda '], 'rationales': ['r1', 'r2', 'r3']}
    )
    assert spazi_extra.options == ['Prima', 'Seconda']
    assert spazi_extra.rationales == ['r1', 'r2']
    matching_corto = QuestionDraft.model_validate({
        **per_tipo('matching'),
        'pairTerms': ['T1', 'T2', 'T3', 'T4'],
        'options': ['O1', 'O2', 'O3'],
        'rationales': ['r1', 'r2', 'r3', 'r4'],
    })
    assert matching_corto.pairTerms == ['T1', 'T2', 'T3']
    assert matching_corto.options == ['O1', 'O2', 'O3']
    assert matching_corto.rationales == ['r1', 'r2', 'r3']


def test_campo_mancante_o_estraneo_resta_un_errore_del_modulo():
    for guasta in (lambda q: q.pop('situation'), lambda q: q.pop('correct'), lambda q: q.update(colore='rosso')):
        def domande(refs, guasta=guasta):
            domanda = per_tipo('single', refs)
            guasta(domanda)
            return [domanda]
        with pytest.raises(GenerationError) as error:
            generate(extraction(), Fornitore(domande))
        assert error.value.code == 'invalid_generated_content'


def test_i_valori_neutri_non_entrano_nella_domanda_del_contratto():
    for kind in ('single', 'truefalse', 'fillblank', 'oddOneOut', 'multiple'):
        domanda = domanda_del_contratto(QuestionDraft.model_validate(per_tipo(kind)), 'q', 'm', 'l')
        assert not {'situation', 'sentence', 'wrong'} & set(domanda), kind
        assert ('correctOptionIds' in domanda) == (kind == 'multiple'), kind
        assert ('correctOptionId' in domanda) == (kind != 'multiple'), kind


def test_vero_falso_ignora_correct_index_e_le_altre_ignorano_correct():
    # Valori neutri indistinguibili da uno scelto: ignorati (bozze.py). Un vero/falso con correctIndex 1
    # resta «Vero» se correct è true; una singola con correct true resta decisa da correctIndex.
    vero = domanda_del_contratto(QuestionDraft.model_validate({**per_tipo('truefalse'), 'correctIndex': 1}), 'q', 'm', 'l')
    assert [o['text'] for o in vero['options']] == ['Vero', 'Falso'] and vero['correctOptionId'] == 'option-0'
    singola = domanda_del_contratto(QuestionDraft.model_validate({**per_tipo('single'), 'correct': True, 'correctIndex': 1}),
                                    'q', 'm', 'l')
    assert singola['correctOptionId'] == 'option-1'


def test_bozza_di_prova_riempie_solo_i_neutri():
    assert bozza(kind='single')['options'] == [] and bozza(kind='single', options=['A'])['options'] == ['A']
