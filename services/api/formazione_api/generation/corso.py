"""Formato del corso (contratto Course) con i suoi validatori strutturali."""
from typing import ClassVar, Literal
from pydantic import Field, StrictInt, model_serializer, model_validator
from .bozze import SlideDraft
from .comune import Difficolta, Model, TipoDomanda
from .regole import errori_tipo
from .soglia import errore_soglia_minima


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
                             self.situation, self.sentence, self.wrong, self.correctOptionIds, self.explanation,
                             [o.rationale for o in self.options])
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
