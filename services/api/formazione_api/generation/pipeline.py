import logging
from uuid import uuid4
from time import perf_counter
from pydantic import ValidationError
from .chunks import plan_chunks
from .bozze import errore_forma
from .errors import GenerationError
from .models import OPZIONI_VERO_FALSO, Course, ModuleDraft, Source, violazioni_domanda
from .selection import create_provider
from .soglia import SOGLIA_SUPERAMENTO_PERCENTO, soglia_predefinita  # noqa: F401 (letti anche come pipeline.*)
from .telemetry import aggregate_usage, call_usage

logger = logging.getLogger(__name__)


def avviso_scarti(n: int) -> str:
    """Avviso della bozza per n > 0 domande scartate (elenco completo in `scarti` del risultato)."""
    return f"{n} {'domanda scartata' if n == 1 else 'domande scartate'} dai controlli di qualità"


def domanda_del_contratto(question, qid: str, module_id: str, lesson_id: str) -> dict:
    """Una bozza di domanda (QuestionDraft, forma piatta) nella forma del contratto Course.

    I campi che il tipo non usa arrivano con un valore neutro (bozze.py). Un campo neutro resta fuori
    dalla domanda; un campo pieno che il tipo non usa entra com'è, così violazioni_domanda scarta la
    domanda con il codice di regole.py invece di perderlo in silenzio: situation, sentence o wrong fuori
    tipo → campo_di_altro_tipo; correctIndexes fuori da multiple → giuste_multiple_fuori_tipo; opzioni
    scritte in truefalse → vero_falso_opzioni. Il campo del tipo lasciato vuoto resta fuori, e la regola
    del tipo lo segnala (situazione_mancante, frase_mancante, parte_sbagliata_mancante).
    """
    # Motivazione vuota = assente: il contratto rifiuta un testo vuoto.
    options = [dict(id=f'option-{k}', text=text, **({'rationale': why} if why.strip() else {}))
               for k, (text, why) in enumerate(zip(question.options, question.rationales))]
    if question.kind == 'truefalse':
        # Opzioni fisse nell'ordine Vero, Falso (OPZIONI_VERO_FALSO): non le scrive il modello.
        options = options or [dict(id=f'option-{k}', text=text) for k, text in enumerate(OPZIONI_VERO_FALSO)]
        correct = 0 if question.correct else 1
    else:
        correct = question.correctIndex
    extra = {name: getattr(question, name) for name in ('situation', 'sentence', 'wrong') if getattr(question, name).strip()}
    giuste = {}
    if question.kind == 'multiple' or question.correctIndexes:
        giuste['correctOptionIds'] = [f'option-{i}' for i in question.correctIndexes]
    if question.kind not in ('multiple', 'matching'):
        giuste['correctOptionId'] = f'option-{correct}'
    if question.pairTerms:
        # La corrispondenza giusta è per indice (bozze.py): pairTerms[k] si abbina a option-k.
        # Su un tipo diverso da matching entra com'è e violazioni_domanda scarta con campo_di_altro_tipo.
        extra['pairs'] = [dict(id=f'pair-{k}', left=term, rightOptionId=f'option-{k}')
                          for k, term in enumerate(question.pairTerms)]
    return dict(id=qid, moduleId=module_id, lessonId=lesson_id, kind=question.kind, prompt=question.prompt, **extra,
                difficulty=question.difficulty, options=options, **giuste,
                explanation=question.explanation, sourceRefs=question.sourceRefs)


def _genera_blocco(i: int, chunk, provider, validator) -> dict:
    """Il blocco in posizione i: chiamata al fornitore (con un secondo tentativo per una bozza non
    valida), regole di qualità, validatore incrociato. Restituisce la voce del blocco, la stessa
    conservata per la ripresa: modulo, domande con i loro id, obiettivi, copertura, scarti, usage."""
    draft, usage, domande = None, [], []
    for attempt in range(2):
        try:
            started = perf_counter()
            draft = ModuleDraft.model_validate(provider.module(chunk))
            usage.append(call_usage(provider, chunk.id, round((perf_counter() - started) * 1000, 3)))
            break
        except GenerationError:
            raise
        except (ValidationError, ValueError) as error:
            logger.warning('Validazione bozza fallita nel blocco %s (tentativo %d/2): %s', chunk.id, attempt + 1, error)
            if attempt == 1:
                raise GenerationError('invalid_generated_content', f'Contenuto AI non valido nel blocco {chunk.id}: {error}') from error
    allowed = {p.source_id for p in chunk.pieces}
    # Prima delle regole di qualità e su tutte le domande, anche quelle che verranno scartate:
    # una fonte inventata resta fatale.
    for item in [*draft.slides, *draft.questions]:
        if len(set(item.sourceRefs)) != len(item.sourceRefs) or not set(item.sourceRefs) <= allowed:
            raise GenerationError('invented_source', 'La risposta AI cita una fonte assente dal blocco')
    module_id, lesson_id = f'module-{i}', f'lesson-{i}'
    ids, scarti_blocco, accettate = [], [], []
    for position, question in enumerate(draft.questions, 1):
        # Forma del campo (bozze.errore_forma): una domanda malformata si scarta da sola, prima di
        # costruirla nel contratto; nessun nuovo tentativo, il resto del modulo resta.
        if errore := errore_forma(question):
            scarti_blocco.append(dict(moduleId=module_id, chunkId=chunk.id, position=position, kind=question.kind,
                                      prompt=question.prompt, rule='forma_non_valida', message=errore, otherRules=[]))
            continue
        # L'id definitivo si assegna dopo il validatore: gli scarti non consumano numerazione.
        domanda = domanda_del_contratto(question, '', module_id, lesson_id)
        if violazioni := violazioni_domanda(domanda):
            (rule, message), *altre = violazioni
            scarti_blocco.append(dict(moduleId=module_id, chunkId=chunk.id, position=position, kind=question.kind,
                                      prompt=question.prompt, rule=rule, message=message,
                                      otherRules=[dict(rule=r, message=m) for r, m in altre]))
            continue
        accettate.append((position, question, domanda))
    if validator is not None and accettate:
        started = perf_counter()
        non_concordi = set(validator.verifica(chunk, [d for _, _, d in accettate]))
        usage.append(call_usage(validator, chunk.id, round((perf_counter() - started) * 1000, 3)))
        rimaste = []
        for k, (position, question, domanda) in enumerate(accettate):
            if k in non_concordi:
                scarti_blocco.append(dict(moduleId=module_id, chunkId=chunk.id, position=position, kind=question.kind,
                                          prompt=question.prompt, rule='validazione_incrociata',
                                          message='Il validatore indipendente non concorda con la risposta della bozza',
                                          otherRules=[]))
                continue
            rimaste.append((position, question, domanda))
        accettate = rimaste
    for _, _, domanda in accettate:
        qid = f'question-{i}-{len(ids) + 1}'
        ids.append(qid)
        domande.append({**domanda, 'id': qid})
    if not ids:
        # Un modulo senza domande non è un modulo valido: il blocco fallisce come prima dello scarto.
        raise GenerationError('invalid_generated_content', f'Contenuto AI non valido: {avviso_scarti(len(scarti_blocco))} '
                              f'nel blocco {chunk.id} ({", ".join(s["rule"] for s in scarti_blocco)}), nessuna rimasta')
    slides = [dict(id=f'slide-{i}-{j}', **slide.model_dump()) for j, slide in enumerate(draft.slides, 1)]
    modulo = dict(id=module_id, title=draft.title, lessons=[dict(id=lesson_id, title=draft.title, slides=slides, questionIds=ids)],
                  exam=dict(id=f'exam-{i}', questionIds=ids, mode='practice', passingScore=soglia_predefinita(len(ids)), maxAttempts=None))
    copertura = dict(chunkId=chunk.id, moduleId=module_id, pieces=[dict(sourceId=p.source_id, start=p.start, end=p.end) for p in chunk.pieces])
    return dict(chunkId=chunk.id, modulo=modulo, domande=domande, obiettivi=list(draft.objectives), copertura=copertura,
                scarti=scarti_blocco, usage=usage)


def generate(extraction: dict, provider=None, *, title='Corso dal documento', max_chars=8000, max_chunks=40, acknowledge_warnings: bool = False, validator=None, ripresa=None):
    """Draft generation. No partial course returned on any failed chunk.

    `validator`: validatore AI incrociato facoltativo (generation/validazione.py). Se presente,
    risponde alla cieca — una chiamata per blocco — a ogni domanda che ha superato le regole di
    qualità; le domande su cui non concorda sono scartate con la regola validazione_incrociata.

    `ripresa`: blocchi salvati facoltativi (ripresa_generazione.Ripresa). Un blocco con una voce
    salvata valida non chiama il fornitore; ogni blocco generato è conservato prima del successivo.
    Un GenerationError durante i blocchi porta in `ripresa` quanti blocchi sono salvati. Il corso
    nasce comunque solo con tutti i blocchi: nessun corso parziale.
    """
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
    modules, questions, objectives, coverage, usage_calls, scarti = [], [], [], [], [], []
    try:
        for i, chunk in enumerate(chunks, 1):
            voce = ripresa.riprendi(i, chunk) if ripresa is not None else None
            if voce is None:
                voce = _genera_blocco(i, chunk, provider, validator)
                # Subito, prima del blocco successivo: il blocco pagato sopravvive anche a un processo morto.
                if ripresa is not None:
                    ripresa.conserva(i, chunk, voce)
            modules.append(voce['modulo'])
            questions.extend(voce['domande'])
            objectives.extend(voce['obiettivi'])
            coverage.append(voce['copertura'])
            scarti.extend(voce['scarti'])
            usage_calls.extend(voce['usage'])
    except GenerationError as error:
        if ripresa is not None:
            error.ripresa = ripresa.stato()
        raise
    try:
        course = Course.model_validate(dict(schemaVersion=1, id=str(uuid4()), version=1, title=title,
                                           description='Bozza generata dal materiale selezionato. Revisione umana richiesta.',
                                           objectives=list(dict.fromkeys(objectives)), sources=[s.model_dump() for s in sources],
                                           modules=modules, questions=questions))
    except ValidationError as error:
        raise GenerationError('invalid_course', 'Corso assemblato non valido') from error
    return dict(status='draft', course=course.model_dump(), usage=aggregate_usage(usage_calls), coverage=dict(
        processedChunks=len(chunks), totalChunks=len(chunks), processedCharacters=sum(len(b['text']) for b in blocks),
        semanticCompleteness='not_verified', chunks=coverage), scarti=scarti, warnings=[
            *extraction.get('warnings', []), *([avviso_scarti(len(scarti))] if scarti else []),
            'Bozza da revisionare: il tracciamento del testo non certifica completezza o correttezza didattica.'])
