"""Scarto delle domande che violano una regola di qualità di singola domanda (docs/GENERAZIONE.md).

Una domanda imperfetta non fa fallire il corso: viene scartata e lo scarto resta visibile nel risultato
(`scarti`), negli avvisi della bozza e nel rapporto della corsa di misura. Gli errori strutturali
(schema, fonte inventata, rifiuto/troncamento/risposta vuota del fornitore) restano fatali.
"""
import json
from pathlib import Path
from types import SimpleNamespace

import httpx2
import openai
import pytest

from formazione_api.generation import GenerationError, generate
from formazione_api.generation.models import Course, ModuleDraft, violazioni_domanda
from formazione_api.generation.provider import OpenAIProvider
from test_anthropic_provider import message, sdk_provider
from test_generation import extraction
from bozze_di_prova import bozza

FIXTURE = Path(__file__).parent / 'fixtures' / 'generated-course-con-scarti.json'
COMUNI = dict(explanation='Spiegazione di prova', difficulty='base')


def cinque_domande(refs):
    """5 bozze: 3 buone, 1 con la giusta troppo lunga (intruso), 1 completa la frase con due spazi."""
    comuni = dict(COMUNI, sourceRefs=refs)
    return [
        bozza(kind='single', prompt='Quale risposta?', options=['Prima', 'Seconda'], correctIndex=0, rationales=['', ''], **comuni),
        bozza(kind='oddOneOut', prompt='Quale elemento non compare nel materiale?',
             options=['Testo', 'Paragrafo', 'Una tabella riassuntiva molto lunga'], correctIndex=2,
             rationales=['', '', ''], **comuni),
        bozza(kind='truefalse', prompt='Il testo ha un secondo paragrafo.', correct=True, **comuni),
        bozza(kind='fillblank', prompt='Il ___ paragrafo segue il ___ di formazione.', options=['secondo', 'terzo'],
             correctIndex=0, rationales=['', ''], **comuni),
        bozza(kind='multiple', prompt='Che cosa contiene il materiale?',
             options=['Testo di formazione', 'Secondo paragrafo', 'Una tabella', 'Un grafico'], correctIndexes=[0, 1],
             rationales=['', '', '', ''], **comuni),
    ]


def modulo(refs, domande):
    """Il JSON grezzo di un fornitore: un dict, come lo restituirebbe la risposta strutturata."""
    return dict(title='Modulo di prova', objectives=['Comprendere la procedura'],
                slides=[dict(heading='Procedura', body='Contenuto di prova', highlight='', sourceRefs=refs)],
                questions=domande)


class Fornitore:
    def __init__(self, domande=cinque_domande):
        self.domande, self.calls = domande, []

    def module(self, chunk):
        self.calls.append(chunk)
        refs = list(dict.fromkeys(p.source_id for p in chunk.pieces))
        return modulo(refs, self.domande(refs))


def test_due_domande_scartate_il_corso_esce_con_le_tre_buone():
    result = generate(extraction(), Fornitore())
    course = result['course']
    assert [q['kind'] for q in course['questions']] == ['single', 'truefalse', 'multiple']
    # Gli ID restano consecutivi dopo lo scarto.
    assert [q['id'] for q in course['questions']] == ['question-1-1', 'question-1-2', 'question-1-3']
    exam = course['modules'][0]['exam']
    assert exam['questionIds'] == ['question-1-1', 'question-1-2', 'question-1-3']
    assert exam['passingScore'] == 2                       # ⌈60%·3⌉, non ⌈60%·5⌉ = 3
    assert course['modules'][0]['lessons'][0]['questionIds'] == exam['questionIds']
    scarti = result['scarti']
    assert [(s['moduleId'], s['chunkId'], s['position'], s['kind'], s['rule']) for s in scarti] == [
        ('module-1', 'chunk-1', 2, 'oddOneOut', 'giusta_troppo_lunga'),
        ('module-1', 'chunk-1', 4, 'fillblank', 'spazio_non_unico'),
    ]
    assert scarti[0]['prompt'] == 'Quale elemento non compare nel materiale?'
    assert '1,5 volte' in scarti[0]['message']
    assert 'esattamente uno spazio' in scarti[1]['message']
    assert all(s['otherRules'] == [] for s in scarti)
    assert '2 domande scartate dai controlli di qualità' in ' '.join(result['warnings'])
    Course.model_validate(course)


def test_senza_scarti_nessun_avviso_e_elenco_vuoto():
    from test_generation import FakeProvider
    result = generate(extraction(), FakeProvider())
    assert result['scarti'] == []
    assert not any('scartat' in w for w in result['warnings'])


def test_una_sola_domanda_scartata_avviso_al_singolare():
    result = generate(extraction(), Fornitore(lambda refs: cinque_domande(refs)[:2]))
    assert len(result['scarti']) == 1
    assert '1 domanda scartata dai controlli di qualità' in ' '.join(result['warnings'])


def test_piu_regole_violate_dalla_stessa_domanda():
    def domande(refs):
        doppia = bozza(kind='oddOneOut', prompt='Intruso?', options=['A', 'A', 'Una risposta lunghissima'], correctIndex=2,
                      rationales=['', '', ''], sourceRefs=refs, **COMUNI)
        return [cinque_domande(refs)[0], doppia]
    scarto, = generate(extraction(), Fornitore(domande))['scarti']
    assert scarto['rule'] == 'opzioni_duplicate'
    assert [r['rule'] for r in scarto['otherRules']] == ['giusta_troppo_lunga']


def test_modulo_con_tutte_le_domande_scartate_fa_fallire_il_blocco():
    provider = Fornitore(lambda refs: [cinque_domande(refs)[1], cinque_domande(refs)[3]])
    with pytest.raises(GenerationError) as error:
        generate(extraction(3), provider, max_chars=40)
    assert error.value.code == 'invalid_generated_content'
    assert '2 domande scartate' in str(error.value)
    assert len(provider.calls) == 1                        # il primo blocco ferma la generazione


def test_fonte_inventata_resta_fatale_anche_su_una_domanda_da_scartare():
    def inventata_su_buona(refs):
        domande = cinque_domande(refs)
        domande[0]['sourceRefs'] = ['inventata']
        return domande
    def inventata_su_scartata(refs):
        domande = cinque_domande(refs)
        domande[1]['sourceRefs'] = ['inventata']
        return domande
    for domande in (inventata_su_buona, inventata_su_scartata):
        with pytest.raises(GenerationError) as error:
            generate(extraction(), Fornitore(domande))
        assert error.value.code == 'invented_source'


# Meno di due opzioni e opzione vuota non sono più qui: sono forma del campo, e la sola domanda si scarta
# con forma_non_valida (bozze.errore_forma, test_forma_piatta.py).
@pytest.mark.parametrize('rompi', [
    lambda q: q.update(prompt=''),                           # testo della domanda vuoto
    lambda q: q.update(colore='rosso'),                    # campo estraneo allo schema
    lambda q: q.pop('explanation'),                        # campo obbligatorio assente
])
def test_errori_strutturali_restano_fatali(rompi):
    def domande(refs):
        domande = cinque_domande(refs)
        rompi(domande[0])
        return domande
    with pytest.raises(GenerationError) as error:
        generate(extraction(), Fornitore(domande))
    assert error.value.code == 'invalid_generated_content'


def test_regola_della_multipla_oltre_meta_giuste_scarta():
    def domande(refs):
        domande = cinque_domande(refs)
        domande[4]['correctIndexes'] = [0, 1, 2]
        return [domande[0], domande[4]]
    scarto, = generate(extraction(), Fornitore(domande))['scarti']
    assert (scarto['kind'], scarto['rule']) == ('multiple', 'multipla_oltre_meta_giuste')


def test_codici_stabili_accanto_ai_messaggi():
    def q(**campi):
        base = dict(kind='single', prompt='Domanda?', options=[dict(id='a', text='A'), dict(id='b', text='B')],
                    correctOptionId='a')
        return {**base, **campi}
    assert violazioni_domanda(q()) == []
    assert [c for c, _ in violazioni_domanda(q(kind='fillblank', prompt='Senza spazio'))] == ['spazio_non_unico']
    assert [c for c, _ in violazioni_domanda(q(kind='correctStatement', sentence='Il gatto e il gatto', wrong='gatto'))] == [
        'parte_sbagliata_non_unica']
    multipla = q(kind='multiple', correctOptionId=None, correctOptionIds=['a', 'b', 'c'],
                 options=[dict(id=i, text=i.upper()) for i in 'abcd'])
    assert [c for c, _ in violazioni_domanda(multipla)] == ['multipla_oltre_meta_giuste']


# --- percorso vero dei fornitori: lo scarto non deve restare inerte dietro la loro validazione -------------

def json_con_scarti(source='page-201'):
    return json.dumps(modulo([source], cinque_domande([source])))


def test_anthropic_consegna_alla_pipeline_le_domande_da_scartare():
    provider, _ = sdk_provider((200, message(json_con_scarti())))
    result = generate(extraction(), provider)
    assert len(result['course']['questions']) == 3 and len(result['scarti']) == 2


def test_openai_consegna_alla_pipeline_le_domande_da_scartare():
    """Lo SDK OpenAI valida con text_format=ModuleDraft dentro parse(): le regole di qualità non devono stare lì."""
    corpo = {'id': 'resp_test', 'object': 'response', 'created_at': 0, 'status': 'completed', 'model': 'resolved-test-model',
             'output': [{'type': 'message', 'id': 'msg_test', 'status': 'completed', 'role': 'assistant',
                         'content': [{'type': 'output_text', 'text': json_con_scarti(), 'annotations': []}]}],
             'parallel_tool_calls': False, 'tool_choice': 'auto', 'tools': [],
             'usage': {'input_tokens': 10, 'output_tokens': 5, 'total_tokens': 15,
                       'input_tokens_details': {'cached_tokens': 0}, 'output_tokens_details': {'reasoning_tokens': 0}}}
    client = openai.OpenAI(api_key='test-key-not-real', base_url='http://openai.invalid/v1', max_retries=0,
                           http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(
                               lambda request: httpx2.Response(200, json=corpo))))
    result = generate(extraction(), OpenAIProvider(client=client, model='explicit-test-model'))
    assert len(result['course']['questions']) == 3 and len(result['scarti']) == 2


def test_le_bozze_non_applicano_le_regole_di_qualita():
    parsed = ModuleDraft.model_validate_json(json_con_scarti())
    assert len(parsed.questions) == 5


# --- contratto TypeScript ---------------------------------------------------------------------------------

def test_fixture_del_corso_con_scarti_rigenerata_dalla_pipeline():
    """Letta anche da packages/contracts/__tests__/backend-compatibility.test.ts con CourseSchema."""
    course = generate(extraction(), Fornitore())['course']
    expected = json.loads(FIXTURE.read_text(encoding='utf-8'))
    course['id'] = expected['id']
    assert course == expected

