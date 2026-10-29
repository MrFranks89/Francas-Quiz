"""Bozze per i fornitori: gli schemi inviati come output strutturato (ModuleDraft e le sue parti).

Lo schema che i fornitori ricevono è fissato da tests/istantanee/schema-module-draft-*.json.
"""
from typing import Annotated, Literal
from pydantic import Field, StrictInt, WithJsonSchema, field_validator, model_validator
from .comune import Difficolta, Model


class SlideDraft(Model):
    heading: str = Field(min_length=1)
    body: str = Field(min_length=1)
    highlight: str
    sourceRefs: list[str] = Field(min_length=1)


def _tipo(valore: str):
    """Literal a un solo valore, descritto nello schema come `enum` e non come `const`.

    anthropic.transform_schema (anthropic/lib/_parse/_transform.py, SDK 1.15.0) non conserva `const`:
    lo sposta nella descrizione, e il discriminante resterebbe una stringa libera. `enum` è conservato
    da transform_schema ed è fra le parole chiave ammesse da OpenAI (Structured Outputs, «Supported
    schemas»). Così il tipo è vincolato nello schema di entrambi i fornitori.
    """
    return Annotated[Literal[valore], WithJsonSchema({'type': 'string', 'enum': [valore]})]


# Bozze di domanda: un'unione distinta da `kind`. Si usa un'unione semplice (anyOf nello schema), non
# Field(discriminator=...), che Pydantic descrive con oneOf + discriminator: OpenAI non elenca oneOf fra
# le parole chiave ammesse; transform_schema di Anthropic converte oneOf in anyOf. La scelta resta univoca
# perché ogni variante ha il suo `kind` e rifiuta i campi estranei (extra='forbid').
#
# Nessun campo facoltativo né nullable: OpenAI richiede tutti i campi in `required`, e Anthropic limita a 24
# i parametri facoltativi e a 16 quelli con unione (anyOf o tipi multipli) per richiesta
# (platform.claude.com/docs/en/build-with-claude/structured-outputs, «Explicit limits»). Quindi:
# - `rationales`: un testo per opzione, stringa vuota se non serve (la pipeline la omette);
# - `difficulty`: sempre presente, uno dei livelli di Civis.
# L'unica unione dello schema è l'elemento di `questions`.

class _Scelta(Model):
    """Regole strutturali comuni alle bozze con opzioni scritte dal modello.

    Le regole di qualità di singola domanda (errori_tipo e la regola della multipla) NON stanno qui:
    le applica la pipeline con violazioni_domanda e scarta la domanda invece di rifiutare il modulo.
    Devono restare fuori dai validatori perché lo SDK OpenAI valida con text_format=ModuleDraft dentro
    responses.parse() e AnthropicProvider con ModuleDraft.model_validate_json: una regola di qualità
    qui farebbe fallire il modulo intero prima che la pipeline possa scartare la sola domanda.
    """

    @model_validator(mode='after')
    def correct_answer(self):
        if not 0 <= self.correctIndex < len(self.options):
            raise ValueError('correctIndex fuori intervallo')
        if any(not item.strip() for item in self.options):
            raise ValueError('Opzione vuota')
        if len(self.rationales) != len(self.options):
            raise ValueError('rationales deve avere un elemento per opzione')
        return self


class SingleDraft(_Scelta):
    kind: _tipo('single')
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class TrueFalseDraft(Model):
    """Vero o falso: `prompt` è un'affermazione, `correct` dice se è vera. Le opzioni «Vero» e «Falso» le aggiunge il server."""
    kind: _tipo('truefalse')
    prompt: str = Field(min_length=1)
    correct: bool
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class FillBlankDraft(_Scelta):
    kind: _tipo('fillblank')
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class ScenarioDraft(_Scelta):
    kind: _tipo('scenario')
    situation: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class OddOneOutDraft(_Scelta):
    """Trova l'intruso: `correctIndex` indica l'opzione che non appartiene al gruppo."""
    kind: _tipo('oddOneOut')
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class CorrectStatementDraft(_Scelta):
    """Correggi l'errore: `sentence` contiene `wrong` una sola volta; le opzioni sostituiscono `wrong` e la giusta corregge la frase."""
    kind: _tipo('correctStatement')
    prompt: str = Field(min_length=1)
    sentence: str = Field(min_length=1)
    wrong: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta


class MultipleDraft(Model):
    """Risposta multipla: `correctIndexes` elenca le giuste, almeno 2 e non più di metà delle opzioni."""
    kind: _tipo('multiple')
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=6)
    correctIndexes: list[StrictInt]
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta

    @model_validator(mode='after')
    def correct_answers(self):
        if any(not 0 <= i < len(self.options) for i in self.correctIndexes):
            raise ValueError('correctIndexes fuori intervallo')
        if any(not item.strip() for item in self.options):
            raise ValueError('Opzione vuota')
        if len(self.rationales) != len(self.options):
            raise ValueError('rationales deve avere un elemento per opzione')
        # Le regole di qualità (almeno 2 giuste, non più di metà, opzioni diverse) le applica la pipeline:
        # violazioni_domanda, vedi _Scelta.
        return self


QuestionDraft = (SingleDraft | TrueFalseDraft | FillBlankDraft | ScenarioDraft | OddOneOutDraft | CorrectStatementDraft
                 | MultipleDraft)


class ModuleDraft(Model):
    title: str = Field(min_length=1)
    objectives: list[str] = Field(min_length=1)
    slides: list[SlideDraft] = Field(min_length=1)
    questions: list[QuestionDraft] = Field(min_length=1)

    @field_validator('title')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Titolo vuoto')
        return value
