from uuid import uuid4
from time import perf_counter
from pydantic import ValidationError
from .chunks import plan_chunks
from .errors import GenerationError
from .models import Course, ModuleDraft, Source
from .selection import create_provider
from .telemetry import aggregate_usage, call_usage


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
            questions.append(dict(id=qid, moduleId=module_id, lessonId=lesson_id, prompt=question.prompt,
                                  options=[dict(id=f'option-{k}', text=text) for k, text in enumerate(question.options)],
                                  correctOptionId=f'option-{question.correctIndex}', explanation=question.explanation,
                                  sourceRefs=question.sourceRefs))
        slides = [dict(id=f'slide-{i}-{j}', **slide.model_dump()) for j, slide in enumerate(draft.slides, 1)]
        modules.append(dict(id=module_id, title=draft.title, lessons=[dict(id=lesson_id, title=draft.title, slides=slides, questionIds=ids)],
                            exam=dict(id=f'exam-{i}', questionIds=ids, mode='practice', passingScore=len(ids), maxAttempts=None)))
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
