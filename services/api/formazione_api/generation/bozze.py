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
# - forma del campo (opzioni almeno 2, 4 per multiple; indice della giusta dentro le opzioni; opzione vuota;
#   `rationales` lunga quanto le opzioni; matching con un termine per opzione): errore_forma qui sotto, e la
#   pipeline scarta la sola domanda con la regola forma_non_valida. Mai una riparazione che può cambiare
#   quale risposta è giusta. Il massimo di 6 opzioni e i min_length restano nello schema: un loro errore
#   è una ValidationError del modulo (invalid_generated_content);
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
# In matching le opzioni sono la colonna destra e devono essere tante quante le coppie (3–6, tipi.ts).
MINIMO_OPZIONI = {**{tipo: 2 for tipo in TIPI_CON_GIUSTA_SINGOLA}, 'multiple': 4, 'matching': 3}
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
    pairTerms: list[str] = Field(description='Solo matching: i termini della colonna sinistra, allineati per '
                                             'indice a `options` (la colonna destra): l\'abbinamento giusto è '
                                             'pairTerms[i] con options[i]. Lista vuota negli altri tipi.')
    rationales: list[str]
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    difficulty: Difficolta

    @model_validator(mode='after')
    def forma(self):
        """Solo normalizzazioni che non toccano indici né abbinamenti; i vincoli di forma sono in errore_forma.

        Qui nulla solleva: questo validatore gira anche dentro lo SDK del fornitore, e un errore farebbe
        fallire il modulo intero invece della sola domanda (vedi sopra).
        - spazi attorno a ogni opzione: tolti, la posizione resta (un'opzione di soli spazi diventa vuota
          e errore_forma la scarta, non la si toglie: gli indici scorrerebbero);
        - vero/falso senza opzioni: le opzioni le aggiunge il server, le motivazioni del modello non
          hanno a cosa riferirsi e si ignorano.
        """
        self.options = [o.strip() for o in self.options]
        if self.kind == 'truefalse' and not self.options:
            self.rationales = []
        return self


def errore_forma(question: QuestionDraft) -> str | None:
    """Vincoli di forma che la grammatica non porta più (vedi sopra); None se la domanda li rispetta.

    La pipeline scarta la sola domanda con la regola forma_non_valida e questo messaggio. Mai riparare:
    togliere un'opzione vuota, portare correctIndex dentro l'intervallo, troncare il matching o
    completare le motivazioni può cambiare quale risposta è giusta senza che nessuno lo veda.
    """
    kind, options, n = question.kind, question.options, len(question.options)
    if vuote := [k for k, o in enumerate(options) if not o.strip()]:
        return f'{kind}: opzione vuota in posizione {vuote[0]}'
    if kind in MINIMO_OPZIONI and n < MINIMO_OPZIONI[kind]:
        return f'{kind}: servono almeno {MINIMO_OPZIONI[kind]} opzioni, ricevute {n}'
    if kind == 'matching':
        # La corrispondenza giusta è per indice: un termine per opzione, nessuno vuoto.
        if len(question.pairTerms) != n:
            return f'matching: pairTerms ha {len(question.pairTerms)} termini per {n} opzioni, ne serve uno per opzione'
        if any(not item.strip() for item in question.pairTerms):
            return 'matching: termine vuoto in pairTerms'
    if not (kind == 'truefalse' and not options) and len(question.rationales) != n:
        return f'{kind}: rationales ha {len(question.rationales)} motivazioni per {n} opzioni, ne serve una per opzione'
    if kind in TIPI_CON_GIUSTA_SINGOLA and not 0 <= question.correctIndex < n:
        return f'{kind}: correctIndex {question.correctIndex} fuori dalle {n} opzioni (da 0 a {n - 1})'
    if kind == 'multiple' and (fuori := [i for i in question.correctIndexes if not 0 <= i < n]):
        return f'multiple: correctIndexes {fuori} fuori dalle {n} opzioni (da 0 a {n - 1})'
    return None


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
