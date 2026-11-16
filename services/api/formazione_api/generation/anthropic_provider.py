"""Fornitore Anthropic: stesso protocollo e stessa semantica d'errore di OpenAIProvider.

Fonti dei valori decisi dal fornitore (lette, non dedotte):
- SDK Python `anthropic` 1.15.0 installato in .venv;
- skill claude-api (python/claude-api/README.md, tool-use.md § Structured Outputs,
  shared/tool-use-concepts.md § Structured Outputs, shared/prompt-caching.md);
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
"""
import os
from .chunks import Chunk
from .causa import errore_fornitore
from .errors import GenerationError
from .instructions import ISTRUZIONI_DIDATTICHE, MAX_OUTPUT_TOKENS, MAX_RETRIES, TIMEOUT_SECONDS, materiale
from .models import ModuleDraft
from .telemetry import chiama_con_tentativi

VARIABILI = ('ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL')


def config_status():
    missing = [name for name in VARIABILI if not os.getenv(name, '').strip()]
    return {'configured': not missing, 'provider': 'anthropic', 'missing': missing}


def _schema():
    # anthropic.transform_schema (anthropic/lib/_parse/_transform.py, esportato in anthropic/__init__.py)
    # è la stessa trasformazione usata da messages.parse(): toglie i vincoli non supportati
    # (minLength, maxItems...) spostandoli nella descrizione. I vincoli tolti sono poi
    # verificati qui da ModuleDraft e di nuovo dalla pipeline.
    from anthropic import transform_schema
    return transform_schema(ModuleDraft)


def richiesta(model: str, chunk: Chunk) -> dict:
    """Argomenti di messages.create per un blocco: unica fonte, letta anche dalla misura del
    sovraccarico (tools/misura_sovraccarico_anthropic.py), che deve contare questa stessa richiesta."""
    # Forma {'type': 'json_schema', 'schema': ...} da anthropic/types/json_output_format_param.py.
    # `thinking` non è impostato: si lascia il comportamento predefinito del modello configurato.
    return dict(
        model=model, max_tokens=MAX_OUTPUT_TOKENS,
        system=ISTRUZIONI_DIDATTICHE,
        messages=[{'role': 'user', 'content': materiale(chunk)}],
        output_config={'format': {'type': 'json_schema', 'schema': _schema()}},
    )


class AnthropicProvider:
    provider_name = 'anthropic'

    def __init__(self, client=None, model=None):
        if client is None:
            if not config_status()['configured']:
                raise GenerationError('not_configured', 'Configurare ANTHROPIC_API_KEY e ANTHROPIC_MODEL nel processo server')
            from anthropic import Anthropic
            # Firma Anthropic(api_key=..., timeout=..., max_retries=...) letta da anthropic/_client.py 1.15.0;
            # timeout in secondi per l'SDK Python (skill claude-api, README § Timeouts).
            client = Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'], timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv('ANTHROPIC_MODEL', '').strip()
        if not self.model:
            raise GenerationError('not_configured', 'Modello Anthropic non configurato')

    def module(self, chunk: Chunk) -> ModuleDraft:
        self.last_usage = None
        # Si usa messages.create con output_config.format, NON messages.parse: parse() valida il JSON
        # dentro la chiamata (post_parser in anthropic/resources/messages/messages.py 1.15.0), quindi
        # una risposta troncata o rifiutata diventerebbe un errore generico prima di poter leggere
        # stop_reason, e i codici provider_refusal / provider_incomplete andrebbero persi.
        try:
            response, ripetuti = chiama_con_tentativi(self.client.messages, 'create', **richiesta(self.model, chunk))
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error
        # Nomi letti da anthropic/types/usage.py 1.15.0. `input_tokens` è solo la parte non in cache:
        # il totale è input_tokens + cache_creation_input_tokens + cache_read_input_tokens
        # (skill claude-api, shared/prompt-caching.md). Per avere la stessa semantica di OpenAI
        # (inputTokens = totale, cachedInputTokens = sua parte letta dalla cache) si somma;
        # se una parte manca il totale è ignoto, non zero.
        usage = getattr(response, 'usage', None)
        uncached = getattr(usage, 'input_tokens', None)
        written = getattr(usage, 'cache_creation_input_tokens', None)
        read = getattr(usage, 'cache_read_input_tokens', None)
        parts = (uncached, written, read)
        self.last_usage = dict(model=getattr(response, 'model', self.model),
                               inputTokens=sum(parts) if all(v is not None for v in parts) else None,
                               outputTokens=getattr(usage, 'output_tokens', None),
                               cachedInputTokens=read,
                               # Tentativi ripetuti dallo SDK (telemetry.chiama_con_tentativi); None = ignoti.
                               retriesTaken=ripetuti)
        # Valori di stop_reason letti da anthropic/types/stop_reason.py 1.15.0:
        # end_turn, max_tokens, stop_sequence, tool_use, pause_turn, refusal, model_context_window_exceeded.
        stop_reason = getattr(response, 'stop_reason', None)
        if stop_reason == 'refusal':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        # Solo end_turn è una risposta conclusa: max_tokens e model_context_window_exceeded sono troncamenti;
        # gli altri non sono attesi senza strumenti né sequenze di arresto. Come status != 'completed' per OpenAI.
        if stop_reason != 'end_turn':
            # Il motivo va nel messaggio: max_tokens (tetto di uscita) e altro hanno rimedi diversi.
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (stop_reason={stop_reason}); nessun corso pubblicato')
        # Blocchi di contenuto: si considera solo type == 'text' (anthropic/types/text_block.py);
        # eventuali blocchi thinking precedono il testo e non sono contenuto del modulo.
        text = ''.join(getattr(block, 'text', '') for block in getattr(response, 'content', None) or []
                       if getattr(block, 'type', None) == 'text')
        if not text.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        # JSON non valido o non conforme: ValidationError, che la pipeline traduce in invalid_generated_content.
        return ModuleDraft.model_validate_json(text)
