"""Istantanee di ciò che generation.models espone e di ciò che i fornitori ricevono.

Fissate prima di dividere models.py in moduli: uno spostamento di codice non deve cambiarle.
- Lo schema di ModuleDraft come lo inviano lo SDK OpenAI (type_to_text_format_param, lo stesso usato da
  responses.parse con text_format) e AnthropicProvider (richiesta, che passa per anthropic.transform_schema),
  più lo schema di Pydantic da cui entrambi partono. Il confronto è sul testo JSON, non sui dizionari:
  un campo riordinato cambia ciò che il modello riceve anche se i dizionari restano uguali.
- L'insieme dei nomi pubblici di generation.models, così nessun import esistente si rompe.

Se un'istantanea cambia, il comportamento è cambiato: non si aggiorna per far passare il test.
Per rigenerarle dopo un cambiamento voluto: ISTANTANEE_RIGENERA=1 pytest ... test_istantanee_models.py
"""
import json
import os
import typing
from pathlib import Path

import pydantic
from openai.lib._parsing._responses import type_to_text_format_param

from formazione_api.generation import models
from formazione_api.generation.anthropic_provider import richiesta
from formazione_api.generation.models import ModuleDraft
from test_schema_fornitori import CHUNK, schema_openai

CARTELLA = Path(__file__).parent / 'istantanee'


def in_testo(valore) -> str:
    return json.dumps(valore, ensure_ascii=False, indent=2) + '\n'


def confronta(nome: str, valore):
    file = CARTELLA / nome
    if os.environ.get('ISTANTANEE_RIGENERA') == '1':
        CARTELLA.mkdir(exist_ok=True)
        file.write_text(in_testo(valore), encoding='utf-8', newline='\n')
    assert in_testo(valore) == file.read_text(encoding='utf-8')


def test_schema_pydantic_di_module_draft():
    confronta('schema-module-draft-pydantic.json', ModuleDraft.model_json_schema())


def test_formato_openai_di_module_draft():
    confronta('schema-module-draft-openai.json', type_to_text_format_param(ModuleDraft))


def test_lo_schema_inviato_da_openai_coincide_con_l_istantanea():
    """Lo schema davvero inviato in rete da OpenAIProvider è quello dell'istantanea."""
    assert in_testo(schema_openai()) == in_testo(type_to_text_format_param(ModuleDraft)['schema'])


def test_schema_anthropic_di_module_draft():
    confronta('schema-module-draft-anthropic.json', richiesta('explicit-test-model', CHUNK)['output_config'])


def nomi_pubblici(modulo) -> list[str]:
    """Nomi pubblici del modulo, esclusi quelli importati da typing e pydantic (non sono API del progetto)."""
    return sorted(n for n, v in vars(modulo).items() if not n.startswith('_')
                  and getattr(typing, n, None) is not v and getattr(pydantic, n, None) is not v)


def test_nomi_esportati_da_generation_models():
    confronta('nomi-generation-models.json', nomi_pubblici(models))

