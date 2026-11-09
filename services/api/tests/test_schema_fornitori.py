"""Lo schema dell'output (ModuleDraft, una forma piatta per tutti i tipi di domanda) resta accettabile da entrambi i fornitori.

Le richieste sono catturate dagli SDK veri con un trasporto finto: nessuna chiave reale, nessuna rete.
Restrizioni lette alla fonte:
- OpenAI, Structured Outputs «Supported schemas» (developers.openai.com/api/docs/guides/structured-outputs):
  radice oggetto senza anyOf; tutti i campi in required; additionalProperties false; anyOf ammesso solo
  annidato; allOf, not, if/then/else non ammessi; oneOf e discriminator non elencati; al massimo 10 livelli
  di annidamento e 5000 proprietà.
- Anthropic, «JSON Schema limitations» e «Explicit limits» (platform.claude.com/docs/en/build-with-claude/
  structured-outputs): al massimo 24 parametri facoltativi e 16 parametri con unione (anyOf o tipi
  multipli) per richiesta; minItems solo 0 o 1; niente minLength/maxLength. I vincoli non ammessi li
  toglie anthropic.transform_schema (SDK 1.15.0), che però sposta anche `const` nella descrizione.
"""
import json
from types import SimpleNamespace

import httpx2
import openai
import pytest

from formazione_api.generation import GenerationError
from formazione_api.generation.anthropic_provider import richiesta
from formazione_api.generation.models import ModuleDraft, TipoDomanda
from formazione_api.generation.provider import OpenAIProvider

CHUNK = SimpleNamespace(id='chunk-1', pieces=[SimpleNamespace(source_id='page-1', start=0, end=5, text='Testo')])
TIPI = list(TipoDomanda.__args__)


def schema_openai():
    """Lo schema che OpenAIProvider fa inviare dallo SDK OpenAI 3.31.0 (responses.parse con text_format)."""
    inviate = []

    def handler(request):
        inviate.append(json.loads(request.content))
        return httpx2.Response(400, json={'error': {'message': 'finto', 'type': 'invalid_request_error'}})
    client = openai.OpenAI(api_key='test-key-not-real', base_url='http://openai.invalid/v1', max_retries=0,
                           http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))
    with pytest.raises(GenerationError):
        OpenAIProvider(client=client, model='explicit-test-model').module(CHUNK)
    formato = inviate[0]['text']['format']
    assert formato['type'] == 'json_schema' and formato['strict'] is True
    return formato['schema']


def schema_anthropic():
    return richiesta('explicit-test-model', CHUNK)['output_config']['format']['schema']


def nodi(schema):
    """Ogni sotto-schema, con la sua chiave nel genitore."""
    pila = [(None, schema)]
    while pila:
        chiave, nodo = pila.pop()
        if isinstance(nodo, dict):
            yield chiave, nodo
            pila.extend(nodo.items())
        elif isinstance(nodo, list):
            pila.extend((chiave, v) for v in nodo)


def risolvi(schema, nodo):
    while '$ref' in nodo:
        nodo = schema['$defs'][nodo['$ref'].split('/')[-1]]
    return nodo


def profondita(schema, nodo, livello=0):
    """Livelli di oggetti annidati, seguendo i $ref."""
    nodo = risolvi(schema, nodo)
    figli = [*nodo.get('properties', {}).values(), *nodo.get('anyOf', [])]
    if 'items' in nodo:
        figli.append(nodo['items'])
    sotto = [profondita(schema, f, livello + (nodo.get('type') == 'object')) for f in figli]
    return max(sotto, default=livello + (nodo.get('type') == 'object'))


@pytest.mark.parametrize('costruisci', [schema_openai, schema_anthropic], ids=['openai', 'anthropic'])
def test_schema_entro_le_restrizioni_comuni(costruisci):
    schema = costruisci()
    assert schema['type'] == 'object' and 'anyOf' not in schema
    parole = {k for _, n in nodi(schema) for k in n}
    assert not parole & {'oneOf', 'discriminator', 'const', 'allOf', 'not', 'if', 'then', 'else'}
    oggetti = [n for _, n in nodi(schema) if n.get('type') == 'object']
    for oggetto in oggetti:
        assert oggetto['additionalProperties'] is False
        # Nessun facoltativo: OpenAI li vuole tutti in required, Anthropic ne ammette al massimo 24.
        assert sorted(oggetto['required']) == sorted(oggetto['properties'])
    unioni = [n for _, n in nodi(schema) if 'anyOf' in n or isinstance(n.get('type'), list)]
    assert len(unioni) <= 16
    assert profondita(schema, schema) <= 10


@pytest.mark.parametrize('costruisci', [schema_openai, schema_anthropic], ids=['openai', 'anthropic'])
def test_una_sola_forma_di_domanda_con_kind_vincolato_da_enum(costruisci):
    """Forma piatta (generation/bozze.py): un oggetto domanda, nessuna unione, kind fra i sette tipi."""
    schema = costruisci()
    domanda = risolvi(schema, schema['properties']['questions']['items'])
    assert 'anyOf' not in domanda
    assert domanda['properties']['kind']['enum'] == TIPI
    assert not [n for _, n in nodi(schema) if 'anyOf' in n or isinstance(n.get('type'), list)]


def test_anthropic_minitems_solo_zero_o_uno_e_niente_vincoli_di_lunghezza():
    schema = schema_anthropic()
    for _, nodo in nodi(schema):
        assert nodo.get('minItems', 0) in (0, 1)
        assert not {'minLength', 'maxLength', 'maxItems'} & set(nodo)


def test_lo_schema_inviato_rivalida_ogni_tipo():
    """Il JSON conforme di ogni tipo torna a ModuleDraft: lo schema non è più largo del modello."""
    from test_generation import domande_di_prova
    draft = dict(title='Modulo', objectives=['Obiettivo'],
                 slides=[dict(heading='T', body='B', highlight='', sourceRefs=['page-1'])],
                 questions=domande_di_prova(['page-1']))
    parsed = ModuleDraft.model_validate_json(json.dumps(draft))
    assert [q.kind for q in parsed.questions] == TIPI
