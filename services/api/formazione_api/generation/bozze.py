"""Bozze per i fornitori: gli schemi inviati come output strutturato (ModuleDraft e le sue parti).

Lo schema che i fornitori ricevono è fissato da tests/istantanee/schema-module-draft-*.json; dimensione e
complessità sono sorvegliate da tests/test_dimensione_schema.py.
"""
from pydantic import Field, StrictInt, field_validator, model_validator
from .comune import Difficolta, Model, TipoDomanda


class SlideDraft(Model):
    heading: str = Field(min_length=1)
    body: str = Field(min_length=1)
    highlight: str
    sourceRefs: list[str] = Field(min_length=1)


# Una sola forma di domanda, piatta, per tutti e sette i tipi: `kind` è un enum e ogni campo di ogni tipo
# è presente e obbligatorio, con un valore neutro quando il tipo non lo usa (stringa vuota, lista vuota,
# correctIndex 0, correct false), come già `rationales`.
#
# Perché non più un'unione di sette varianti (anyOf): il 9 novembre 2026 la prima chiamata vera ad
# Anthropic (claude-haiku-5-5) è stata rifiutata con 400 «The compiled grammar is too large». Fonte,
# platform.claude.com/docs/en/build-with-claude/structured-outputs, «Schema complexity limits» (letta il
# 2026-11-09): oltre ai limiti espliciti (24 parametri facoltativi, 16 con unione) ci sono «additional
# internal limits on the compiled grammar size» non pubblicati, perché «optional parameters, union types,
# nested objects, and number of tools interact»; i parametri con unione «create exponential compilation
# cost», e il consiglio è «Flatten structures where possible». Gemini dice lo stesso («`anyOf` branches
# multiply the branching paths», aistudio.google.com/docs/structured-output). Una forma piatta senza
# anyOf, senza facoltativi e senza annidamenti oltre l'elenco è la grammatica più piccola che descrive
# ancora tutti i campi.
#
# Il prezzo: la grammatica non vincola più quali campi sono pieni per quale tipo. Lo controlla il nostro
# codice dopo la risposta, in due livelli che seguono la classificazione già esistente:
# - forma del campo (opzioni 2–6, 4–6 per multiple; indice della giusta dentro le opzioni; opzione vuota;
#   `rationales` lunga quanto le opzioni): validatore qui sotto, ValidationError → invalid_generated_content
#   del modulo, come prima con le varianti;
# - coerenza col tipo (campo pieno che il tipo non usa, campo del tipo lasciato vuoto): la pipeline porta
#   il campo pieno nella domanda del contratto (domanda_del_contratto) e violazioni_domanda la scarta con
#   i codici di regole.py: campo_di_altro_tipo, giuste_multiple_fuori_tipo, vero_falso_opzioni,
#   situazione_mancante, frase_mancante, parte_sbagliata_mancante.
# Restano non verificabili, perché il valore neutro non si distingue da uno scelto: correctIndex in
# truefalse e multiple, correct fuori da truefalse. Sono ignorati.
#
# Le regole di qualità di singola domanda (errori_tipo e la regola della multipla) NON stanno qui: lo SDK
# OpenAI valida con text_format=ModuleDraft dentro responses.parse() e AnthropicProvider con
# ModuleDraft.model_validate_json, quindi una regola qui farebbe fallire il modulo intero prima che la
# pipeline possa scartare la sola domanda.
#
# Niente docstring sulle classi: Pydantic la manda come `description` dello schema. Le descrizioni dei campi
# invece sono volute: portano al modello ciò che prima dicevano le docstring delle varianti.

# Tipi la cui giusta è una sola opzione scritta dal modello, indicata da correctIndex.
TIPI_CON_GIUSTA_SINGOLA = ('single', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement')
# Numero minimo di opzioni per tipo: era minItems delle varianti (2, 4 per multiple), ora controllato qui.
MINIMO_OPZIONI = {**{tipo: 2 for tipo in TIPI_CON_GIUSTA_SINGOLA}, 'multiple': 4}
MASSIMO_OPZIONI = 6


class QuestionDraft(Model):
    kind: TipoDomanda
    prompt: str = Field(min_length=1)
    situation: str = Field(description='Solo scenario: la situazione concreta. Stringa vuota negli altri tipi.')
    sentence: str = Field(description='Solo correctStatement: la frase, che contiene `wrong` una sola volta. '
                                      'Stringa vuota negli altri tipi.')
    wrong: str = Field(description='Solo correctStatement: la parte sbagliata di `sentence`; le opzioni la '
                                   'sostituiscono e la giusta corregge la frase. Stringa vuota negli altri tipi.')
    options: list[str] = Field(max_length=MASSIMO_OPZIONI,
                               description='Lista vuota in truefalse: «Vero» e «Falso» li aggiunge il server. In '
                                           'oddOneOut la giusta è l\'opzione che non appartiene al gruppo.')
    correctIndex: StrictInt = Field(description='Indice della giusta, da zero. 0 in truefalse e multiple.')
    correctIndexes: list[StrictInt] = Field(description='Solo multiple: le giuste, almeno 2 e non più di metà delle '
                                                        'opzioni. Lista vuota negli altri tipi.')
    correct: bool = Field(description='Solo truefalse: true se l\'affermazione di `prompt` è vera. false negli altri tipi.')
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta

    @model_validator(mode='after')
    def forma(self):
        """Vincoli di forma che la grammatica non porta più (vedi sopra): errore del modulo, come prima."""
        if any(not item.strip() for item in self.options):
            raise ValueError('Opzione vuota')
        if len(self.rationales) != len(self.options):
            raise ValueError('rationales deve avere un elemento per opzione')
        if self.kind in MINIMO_OPZIONI and len(self.options) < MINIMO_OPZIONI[self.kind]:
            raise ValueError(f'{self.kind}: servono almeno {MINIMO_OPZIONI[self.kind]} opzioni')
        if self.kind in TIPI_CON_GIUSTA_SINGOLA and not 0 <= self.correctIndex < len(self.options):
            raise ValueError('correctIndex fuori intervallo')
        if self.kind == 'multiple' and any(not 0 <= i < len(self.options) for i in self.correctIndexes):
            raise ValueError('correctIndexes fuori intervallo')
        return self


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
