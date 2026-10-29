from typing import Annotated, ClassVar, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, WithJsonSchema, field_validator, model_serializer, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


# Tipi di domanda: stessi valori e stesse regole di packages/contracts/src/tipi.ts.
TipoDomanda = Literal['single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement', 'multiple']
# Livelli letti da DifficultyBadge di Civis (packages/civis-ui/src/comune/DifficultyBadge.tsx).
Difficolta = Literal['base', 'medio', 'avanzato']
# Opzioni fisse del vero/falso, nell'ordine di Civis (TrueFalseStep, normalizzaPerRipasso).
OPZIONI_VERO_FALSO = ('Vero', 'Falso')
# Segnaposto della parola mancante (FillBlankStep di Civis).
SPAZIO = '___'


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


class Source(Model):
    id: str = Field(min_length=1)
    documentId: str = Field(min_length=1)
    page: StrictInt | None
    label: str = Field(min_length=1)
    excerpt: str = Field(min_length=1)

    @model_validator(mode='after')
    def positive_page(self):
        if self.page is not None and self.page < 1:
            raise ValueError('Pagina non valida')
        return self


_CAMPI_DEL_TIPO = {'situation': 'scenario', 'sentence': 'correctStatement', 'wrong': 'correctStatement'}


def errori_tipo(kind, prompt, options, correct_id, situation=None, sentence=None, wrong=None,
                correct_ids=None) -> list[tuple[str, str]]:
    """Regole per tipo, (campo, messaggio). `options`: elenco di (id, testo).

    Riscritte, non copiate, da C:\\Civica\\CivicaApp\\scripts\\verifica-contenuti.mjs (righe 281–331);
    stesso ordine e stessi messaggi di erroriTipo in packages/contracts/src/tipi.ts. Una sola giusta
    è garantita dalla forma (un correctOptionId); che sia fra le opzioni lo controlla il corso.
    """
    return [(campo, messaggio) for campo, _, messaggio in
            violazioni_tipo(kind, prompt, options, correct_id, situation, sentence, wrong, correct_ids)]


def violazioni_tipo(kind, prompt, options, correct_id, situation=None, sentence=None, wrong=None,
                    correct_ids=None) -> list[tuple[str, str, str]]:
    """Le regole di errori_tipo con il loro codice stabile: (campo, codice, messaggio).

    Il codice identifica la regola negli scarti della generazione e nel rapporto della misura, e non
    cambia se cambia il testo del messaggio. Codici solo lato Python: erroriTipo del contratto
    TypeScript espone campo e messaggio.
    """
    errori = []
    campi = dict(situation=situation, sentence=sentence, wrong=wrong)
    for campo, tipo in _CAMPI_DEL_TIPO.items():
        if kind != tipo and campi[campo] is not None:
            errori.append((campo, 'campo_di_altro_tipo', f'Il campo {campo} vale solo per il tipo {tipo}'))
    testi = [t.strip() for _, t in options]
    # Risposta multipla: più giuste in correctOptionIds (almeno 2, almeno una sbagliata), mai correctOptionId;
    # tutti gli altri tipi l'opposto. Decisione dell'utente del 28 ottobre 2026.
    if kind == 'multiple':
        giuste = correct_ids or []
        ids = {i for i, _ in options}
        if correct_id is not None:
            errori.append(('correctOptionId', 'multipla_giusta_singola', 'Risposta multipla: le giuste vanno in correctOptionIds'))
        if len(giuste) < 2:
            errori.append(('correctOptionIds', 'multipla_meno_di_due_giuste', 'Risposta multipla: servono almeno 2 risposte giuste'))
        elif len(set(giuste)) != len(giuste) or not set(giuste) <= ids:
            errori.append(('correctOptionIds', 'multipla_giuste_non_valide', 'Risposta multipla: le giuste devono essere opzioni diverse della domanda'))
        elif len(giuste) >= len(options):
            errori.append(('correctOptionIds', 'multipla_senza_sbagliate', 'Risposta multipla: serve almeno una risposta sbagliata'))
        if len(set(testi)) != len(testi):
            errori.append(('options', 'opzioni_duplicate', 'Opzioni duplicate'))
    else:
        if correct_ids is not None:
            errori.append(('correctOptionIds', 'giuste_multiple_fuori_tipo', 'Il campo correctOptionIds vale solo per il tipo multiple'))
        if not correct_id:
            errori.append(('correctOptionId', 'giusta_mancante', 'Manca la risposta giusta'))
    if kind == 'truefalse' and tuple(testi) != OPZIONI_VERO_FALSO:
        errori.append(('options', 'vero_falso_opzioni', 'Vero o falso: le opzioni sono esattamente «Vero» e «Falso», in quest\'ordine'))
    if kind == 'fillblank' and prompt.count(SPAZIO) != 1:
        errori.append(('prompt', 'spazio_non_unico', f'Completa la frase: il testo deve contenere esattamente uno spazio {SPAZIO}'))
    if kind == 'scenario' and not (situation or '').strip():
        errori.append(('situation', 'situazione_mancante', 'Scenario: la situazione è obbligatoria'))
    if kind == 'correctStatement':
        if not (sentence or '').strip():
            errori.append(('sentence', 'frase_mancante', 'Correggi l\'errore: la frase è obbligatoria'))
        if not (wrong or '').strip():
            errori.append(('wrong', 'parte_sbagliata_mancante', 'Correggi l\'errore: la parte sbagliata è obbligatoria'))
        elif (sentence or '').strip() and sentence.count(wrong) != 1:
            errori.append(('wrong', 'parte_sbagliata_non_unica', 'Correggi l\'errore: la parte sbagliata deve comparire esattamente una volta nella frase'))
    if kind in ('scenario', 'oddOneOut', 'correctStatement'):
        if len(set(testi)) != len(testi):
            errori.append(('options', 'opzioni_duplicate', 'Opzioni duplicate'))
        ids = [i for i, _ in options]
        if correct_id in ids and len(options) > 1:
            giusta = ids.index(correct_id)
            rivale = max(len(t) for k, t in enumerate(testi) if k != giusta)
            # len() conta punti di codice, come Array.from in TypeScript; 2·giusta > 3·rivale ⇔ giusta > 1,5·rivale.
            if 2 * len(testi[giusta]) > 3 * rivale:
                errori.append(('options', 'giusta_troppo_lunga', 'La risposta giusta è più lunga di 1,5 volte la più lunga delle altre: '
                                          'si riconosce senza conoscere la materia'))
    return errori


def violazioni_domanda(domanda: dict) -> list[tuple[str, str]]:
    """Regole di qualità di una domanda generata, già nella forma del contratto: (codice, messaggio).

    Sono le regole di errori_tipo, applicate alla stessa forma che Question valida nel corso (così
    una domanda che le supera non può far fallire Course né CourseSchema per queste regole), più la
    regola della generazione sulla risposta multipla. Elenco vuoto = domanda da tenere.
    """
    giuste = domanda.get('correctOptionIds')
    violazioni = [(codice, messaggio) for _, codice, messaggio in violazioni_tipo(
        domanda['kind'], domanda['prompt'], [(o['id'], o['text']) for o in domanda['options']],
        domanda.get('correctOptionId'), domanda.get('situation'), domanda.get('sentence'), domanda.get('wrong'), giuste)]
    # Regola della generazione, più stretta del contratto (che chiede solo almeno una sbagliata):
    # con più giuste che sbagliate la domanda si indovina scegliendo quasi tutto.
    if domanda['kind'] == 'multiple' and giuste is not None and 2 * len(giuste) > len(domanda['options']):
        violazioni.append(('multipla_oltre_meta_giuste', 'Risposta multipla: non più di metà delle opzioni può essere giusta'))
    return violazioni


class _SenzaNulli(Model):
    """I campi facoltativi assenti non compaiono nel JSON (come `optional()` di Zod, che rifiuta null)."""
    _FACOLTATIVI: ClassVar[frozenset[str]] = frozenset()

    @model_serializer(mode='wrap')
    def _senza_nulli(self, handler):
        return {k: v for k, v in handler(self).items() if not (v is None and k in self._FACOLTATIVI)}


class Option(_SenzaNulli):
    _FACOLTATIVI: ClassVar[frozenset[str]] = frozenset({'rationale'})
    id: str
    text: str = Field(min_length=1)
    # Perché l'opzione è (o non è) quella giusta: il `perche` di Civis.
    rationale: str | None = None


class Question(_SenzaNulli):
    _FACOLTATIVI: ClassVar[frozenset[str]] = frozenset({'situation', 'sentence', 'wrong', 'difficulty',
                                                        'correctOptionId', 'correctOptionIds'})
    id: str
    moduleId: str
    lessonId: str
    # Facoltativo con predefinito 'single': i corsi scritti prima dei tipi restano validi.
    kind: TipoDomanda = 'single'
    prompt: str = Field(min_length=1)
    situation: str | None = None
    sentence: str | None = None
    wrong: str | None = None
    difficulty: Difficolta | None = None
    options: list[Option] = Field(min_length=2)
    # Una sola giusta in correctOptionId; per `multiple` più giuste in correctOptionIds (errori_tipo).
    correctOptionId: str | None = None
    correctOptionIds: list[str] | None = None
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)

    @model_validator(mode='after')
    def regole_del_tipo(self):
        errori = errori_tipo(self.kind, self.prompt, [(o.id, o.text) for o in self.options], self.correctOptionId,
                             self.situation, self.sentence, self.wrong, self.correctOptionIds)
        if errori:
            raise ValueError('; '.join(f'{messaggio} ({self.id})' for _, messaggio in errori))
        return self


class Slide(SlideDraft):
    id: str


class Lesson(Model):
    id: str
    title: str = Field(min_length=1)
    slides: list[Slide] = Field(min_length=1)
    questionIds: list[str]


def soglia_minima(n: int) -> int:
    """Risposte corrette minime ammesse su n domande: la soglia predefinita della pipeline, ⌈60%·n⌉."""
    # Import ritardato: pipeline importa questo modulo. Il percento è SOGLIA_SUPERAMENTO_PERCENTO,
    # confrontato con packages/contracts/fixtures/grading-scale.json da tests/test_grading_scale.py.
    from .pipeline import soglia_predefinita
    return soglia_predefinita(n)


def errore_soglia_minima(passing_score: int, n: int) -> str | None:
    """Messaggio per una soglia sotto il minimo, oppure None. Stesso testo del contratto TypeScript."""
    from .pipeline import SOGLIA_SUPERAMENTO_PERCENTO
    minimo = soglia_minima(n)
    if passing_score >= minimo:
        return None
    return f"La soglia minima è {minimo} {'risposta' if minimo == 1 else 'risposte'} su {n} ({SOGLIA_SUPERAMENTO_PERCENTO}%)"


class Exam(Model):
    id: str
    questionIds: list[str] = Field(min_length=1)
    mode: Literal['practice', 'gate']
    passingScore: StrictInt = Field(ge=1)
    maxAttempts: StrictInt | None

    @model_validator(mode='after')
    def soglia_non_sotto_il_minimo(self):
        errore = errore_soglia_minima(self.passingScore, len(self.questionIds))
        if errore:
            raise ValueError(errore)
        return self


class Module(Model):
    id: str
    title: str = Field(min_length=1)
    lessons: list[Lesson] = Field(min_length=1)
    exam: Exam | None


class Course(Model):
    schemaVersion: Literal[1] = 1
    id: str = Field(min_length=1)
    version: StrictInt = Field(ge=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    objectives: list[str] = Field(min_length=1)
    sources: list[Source] = Field(min_length=1)
    modules: list[Module] = Field(min_length=1)
    questions: list[Question]

    @model_validator(mode='after')
    def references(self):
        def nonblank(value, key=''):
            if isinstance(value, dict):
                for name, item in value.items():
                    nonblank(item, name)
            elif isinstance(value, list):
                for item in value:
                    nonblank(item, key)
            elif isinstance(value, str) and key != 'highlight' and not value.strip():
                raise ValueError('Testo obbligatorio vuoto')
        nonblank(self.model_dump())
        def unique(values):
            if len(values) != len(set(values)):
                raise ValueError('ID o riferimenti duplicati')
            if any(not v.strip() for v in values):
                raise ValueError('ID vuoto')
        for values in [self.sources, self.modules, self.questions,
                       [l for m in self.modules for l in m.lessons],
                       [s for m in self.modules for l in m.lessons for s in l.slides],
                       [m.exam for m in self.modules if m.exam]]:
            unique([item.id for item in values])
        sources = {s.id for s in self.sources}
        questions = {q.id: q for q in self.questions}
        owners = {}
        for module in self.modules:
            for lesson in module.lessons:
                owners[(module.id, lesson.id)] = lesson
                unique(lesson.questionIds)
                for qid in lesson.questionIds:
                    q = questions.get(qid)
                    if not q or (q.moduleId, q.lessonId) != (module.id, lesson.id):
                        raise ValueError('Domanda di lezione non valida')
                for slide in lesson.slides:
                    unique(slide.sourceRefs)
                    if not set(slide.sourceRefs) <= sources:
                        raise ValueError('Fonte slide inesistente')
            if module.exam:
                exam = module.exam
                unique(exam.questionIds)
                if exam.passingScore > len(exam.questionIds) or (exam.maxAttempts is not None and exam.maxAttempts < 1):
                    raise ValueError('Regole esame non valide')
                if any(qid not in questions or questions[qid].moduleId != module.id for qid in exam.questionIds):
                    raise ValueError('Domanda esame non valida')
        for question in self.questions:
            unique([o.id for o in question.options])
            if question.correctOptionId is not None and question.correctOptionId not in {o.id for o in question.options}:
                raise ValueError('Risposta corretta inesistente')
            lesson = owners.get((question.moduleId, question.lessonId))
            if not lesson or question.id not in lesson.questionIds:
                raise ValueError('Proprietario domanda non valido')
            unique(question.sourceRefs)
            if not set(question.sourceRefs) <= sources:
                raise ValueError('Fonte domanda inesistente')
        return self
