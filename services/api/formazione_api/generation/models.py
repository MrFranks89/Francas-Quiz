"""Modelli della generazione: ri-esporta i nomi pubblici dai moduli che li definiscono.

- comune.py: base Model, TipoDomanda, Difficolta, OPZIONI_VERO_FALSO, SPAZIO;
- bozze.py: le bozze inviate ai fornitori come output strutturato (ModuleDraft).

L'insieme dei nomi è fissato da tests/istantanee/nomi-generation-models.json.
"""
from typing import ClassVar, Literal
from pydantic import Field, StrictInt, model_serializer, model_validator
from .bozze import (CorrectStatementDraft, FillBlankDraft, ModuleDraft, MultipleDraft,  # noqa: F401
                    OddOneOutDraft, QuestionDraft, ScenarioDraft, SingleDraft, SlideDraft, TrueFalseDraft)
from .comune import OPZIONI_VERO_FALSO, SPAZIO, Difficolta, Model, TipoDomanda  # noqa: F401


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
