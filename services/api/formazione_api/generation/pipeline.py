from uuid import uuid4
from time import perf_counter
from pydantic import ValidationError
from .chunks import plan_chunks
from .errors import GenerationError
from .models import OPZIONI_VERO_FALSO, Course, ModuleDraft, Source
from .selection import create_provider
from .telemetry import aggregate_usage, call_usage

# Soglia predefinita dei quiz generati, in percentuale. Deve coincidere con
# packages/contracts/fixtures/grading-scale.json (sogliaSuperamentoPercento), letto dal
# motore TypeScript: lo controlla services/api/tests/test_grading_scale.py.
SOGLIA_SUPERAMENTO_PERCENTO = 60


def soglia_predefinita(n: int) -> int:
    """Risposte corrette minime su n domande: il più piccolo k con k/n >= 60%, in aritmetica intera."""
    return (SOGLIA_SUPERAMENTO_PERCENTO * n + 99) // 100


def domanda_del_contratto(question, qid: str, module_id: str, lesson_id: str) -> dict:
    """Una bozza di domanda (una variante di QuestionDraft) nella forma del contratto Course."""
    if question.kind == 'truefalse':
        # Opzioni fisse nell'ordine Vero, Falso (OPZIONI_VERO_FALSO): non le scrive il modello.
        options = [dict(id=f'option-{k}', text=text) for k, text in enumerate(OPZIONI_VERO_FALSO)]
        correct = 0 if question.correct else 1
    else:
        # Motivazione vuota = assente: il contratto rifiuta un testo vuoto.
        options = [dict(id=f'option-{k}', text=text, **({'rationale': why} if why.strip() else {}))
                   for k, (text, why) in enumerate(zip(question.options, question.rationales))]
        correct = question.correctIndex
    extra = {name: getattr(question, name) for name in ('situation', 'sentence', 'wrong') if hasattr(question, name)}
    return dict(id=qid, moduleId=module_id, lessonId=lesson_id, kind=question.kind, prompt=question.prompt, **extra,
                difficulty=question.difficulty, options=options, correctOptionId=f'option-{correct}',
                explanation=question.explanation, sourceRefs=question.sourceRefs)


def generate(extraction: dict, provider=None, *, title='Corso dal documento', max_chars=12000, max_chunks=40, acknowledge_warnings: bool = False):
    """Atomic draft generation. No partial course returned on any failed chunk."""
    status = extraction.get('status')
    if status not in ('ready', 'needs_review') or (status == 'needs_review' and acknowledge_warnings is not True):
        raise GenerationError('needs_review', 'Verificare prima i problemi di estrazione')
    blocks = extraction.get('blocks', [])
    if not blocks or any(not b.get('text', '').strip() for b in blocks):
        raise GenerationError('empty_extraction', 'Estrazione priva di testo utilizzabile')
    if len({b['id'] for b in blocks}) != len(blocks):
        raise GenerationError('invalid_sources', 'ID fonte duplicati')
    try:
        sources = [Source(id=b['id'], documentId=extraction['documentId'], page=b['page'], label=b['label'], excerpt=b['text']) for b in blocks]
    except (ValidationError, KeyError) as error:
        raise GenerationError('invalid_sources', 'Metadati delle fonti non validi') from error
    chunks = plan_chunks(blocks, max_chars, max_chunks)
    provider = provider or create_provider()
    modules, questions, objectives, coverage, usage_calls = [], [], [], [], []
    for i, chunk in enumerate(chunks, 1):
        try:
            started = perf_counter()
            draft = ModuleDraft.model_validate(provider.module(chunk))
            usage_calls.append(call_usage(provider, chunk.id, round((perf_counter() - started) * 1000, 3)))
        except GenerationError:
            raise
        except (ValidationError, ValueError) as error:
            raise GenerationError('invalid_generated_content', 'Contenuto AI non valido') from error
        allowed = {p.source_id for p in chunk.pieces}
        for item in [*draft.slides, *draft.questions]:
            if len(set(item.sourceRefs)) != len(item.sourceRefs) or not set(item.sourceRefs) <= allowed:
                raise GenerationError('invented_source', 'La risposta AI cita una fonte assente dal blocco')
        module_id, lesson_id = f'module-{i}', f'lesson-{i}'
        ids = []
        for j, question in enumerate(draft.questions, 1):
            qid = f'question-{i}-{j}'
            ids.append(qid)
            questions.append(domanda_del_contratto(question, qid, module_id, lesson_id))
        slides = [dict(id=f'slide-{i}-{j}', **slide.model_dump()) for j, slide in enumerate(draft.slides, 1)]
        modules.append(dict(id=module_id, title=draft.title, lessons=[dict(id=lesson_id, title=draft.title, slides=slides, questionIds=ids)],
                            exam=dict(id=f'exam-{i}', questionIds=ids, mode='practice', passingScore=soglia_predefinita(len(ids)), maxAttempts=None)))
        objectives.extend(draft.objectives)
        coverage.append(dict(chunkId=chunk.id, moduleId=module_id, pieces=[dict(sourceId=p.source_id, start=p.start, end=p.end) for p in chunk.pieces]))
    try:
        course = Course.model_validate(dict(schemaVersion=1, id=str(uuid4()), version=1, title=title,
                                           description='Bozza generata dal materiale selezionato. Revisione umana richiesta.',
                                           objectives=list(dict.fromkeys(objectives)), sources=[s.model_dump() for s in sources],
                                           modules=modules, questions=questions))
    except ValidationError as error:
        raise GenerationError('invalid_course', 'Corso assemblato non valido') from error
    return dict(status='draft', course=course.model_dump(), usage=aggregate_usage(usage_calls), coverage=dict(
        processedChunks=len(chunks), totalChunks=len(chunks), processedCharacters=sum(len(b['text']) for b in blocks),
        semanticCompleteness='not_verified', chunks=coverage), warnings=[
            *extraction.get('warnings', []), 'Bozza da revisionare: il tracciamento del testo non certifica completezza o correttezza didattica.'])
