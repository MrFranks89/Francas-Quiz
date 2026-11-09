"""Dimensione e complessità dello schema inviato a ciascun fornitore: non può tornare a crescere in silenzio.

Il 9 novembre 2026 la prima chiamata vera ad Anthropic (claude-haiku-5-5) è stata rifiutata con 400 «The
compiled grammar is too large»: lo schema era un anyOf di sette varianti di domanda, 7,7 KB compatti, e
rispettava tutti i limiti pubblicati. Il limite superato non è pubblicato. Questo test misura lo schema
davvero inviato (catturato dallo SDK vero per OpenAI, dalla richiesta di AnthropicProvider e di
OpenAICompatProvider per Anthropic e Gemini) e lo confronta con soglie di due tipi.

Soglie dai limiti pubblicati (lette il 2026-11-09):
- Anthropic, platform.claude.com/docs/en/build-with-claude/structured-outputs, «Explicit limits»: 24
  parametri facoltativi, 16 parametri con unione (anyOf o tipi multipli), 20 strumenti strict. Più
  «additional internal limits on the compiled grammar size» senza valore numerico, e un timeout di
  compilazione di 180 secondi.
- OpenAI, developers.openai.com/api/docs/guides/structured-outputs, «Supported schemas»: 5000 proprietà,
  10 livelli di annidamento, 1000 valori enum, 120.000 caratteri fra nomi di proprietà, definizioni,
  enum e const.
- Gemini, aistudio.google.com/docs/structured-output: limiti su «total states, branching paths, and
  nesting depth» senza valori; «`anyOf` branches multiply the branching paths».

Soglie misurate (nessun valore pubblicato per la grammatica): il valore di oggi della forma piatta
(generation/bozze.py) più un margine dichiarato accanto a ciascuna. Sono più strette dei limiti pubblicati
perché lo schema che li rispettava tutti è stato rifiutato: unioni e facoltativi restano a zero, la
grandezza può crescere di poco. Se una soglia va alzata, lo si fa qui, a mano, con il motivo e una prova
reale (tools/prova_schema_anthropic.py non basta: count_tokens non compila la grammatica).
"""
import json
from pathlib import Path

import pytest

from formazione_api.generation.openai_compat_provider import formato_risposta
from test_schema_fornitori import nodi, profondita, schema_anthropic, schema_openai


def schema_gemini():
    """Lo schema dentro response_format di OpenAICompatProvider (Gemini, compatibilità OpenAI)."""
    return formato_risposta()['json_schema']['schema']


RIFIUTATO = Path(__file__).parent / 'fixtures' / 'schema-anthropic-rifiutato-2026-11-09.json'
FORNITORI = [schema_anthropic, schema_openai, schema_gemini]
NOMI = ['anthropic', 'openai', 'gemini']

# Misure del 2026-11-09, forma piatta: byte UTF-8 dello schema compatto (separators=(',', ':')):
# anthropic 2.991, openai 2.902, gemini 2.902. Prima, con l'anyOf di sette varianti: 7.730, 7.288, 7.288.
# Margine: +20% sui byte (~600), che lascia spazio a descrizioni e a un campo nuovo ma non a un ritorno
# alle varianti (oltre 7 KB).
BYTE_MASSIMI = 3600
# Oggetti: ModuleDraft, SlideDraft, QuestionDraft. Margine zero: un oggetto in più è un annidamento in più,
# che Anthropic nomina fra le cause della crescita della grammatica.
OGGETTI_MASSIMI = 3
# Proprietà, sommate su tutti gli oggetti: 4 + 4 + 13 = 21 oggi. Margine +4 (un tipo di domanda nuovo con
# un campo suo ci sta; uno con quattro campi nuovi va discusso). Limite OpenAI: 5000.
PROPRIETA_MASSIME = 25
# Valori enum, sommati: 7 tipi + 3 livelli = 10 oggi. Margine +2. Limite OpenAI: 1000.
ENUM_MASSIMI = 12
# Livelli di oggetti annidati: 2 oggi (ModuleDraft → domanda o slide). Margine zero. Limite OpenAI: 10.
PROFONDITA_MASSIMA = 2


def compatto(schema) -> bytes:
    return json.dumps(schema, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


@pytest.mark.parametrize('costruisci', FORNITORI, ids=NOMI)
def test_nessuna_unione_ne_composizione(costruisci):
    # Limite pubblicato da Anthropic: 16 parametri con unione. Qui zero: lo schema con UNA unione di sette
    # varianti è stato rifiutato.
    schema = costruisci()
    for _, nodo in nodi(schema):
        assert not {'anyOf', 'oneOf', 'allOf', 'not', 'if', 'discriminator'} & set(nodo)
        assert not isinstance(nodo.get('type'), list), nodo


@pytest.mark.parametrize('costruisci', FORNITORI, ids=NOMI)
def test_nessun_campo_facoltativo(costruisci):
    # Limite pubblicato da Anthropic: 24 facoltativi («each optional parameter roughly doubles a portion of
    # the grammar's state space»). OpenAI strict li vuole tutti obbligatori. Qui zero.
    oggetti = [n for _, n in nodi(costruisci()) if n.get('type') == 'object']
    for oggetto in oggetti:
        assert sorted(oggetto.get('required', [])) == sorted(oggetto['properties'])


@pytest.mark.parametrize('costruisci', FORNITORI, ids=NOMI)
def test_dimensione_entro_le_soglie(costruisci):
    schema = costruisci()
    oggetti = [n for _, n in nodi(schema) if n.get('type') == 'object']
    misure = dict(byte=len(compatto(schema)), oggetti=len(oggetti),
                  proprieta=sum(len(o['properties']) for o in oggetti),
                  enum=sum(len(n['enum']) for _, n in nodi(schema) if isinstance(n.get('enum'), list)),
                  profondita=profondita(schema, schema))
    soglie = dict(byte=BYTE_MASSIMI, oggetti=OGGETTI_MASSIMI, proprieta=PROPRIETA_MASSIME, enum=ENUM_MASSIMI,
                  profondita=PROFONDITA_MASSIMA)
    superate = {k: (misure[k], soglie[k]) for k in soglie if misure[k] > soglie[k]}
    assert not superate, f'Schema oltre le soglie (misura, soglia): {superate}'


def test_le_soglie_scattano_sullo_schema_rifiutato():
    """Le soglie non sono inerti: lo schema che Anthropic ha rifiutato il 9 novembre 2026 (istantanea al tag
    git prima-schema-semplice, copiata in fixtures/) le supera tutte e due."""
    rifiutato = json.loads(RIFIUTATO.read_text(encoding='utf-8'))['format']['schema']
    with pytest.raises(AssertionError):
        test_nessuna_unione_ne_composizione(lambda: rifiutato)
    with pytest.raises(AssertionError, match='byte'):
        test_dimensione_entro_le_soglie(lambda: rifiutato)
