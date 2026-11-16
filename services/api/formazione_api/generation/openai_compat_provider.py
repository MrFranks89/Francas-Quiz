"""Fornitore generico «compatibile OpenAI Chat Completions»: stesso protocollo e stessa semantica
d'errore di OpenAIProvider e AnthropicProvider, configurato per fornitore con base_url, variabili e
modello (COMPATIBILI).

Oggi configurato solo per Gemini. NVIDIA non c'è: sull'endpoint ospitato l'output vincolato a uno
schema non è documentato (docs/GENERAZIONE.md, «Fornitori gratuiti: ricerca alla fonte»).

Fonti dei valori decisi da altri (lette, non dedotte):
- Gemini, compatibilità OpenAI: https://ai.google.dev/gemini-api/docs/openai (ora
  https://aistudio.google.com/docs/openai), letta il 2026-10-30 e il 2026-11-03: solo Chat
  Completions, base_url sotto, ruolo `system`, output strutturato con `beta.chat.completions.parse`;
- SDK Python `openai` 3.31.0 installato in .venv: forma della richiesta e della risposta (vedi i
  commenti accanto a ogni condizione).
"""
import os
from dataclasses import dataclass

from .chunks import Chunk
from .causa import errore_fornitore
from .errors import GenerationError
from .instructions import ISTRUZIONI_DIDATTICHE, MAX_OUTPUT_TOKENS, MAX_RETRIES, TIMEOUT_SECONDS, materiale
from .models import ModuleDraft
from .telemetry import chiama_con_tentativi


@dataclass(frozen=True)
class Compatibile:
    nome: str
    base_url: str

    @property
    def variabile_chiave(self) -> str:
        return f'{self.nome.upper()}_API_KEY'

    @property
    def variabile_modello(self) -> str:
        return f'{self.nome.upper()}_MODEL'

    def config_status(self) -> dict:
        missing = [n for n in (self.variabile_chiave, self.variabile_modello) if not os.getenv(n, '').strip()]
        return {'configured': not missing, 'provider': self.nome, 'missing': missing}


COMPATIBILI = {
    # base_url dell'esempio Python della pagina di compatibilità OpenAI di Gemini.
    'gemini': Compatibile('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/'),
}


def formato_risposta() -> dict:
    """response_format inviato: lo costruisce la stessa funzione che usa chat.completions.parse()
    (type_to_response_format_param, openai/lib/_parsing/_completions.py 3.31.0), cioè lo schema
    di ModuleDraft reso «strict» come per OpenAI Responses."""
    from openai.lib._parsing._completions import type_to_response_format_param
    return type_to_response_format_param(ModuleDraft)


def richiesta(model: str, chunk: Chunk) -> dict:
    """Argomenti di chat.completions.create per un blocco: stesse istruzioni e stesso materiale degli
    altri fornitori. `max_tokens` (non `max_completion_tokens`): la pagina di Gemini non nomina né
    l'uno né l'altro; `max_tokens` è il parametro storico di Chat Completions. Non verificato senza
    una chiamata reale se Gemini lo applica anche ai token di ragionamento."""
    return dict(
        model=model, max_tokens=MAX_OUTPUT_TOKENS,
        messages=[{'role': 'system', 'content': ISTRUZIONI_DIDATTICHE},
                  {'role': 'user', 'content': materiale(chunk)}],
        response_format=formato_risposta(),
    )


class OpenAICompatProvider:
    def __init__(self, nome: str, client=None, model=None):
        if nome not in COMPATIBILI:
            raise GenerationError('not_configured', 'Fornitore compatibile non previsto')
        voce = COMPATIBILI[nome]
        self.provider_name = nome
        if client is None:
            if not voce.config_status()['configured']:
                raise GenerationError('not_configured', f'Configurare {voce.variabile_chiave} e '
                                                        f'{voce.variabile_modello} nel processo server')
            from openai import OpenAI
            client = OpenAI(api_key=os.environ[voce.variabile_chiave], base_url=voce.base_url,
                            timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)
        self.client = client
        self.last_usage = None
        self.model = model or os.getenv(voce.variabile_modello, '').strip()
        if not self.model:
            raise GenerationError('not_configured', f'Modello {nome} non configurato')

    def module(self, chunk: Chunk) -> ModuleDraft:
        self.last_usage = None
        # Si usa create con response_format, NON parse: parse() solleva LengthFinishReasonError e
        # ContentFilterFinishReasonError dentro la chiamata (openai/lib/_parsing/_completions.py 3.31.0),
        # quindi troncamento e filtro diventerebbero un generico provider_error.
        try:
            response, ripetuti = chiama_con_tentativi(self.client.chat.completions, 'create',
                                                      **richiesta(self.model, chunk))
        except Exception as error:
            raise errore_fornitore(self.provider_name, error) from error
        # Nomi letti da openai/types/completion_usage.py 3.31.0: prompt_tokens è il totale dell'ingresso,
        # prompt_tokens_details.cached_tokens la sua parte in cache, completion_tokens l'uscita (stessa
        # semantica di inputTokens/cachedInputTokens degli altri fornitori). Se il fornitore conti
        # nell'uscita anche i token di ragionamento non è dichiarato da Gemini. Contatore assente → None.
        usage = getattr(response, 'usage', None)
        details = getattr(usage, 'prompt_tokens_details', None)
        self.last_usage = dict(model=getattr(response, 'model', None) or self.model,
                               inputTokens=getattr(usage, 'prompt_tokens', None),
                               outputTokens=getattr(usage, 'completion_tokens', None),
                               cachedInputTokens=getattr(details, 'cached_tokens', None),
                               # Tentativi ripetuti dallo SDK (telemetry.chiama_con_tentativi); None = ignoti.
                               retriesTaken=ripetuti)
        choices = getattr(response, 'choices', None) or []
        if not choices:
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        choice = choices[0]
        message = getattr(choice, 'message', None)
        # finish_reason: stop | length | tool_calls | content_filter | function_call
        # (openai/types/chat/chat_completion.py 3.31.0); message.refusal (chat_completion_message.py).
        finish_reason = getattr(choice, 'finish_reason', None)
        if getattr(message, 'refusal', None) or finish_reason == 'content_filter':
            raise GenerationError('provider_refusal', 'Il fornitore AI ha rifiutato il contenuto')
        # Solo stop è una risposta conclusa: length è un troncamento, gli altri non sono attesi senza strumenti.
        if finish_reason != 'stop':
            raise GenerationError('provider_incomplete',
                                  f'Risposta AI incompleta (finish_reason={finish_reason}); nessun corso pubblicato')
        text = getattr(message, 'content', None) or ''
        if not text.strip():
            raise GenerationError('provider_empty', 'Risposta AI priva di contenuti strutturati')
        # JSON non valido o non conforme: ValidationError, che la pipeline traduce in invalid_generated_content.
        return ModuleDraft.model_validate_json(text)
