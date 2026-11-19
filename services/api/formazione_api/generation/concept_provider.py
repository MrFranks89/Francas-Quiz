import os
from typing import Protocol
from .causa import errore_fornitore
from .chunks import Chunk
from .concept import ConceptMergePlan, ConceptTreeDraft, ISTRUZIONI_CONCEPT_MERGE, ISTRUZIONI_CONCEPT_TREE
from .errors import GenerationError
from .instructions import MAX_OUTPUT_TOKENS, MAX_RETRIES, TIMEOUT_SECONDS, materiale
from .openai_compat_provider import COMPATIBILI
from .provider import config_status as openai_config_status
from .selection import FORNITORI, selected_name
from .telemetry import chiama_con_tentativi


class ConceptProvider(Protocol):
    def concept_tree(self, chunk: Chunk) -> ConceptTreeDraft: ...
    def concept_merge(self, payload: str) -> ConceptMergePlan: ...


class OpenAIConceptProvider:
    provider_name = 'openai'

    def __init__(self, client=None, model=None):
        if client is None:
            if not openai_config_status()['configured']:
                raise GenerationError('not_configured', 'Configurare OPENAI_API_KEY e OPENAI_MODEL nel processo server')
            from openai import OpenAI
            client = OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv('OPENAI_MODEL', '').strip()
        if not self.model:
            raise GenerationError('not_configured', 'Modello OpenAI non configurato')

    def concept_tree(self, chunk: Chunk) -> ConceptTreeDraft:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(
                self.client.responses, 'parse', model=self.model, store=False, max_output_tokens=MAX_OUTPUT_TOKENS, truncation='disabled',
                text_format=ConceptTreeDraft,
                instructions=ISTRUZIONI_CONCEPT_TREE,
                input=materiale(chunk),
            )
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        details = getattr(usage, 'input_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=getattr(usage, 'input_tokens', None),
            outputTokens=getattr(usage, 'output_tokens', None),
            cachedInputTokens=getattr(details, 'cached_tokens', None),
            retriesTaken=ripetuti,
        )
        for output in getattr(response, 'output', []):
            for content in getattr(output, 'content', []):
                if getattr(content, 'type', None) == 'refusal':
                    raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        if response.status != 'completed':
            motivo = getattr(getattr(response, 'incomplete_details', None), 'reason', None) or response.status
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta ({motivo}); nessun albero concettuale generato')
        if response.output_parsed is None:
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptTreeDraft.model_validate(response.output_parsed)

    def concept_merge(self, payload: str) -> ConceptMergePlan:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(
                self.client.responses, 'parse', model=self.model, store=False, max_output_tokens=MAX_OUTPUT_TOKENS, truncation='disabled',
                text_format=ConceptMergePlan,
                instructions=ISTRUZIONI_CONCEPT_MERGE,
                input=payload,
            )
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        details = getattr(usage, 'input_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=getattr(usage, 'input_tokens', None),
            outputTokens=getattr(usage, 'output_tokens', None),
            cachedInputTokens=getattr(details, 'cached_tokens', None),
            retriesTaken=ripetuti,
        )
        for output in getattr(response, 'output', []):
            for content in getattr(output, 'content', []):
                if getattr(content, 'type', None) == 'refusal':
                    raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        if response.status != 'completed':
            motivo = getattr(getattr(response, 'incomplete_details', None), 'reason', None) or response.status
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta ({motivo}); nessuna fusione concettuale generata')
        if response.output_parsed is None:
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptMergePlan.model_validate(response.output_parsed)


def _anthropic_schema():
    from anthropic import transform_schema
    return transform_schema(ConceptTreeDraft)


def _anthropic_merge_schema():
    from anthropic import transform_schema
    return transform_schema(ConceptMergePlan)


def richiesta_anthropic_concept(model: str, chunk: Chunk) -> dict:
    from .anthropic_provider import _thinking
    return dict(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=ISTRUZIONI_CONCEPT_TREE,
        messages=[{'role': 'user', 'content': materiale(chunk)}],
        output_config={'format': {'type': 'json_schema', 'schema': _anthropic_schema()}, 'effort': 'low'},
        **_thinking(),
    )


def richiesta_anthropic_merge(model: str, payload: str) -> dict:
    from .anthropic_provider import _thinking
    return dict(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=ISTRUZIONI_CONCEPT_MERGE,
        messages=[{'role': 'user', 'content': payload}],
        output_config={'format': {'type': 'json_schema', 'schema': _anthropic_merge_schema()}, 'effort': 'low'},
        **_thinking(),
    )


class AnthropicConceptProvider:
    provider_name = 'anthropic'

    def __init__(self, client=None, model=None):
        if client is None:
            from .anthropic_provider import config_status as anthropic_config_status
            if not anthropic_config_status()['configured']:
                raise GenerationError('not_configured', 'Configurare ANTHROPIC_API_KEY e ANTHROPIC_MODEL nel processo server')
            from anthropic import Anthropic
            client = Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'], timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv('ANTHROPIC_MODEL', '').strip()
        if not self.model:
            raise GenerationError('not_configured', 'Modello Anthropic non configurato')

    def concept_tree(self, chunk: Chunk) -> ConceptTreeDraft:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(self.client.messages, 'create', **richiesta_anthropic_concept(self.model, chunk))
        except GenerationError:
            raise
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        uncached = getattr(usage, 'input_tokens', None)
        written = getattr(usage, 'cache_creation_input_tokens', None)
        read = getattr(usage, 'cache_read_input_tokens', None)
        parts = (uncached, written, read)
        dettagli_uscita = getattr(usage, 'output_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=sum(parts) if all(v is not None for v in parts) else None,
            outputTokens=getattr(usage, 'output_tokens', None),
            cachedInputTokens=read,
            thinkingTokens=getattr(dettagli_uscita, 'thinking_tokens', None),
            retriesTaken=ripetuti,
        )
        stop_reason = getattr(response, 'stop_reason', None)
        if stop_reason == 'refusal':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        if stop_reason != 'end_turn':
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (stop_reason={stop_reason}); nessun albero concettuale generato')
        text = ''.join(getattr(block, 'text', '') for block in getattr(response, 'content', None) or []
                       if getattr(block, 'type', None) == 'text')
        if not text.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptTreeDraft.model_validate_json(text)

    def concept_merge(self, payload: str) -> ConceptMergePlan:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(self.client.messages, 'create', **richiesta_anthropic_merge(self.model, payload))
        except GenerationError:
            raise
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        uncached = getattr(usage, 'input_tokens', None)
        written = getattr(usage, 'cache_creation_input_tokens', None)
        read = getattr(usage, 'cache_read_input_tokens', None)
        parts = (uncached, written, read)
        dettagli_uscita = getattr(usage, 'output_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=sum(parts) if all(v is not None for v in parts) else None,
            outputTokens=getattr(usage, 'output_tokens', None),
            cachedInputTokens=read,
            thinkingTokens=getattr(dettagli_uscita, 'thinking_tokens', None),
            retriesTaken=ripetuti,
        )
        stop_reason = getattr(response, 'stop_reason', None)
        if stop_reason == 'refusal':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        if stop_reason != 'end_turn':
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (stop_reason={stop_reason}); nessuna fusione concettuale generata')
        text = ''.join(getattr(block, 'text', '') for block in getattr(response, 'content', None) or []
                       if getattr(block, 'type', None) == 'text')
        if not text.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptMergePlan.model_validate_json(text)


def _compat_response_format():
    from openai.lib._parsing._completions import type_to_response_format_param
    return type_to_response_format_param(ConceptTreeDraft)


def _compat_merge_response_format():
    from openai.lib._parsing._completions import type_to_response_format_param
    return type_to_response_format_param(ConceptMergePlan)


def richiesta_compat_concept(model: str, chunk: Chunk) -> dict:
    return dict(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        messages=[
            {'role': 'system', 'content': ISTRUZIONI_CONCEPT_TREE},
            {'role': 'user', 'content': materiale(chunk)},
        ],
        response_format=_compat_response_format(),
    )


def richiesta_compat_merge(model: str, payload: str) -> dict:
    return dict(
        model=model,
        max_tokens=MAX_OUTPUT_TOKENS,
        messages=[
            {'role': 'system', 'content': ISTRUZIONI_CONCEPT_MERGE},
            {'role': 'user', 'content': payload},
        ],
        response_format=_compat_merge_response_format(),
    )


class OpenAICompatConceptProvider:
    def __init__(self, provider_compatibile: str, client=None, model=None):
        if provider_compatibile not in COMPATIBILI:
            raise GenerationError('not_configured', f'Fornitore compatibile {provider_compatibile} sconosciuto')
        self.descrittore = COMPATIBILI[provider_compatibile]
        self.provider_name = self.descrittore.nome
        if client is None:
            if not self.descrittore.config_status()['configured']:
                raise GenerationError('not_configured',
                                      f'Configurare {self.descrittore.variabile_chiave} e {self.descrittore.variabile_modello}')
            from openai import OpenAI
            client = OpenAI(api_key=os.environ[self.descrittore.variabile_chiave],
                            base_url=self.descrittore.base_url,
                            timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv(self.descrittore.variabile_modello, '').strip()
        if not self.model:
            raise GenerationError('not_configured', f'Modello {self.provider_name} non configurato')

    def concept_tree(self, chunk: Chunk) -> ConceptTreeDraft:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(
                self.client.chat.completions, 'create',
                **richiesta_compat_concept(self.model, chunk),
            )
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        prompt_details = getattr(usage, 'prompt_tokens_details', None)
        completion_details = getattr(usage, 'completion_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=getattr(usage, 'prompt_tokens', None),
            outputTokens=getattr(usage, 'completion_tokens', None),
            cachedInputTokens=getattr(prompt_details, 'cached_tokens', None),
            thinkingTokens=getattr(completion_details, 'reasoning_tokens', None),
            retriesTaken=ripetuti,
        )
        choices = getattr(response, 'choices', None) or []
        if not choices:
            raise GenerationError('provider_empty', 'Risposta AI priva di scelte')
        choice = choices[0]
        finish_reason = getattr(choice, 'finish_reason', None)
        if finish_reason == 'content_filter':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha filtrato il contenuto')
        if finish_reason not in ('stop', None):
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (finish_reason={finish_reason}); nessun albero concettuale generato')
        message = getattr(choice, 'message', None)
        if getattr(message, 'refusal', None):
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        content = getattr(message, 'content', '') or ''
        if not content.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptTreeDraft.model_validate_json(content)

    def concept_merge(self, payload: str) -> ConceptMergePlan:
        self.last_usage = None
        try:
            response, ripetuti = chiama_con_tentativi(
                self.client.chat.completions, 'create',
                **richiesta_compat_merge(self.model, payload),
            )
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error

        usage = getattr(response, 'usage', None)
        prompt_details = getattr(usage, 'prompt_tokens_details', None)
        completion_details = getattr(usage, 'completion_tokens_details', None)
        self.last_usage = dict(
            model=getattr(response, 'model', self.model),
            inputTokens=getattr(usage, 'prompt_tokens', None),
            outputTokens=getattr(usage, 'completion_tokens', None),
            cachedInputTokens=getattr(prompt_details, 'cached_tokens', None),
            thinkingTokens=getattr(completion_details, 'reasoning_tokens', None),
            retriesTaken=ripetuti,
        )
        choices = getattr(response, 'choices', None) or []
        if not choices:
            raise GenerationError('provider_empty', 'Risposta AI priva di scelte')
        choice = choices[0]
        finish_reason = getattr(choice, 'finish_reason', None)
        if finish_reason == 'content_filter':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha filtrato il contenuto')
        if finish_reason not in ('stop', None):
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (finish_reason={finish_reason}); nessuna fusione concettuale generata')
        message = getattr(choice, 'message', None)
        if getattr(message, 'refusal', None):
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        content = getattr(message, 'content', '') or ''
        if not content.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ConceptMergePlan.model_validate_json(content)


def create_concept_provider() -> ConceptProvider:
    name = selected_name()
    if name == 'openai':
        return OpenAIConceptProvider()
    elif name == 'anthropic':
        return AnthropicConceptProvider()
    elif name in COMPATIBILI:
        return OpenAICompatConceptProvider(name)
    else:
        raise GenerationError('not_configured', f"GENERATION_PROVIDER deve essere {' oppure '.join(FORNITORI)}")


def extract_concept_tree(chunk: Chunk, provider=None) -> ConceptTreeDraft:
    """Estrae l'albero concettuale dal blocco di testo fornito."""
    p = provider or create_concept_provider()
    if not hasattr(p, 'concept_tree'):
        raise GenerationError('invalid_provider', 'Il provider fornito non implementa concept_tree')
    return ConceptTreeDraft.model_validate(p.concept_tree(chunk))


def merge_concept_trees(payload: str, provider=None) -> ConceptMergePlan:
    """Fonde rami concettuali parziali tramite il provider configurato."""
    p = provider or create_concept_provider()
    if not hasattr(p, 'concept_merge'):
        raise GenerationError('invalid_provider', 'Il provider fornito non implementa concept_merge')
    return ConceptMergePlan.model_validate(p.concept_merge(payload))
