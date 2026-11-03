"""Scelta del fornitore lato server con GENERATION_PROVIDER (openai | anthropic | gemini).

Variabile assente o vuota: OpenAI, identico al comportamento precedente.
Nessun modello è scelto implicitamente: ogni fornitore richiede la propria variabile *_MODEL.
I fornitori «compatibili OpenAI Chat Completions» (oggi solo gemini) vengono da
openai_compat_provider.COMPATIBILI. NVIDIA non è ammesso: vedi docs/GENERAZIONE.md.
"""
import os
from . import anthropic_provider, openai_compat_provider, provider as openai_provider
from .errors import GenerationError

FORNITORI = {'openai': openai_provider, 'anthropic': anthropic_provider, **openai_compat_provider.COMPATIBILI}
CLASSI = {'openai': lambda: openai_provider.OpenAIProvider(), 'anthropic': lambda: anthropic_provider.AnthropicProvider(),
          **{nome: (lambda nome=nome: openai_compat_provider.OpenAICompatProvider(nome))
             for nome in openai_compat_provider.COMPATIBILI}}


def selected_name():
    """Nome normalizzato, 'openai' se la variabile è assente; None se il valore non è ammesso."""
    name = os.getenv('GENERATION_PROVIDER', '').strip().lower() or 'openai'
    return name if name in FORNITORI else None


def config_status():
    name = selected_name()
    if name is None:
        # Il valore non viene restituito: potrebbe contenere per errore un segreto.
        return {'configured': False, 'provider': 'non_valido', 'missing': [], 'invalid': ['GENERATION_PROVIDER']}
    return FORNITORI[name].config_status()


def create_provider():
    name = selected_name()
    if name is None:
        raise GenerationError('not_configured', f"GENERATION_PROVIDER deve essere {' oppure '.join(FORNITORI)}")
    return CLASSI[name]()
