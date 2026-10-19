import os
from typing import Protocol
from .chunks import Chunk
from .errors import GenerationError
from .instructions import ISTRUZIONI_DIDATTICHE, MAX_OUTPUT_TOKENS, MAX_RETRIES, TIMEOUT_SECONDS, materiale
from .models import ModuleDraft


class Provider(Protocol):
    def module(self, chunk: Chunk) -> ModuleDraft: ...


def config_status():
    missing = [name for name in ('OPENAI_API_KEY', 'OPENAI_MODEL') if not os.getenv(name, '').strip()]
    return {'configured': not missing, 'provider': 'openai', 'missing': missing}


class OpenAIProvider:
    provider_name = 'openai'

    def __init__(self, client=None, model=None):
        if client is None:
            if not config_status()['configured']:
                raise GenerationError('not_configured', 'Configurare OPENAI_API_KEY e OPENAI_MODEL nel processo server')
            from openai import OpenAI
            client = OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv('OPENAI_MODEL', '').strip()
        if not self.model:
            raise GenerationError('not_configured', 'Modello OpenAI non configurato')

    def module(self, chunk: Chunk) -> ModuleDraft:
        self.last_usage = None
        # Official Responses structured outputs guide; signature checked against openai 3.31.0.
        # https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
        try:
            response = self.client.responses.parse(
                model=self.model, store=False, max_output_tokens=MAX_OUTPUT_TOKENS, truncation='disabled',
                text_format=ModuleDraft,
                instructions=ISTRUZIONI_DIDATTICHE,
                input=materiale(chunk),
            )
        except Exception as error:
            raise GenerationError('provider_error', 'Il fornitore AI non ha completato la richiesta') from error
        # Names read from installed SDK 3.31.0 ResponseUsage/InputTokensDetails:
        # openai/types/responses/response_usage.py. Missing usage is not zero.
        usage = getattr(response, 'usage', None)
        details = getattr(usage, 'input_tokens_details', None)
        self.last_usage = dict(model=getattr(response, 'model', self.model),
                               inputTokens=getattr(usage, 'input_tokens', None),
                               outputTokens=getattr(usage, 'output_tokens', None),
                               cachedInputTokens=getattr(details, 'cached_tokens', None))
        for output in response.output:
            for content in getattr(output, 'content', []):
                if getattr(content, 'type', None) == 'refusal':
                    raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        if response.status != 'completed':
            raise GenerationError('provider_incomplete', 'Risposta AI incompleta; nessun corso pubblicato')
        if response.output_parsed is None:
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        return ModuleDraft.model_validate(response.output_parsed)
