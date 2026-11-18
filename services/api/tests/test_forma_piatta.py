"""Forma piatta delle bozze di domanda (generation/bozze.py): i vincoli tolti dalla grammatica restano nel codice.

Con un solo oggetto domanda per tutti i tipi, la grammatica inviata ai fornitori non dice più quali campi
sono pieni per quale tipo, né quante opzioni servono. Qui si controlla che ogni vincolo spostato sia
ancora verificato, sul percorso vero della pipeline (generate), e con quale esito:
- forma del campo (bozze.errore_forma) → scarto della sola domanda con forma_non_valida, mai una riparazione;
- vincolo dello schema inviato (min_length, max_length) → errore del modulo (invalid_generated_content);
- coerenza col tipo → scarto della domanda, con i codici già esistenti in regole.py.
"""
import pytest

from formazione_api.generation import GenerationError, generate
from formazione_api.generation import bozze
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


# Forma del campo (bozze.errore_forma): la domanda si scarta da sola con forma_non_valida, il modulo resta.
# Fino al 18/11/2026 alcuni di questi casi erano «riparati» in silenzio, e la riparazione poteva cambiare
# quale risposta è giusta: opzione vuota tolta (gli indici scorrono), correctIndex portato dentro
# l'intervallo, matching troncato alla lista più corta, rationales completate o troncate.
@pytest.mark.parametrize('kind,guasta,nel_messaggio', [
    ('single', dict(options=['Sola'], rationales=['']), 'almeno 2 opzioni'),
    ('fillblank', dict(options=[], rationales=[]), 'almeno 2 opzioni'),
    ('multiple', dict(options=['A', 'B', 'C'], rationales=['', '', '']), 'almeno 4 opzioni'),
    ('multiple', dict(correctIndexes=[0, 4]), 'correctIndexes'),
    ('single', dict(options=['Prima', ' ']), 'opzione vuota'),
    # Opzione vuota prima della giusta: togliendola, correctIndex 1 indicherebbe «Seconda».
    ('single', dict(options=['   ', 'Prima', 'Seconda'], correctIndex=1, rationales=['', '', '']), 'opzione vuota'),
    # correctIndex fuori dalle opzioni: nessuna opzione è la giusta, non la si sceglie al posto del modello.
    ('single', dict(correctIndex=7), 'correctIndex 7'),
    ('single', dict(correctIndex=-1), 'correctIndex -1'),
    ('single', dict(correctIndex=2), 'correctIndex 2'),
    # Matching con colonne di lunghezza diversa: non si sa quali coppie per indice restano giuste.
    ('matching', dict(pairTerms=['T1', 'T2', 'T3', 'T4']), 'pairTerms'),
    ('matching', dict(pairTerms=['T1', 'T2', 'T3'], options=['O1', 'O2', 'O3', 'O4'], rationales=['', '', '', '']),
     'pairTerms'),
    # rationales non allineate alle opzioni: quale motivazione va con quale opzione non è noto.
    ('single', dict(rationales=['Solo una']), 'rationales'),
    ('single', dict(rationales=['A', 'B', 'C']), 'rationales'),
])
def test_forma_del_campo_scarta_la_sola_domanda(kind, guasta, nel_messaggio):
    def domande(refs):
        return [per_tipo('single', refs), {**per_tipo(kind, refs), **guasta}]
    result = generate(extraction(), Fornitore(domande))
    (buona,) = result['course']['questions']
    assert buona['prompt'] == 'Quale risposta?' and buona['correctOptionId'] == 'option-0'
    (scarto,) = result['scarti']
    assert {k: scarto[k] for k in ('moduleId', 'chunkId', 'position', 'kind', 'rule', 'otherRules')} == dict(
        moduleId='module-1', chunkId='chunk-1', position=2, kind=kind, rule='forma_non_valida', otherRules=[])
    assert scarto['prompt'] == per_tipo(kind)['prompt']
    assert nel_messaggio in scarto['message']
    assert '1 domanda scartata dai controlli di qualità' in result['warnings']


def test_tutte_le_domande_malformate_il_modulo_fallisce_senza_ritentare():
    # Lo scarto non è un errore di validazione della bozza: nessun secondo tentativo (una chiamata in più).
    fornitore = Fornitore(lambda refs: [{**per_tipo('single', refs), 'correctIndex': 7},
                                        {**per_tipo('single', refs), 'rationales': ['Solo una']}])
    with pytest.raises(GenerationError) as error:
        generate(extraction(), fornitore)
    assert error.value.code == 'invalid_generated_content'
    assert 'forma_non_valida, forma_non_valida' in str(error.value)
    assert len(fornitore.calls) == 1


def test_una_domanda_malformata_non_fa_ritentare_il_blocco():
    fornitore = Fornitore(lambda refs: [per_tipo('single', refs), {**per_tipo('single', refs), 'correctIndex': 7}])
    generate(extraction(), fornitore)
    assert len(fornitore.calls) == 1


# Vincoli dei campi dentro lo schema inviato (min_length, max_length): li valida Pydantic con la stessa
# classe dello schema, anche dentro lo SDK del fornitore, quindi restano un errore del modulo.
@pytest.mark.parametrize('kind,guasta', [
    ('single', dict(options=list('ABCDEFG'), rationales=[''] * 7)),                   # più di 6
    ('single', dict(prompt='')),                                                      # testo della domanda vuoto
    ('single', dict(sourceRefs=[])),                                                  # nessuna fonte
])
def test_vincolo_dello_schema_resta_un_errore_del_modulo(kind, guasta):
    def domande(refs):
        return [per_tipo('single', refs), {**per_tipo(kind, refs), **guasta}]
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Fornitore(domande))
    assert error.value.code == 'invalid_generated_content'


def test_normalizzazioni_che_non_toccano_indici_ne_abbinamenti():
    # Spazi attorno a un'opzione non vuota: tolti, la posizione (e quindi la giusta) resta la stessa.
    spazi = QuestionDraft.model_validate({**per_tipo('single'), 'options': [' Prima ', ' Seconda ']})
    assert spazi.options == ['Prima', 'Seconda'] and spazi.correctIndex == 0 and bozze.errore_forma(spazi) is None
    # Vero/falso senza opzioni: le opzioni le aggiunge il server, motivazioni del modello ignorate.
    vf = QuestionDraft.model_validate({**per_tipo('truefalse'), 'rationales': ['Perché sì.']})
    assert vf.rationales == [] and bozze.errore_forma(vf) is None
    # Nessuna riparazione: i valori del modello restano com'erano, l'errore li descrive.
    fuori = QuestionDraft.model_validate({**per_tipo('single'), 'correctIndex': 2})
    assert fuori.correctIndex == 2 and 'correctIndex 2' in bozze.errore_forma(fuori)
    vuota = QuestionDraft.model_validate({**per_tipo('single'), 'options': ['  ', 'Prima', 'Seconda'],
                                          'rationales': ['', '', ''], 'correctIndex': 1})
    assert len(vuota.options) == 3 and vuota.options[1:] == ['Prima', 'Seconda'] and vuota.correctIndex == 1
    corte = QuestionDraft.model_validate({**per_tipo('single'), 'rationales': ['Solo una']})
    assert corte.rationales == ['Solo una']
    matching = QuestionDraft.model_validate({**per_tipo('matching'), 'pairTerms': ['T1', 'T2', 'T3', 'T4']})
    assert matching.pairTerms == ['T1', 'T2', 'T3', 'T4'] and len(matching.options) == 3


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
