from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


class SlideDraft(Model):
    heading: str = Field(min_length=1)
    body: str = Field(min_length=1)
    highlight: str
    sourceRefs: list[str] = Field(min_length=1)


class QuestionDraft(Model):
    prompt: str = Field(min_length=1)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: StrictInt
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)

    @model_validator(mode='after')
    def correct_answer(self):
        if not 0 <= self.correctIndex < len(self.options):
            raise ValueError('correctIndex fuori intervallo')
        if any(not item.strip() for item in self.options):
            raise ValueError('Opzione vuota')
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


class Option(Model):
    id: str
    text: str = Field(min_length=1)


class Question(Model):
    id: str
    moduleId: str
    lessonId: str
    prompt: str = Field(min_length=1)
    options: list[Option] = Field(min_length=2)
    correctOptionId: str
    explanation: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)


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
            if question.correctOptionId not in {o.id for o in question.options}:
                raise ValueError('Risposta corretta inesistente')
            lesson = owners.get((question.moduleId, question.lessonId))
            if not lesson or question.id not in lesson.questionIds:
                raise ValueError('Proprietario domanda non valido')
            unique(question.sourceRefs)
            if not set(question.sourceRefs) <= sources:
                raise ValueError('Fonte domanda inesistente')
        return self
