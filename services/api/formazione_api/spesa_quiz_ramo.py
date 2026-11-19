"""Guardia di spesa, generazione e validazione incrociata per i quiz mirati di ramo."""
import json
import logging
import os
import uuid
from decimal import Decimal
from time import perf_counter

from pydantic import ValidationError

from .generation.bozze import QuestionDraft, errore_forma
from .generation.branch_quiz import (
    BranchQuizDraft,
    GeneratoreQuizRamo,
    ISTRUZIONI_QUIZ_RAMO,
    leggi_quiz,
    prompt_quiz_ramo,
    seleziona_blocchi,
)
from .generation.causa import errore_fornitore
from .generation.chunks import Chunk
from .generation.errors import GenerationError
from .generation.pipeline import domanda_del_contratto
from .generation.regole import violazioni_domanda
from .generation.source_refs import resolve_source_refs
from .generation.validazione import create_validator
from .measurement.guardia import adesso
from .spesa_generazione import (
    GENERAZIONE_IN_CORSO,
    FornitoreRegolato,
    SpesaRifiuto,
    _usd,
    limiti_configurati,
    registro,
)
from .stima_quiz_ramo import decidi_quiz, valuta_quiz_ramo

logger = logging.getLogger(__name__)


def _valida_e_filtra_domande(
    raw_questions: list[QuestionDraft],
    blocchi: list[dict],
    verifica,
    scarti: list[dict],
) -> list[dict]:
    """Applica la catena di qualità alle domande del quiz di ramo."""
    module_id, lesson_id = 'module-practice', 'lesson-practice'
    accettate = []
    scartate_per_fonte = 0

    for pos, q in enumerate(raw_questions, 1):
        if err_forma := errore_forma(q):
            scarti.append(dict(position=pos, prompt=q.prompt, rule='forma_non_valida', message=err_forma))
            continue

        res_fonti = resolve_source_refs(q.sourceRefs, blocchi)
        ids_sel = {b['id'] for b in blocchi}
        ids = [bid for bid in dict.fromkeys(res_fonti.get('blockIds', [])) if bid in ids_sel]
        if not ids:
            scarti.append(dict(position=pos, prompt=q.prompt, rule='fonte_non_risolta', message='Fonte non risolta nei blocchi selezionati'))
            scartate_per_fonte += 1
            continue
        q = q.model_copy(update={'sourceRefs': ids})   # solo id di blocco, da qui in poi

        domanda = domanda_del_contratto(q, '', module_id, lesson_id)
        if violazioni := violazioni_domanda(domanda):
            rule, msg = violazioni[0]
            scarti.append(dict(position=pos, prompt=q.prompt, rule=rule, message=msg))
            continue

        accettate.append(domanda)

    if scartate_per_fonte == len(raw_questions) and len(raw_questions) > 0:
        raise GenerationError('invented_source', 'Tutte le domande citano fonti non risolte nei blocchi selezionati.')

    if verifica is not None and accettate:
        non_concordi = set(verifica(accettate))
        superstiti = []
        for k, d in enumerate(accettate):
            if k in non_concordi:
                scarti.append(dict(prompt=d.get('prompt', ''), rule='validazione_incrociata', message='Validatore indipendente non concorde'))
            else:
                superstiti.append(d)
        accettate = superstiti

    return accettate


def genera_quiz_ramo_con_tetto(
    extraction: dict,
    blocchi: list[dict],
    provider,
    store,
    branch_id: str,
    node_id: str | None,
    tree_hash: str,
    question_count: int,
    nodi_ramo: list[dict],
    titolo_ramo: str,
    corsa_id: str,
    extraction_id: str,
    idempotency_key: str,
) -> dict:
    """Esegue la generazione del quiz di ramo sotto guardia di spesa e lock di processo."""
    con_validatore = bool(os.getenv('VALIDATION_PROVIDER', '').strip())
    stima = valuta_quiz_ramo(extraction, blocchi, provider, store, con_validatore=con_validatore)
    decidi_quiz(stima, store)

    # Il validatore si crea prima di qualunque chiamata a pagamento: una configurazione invalida
    # (VALIDATION_PROVIDER uguale al fornitore della generazione, modello o chiave mancanti) deve
    # fallire qui, a costo zero, non dopo aver pagato la generazione.
    validator = create_validator()
    if validator is not None and stima['validatore'] is None:
        raise SpesaRifiuto(
            'estimate_unavailable',
            'Preventivo non disponibile per il validatore incrociato: nessuna spesa avviata.',
        )

    reg = registro(store)
    lock = GENERAZIONE_IN_CORSO
    if not lock.acquire(blocking=False):
        raise GenerationError('generation_in_progress', 'Un’altra generazione è già in corso.')

    try:
        # M3b: Secondo controllo di idempotenza dentro il lock per richieste concorrenti
        for q in leggi_quiz(store.root, extraction_id):
            if q.get('idempotencyKey') == idempotency_key:
                if q.get('branchId') == branch_id and (q.get('nodeId') or None) == (node_id or None):
                    return {'cached_record': q}

        decidi_quiz(stima, store)
        inizio = adesso()
        corsa = dict(
            id=corsa_id,
            avviata=inizio,
            chiusa=None,
            limiteMassimoUSD=_usd(stima['limiteSuperioreUSD']),
            addebitatoUSD=Decimal(0),
            chiamate=[],
            esito='in_corso',
            fornitore=stima['fornitore'],
            modello=stima['modello'],
            ruolo='quiz_ramo',
        )
        reg.aggiorna_corsa(corsa)

        generatore = provider if (provider is not None and hasattr(provider, 'genera')) else GeneratoreQuizRamo(stima['fornitore'], model=stima['modello'])
        limiti_cfg = limiti_configurati()
        regolato = FornitoreRegolato(
            generatore,
            stima['limiti'],
            stima['listino'],
            limiti_cfg['GENERATION_BUDGET_USD'],
            reg,
            corsa,
        )

        chunk = stima['chunk']
        prompt = prompt_quiz_ramo(titolo_ramo, nodi_ramo, blocchi, question_count)

        # Validatore sotto la stessa guardia della generazione: chiamate prenotate e misurate
        # con il limite e il listino del SUO fornitore (come ValidatoreRegolato nella pipeline).
        if validator is not None:
            chunk_val = Chunk('branch-quiz-validation', chunk.pieces)
            validatore_regolato = FornitoreRegolato(
                validator,
                {'branch-quiz-validation': stima['validatore']['limite']},
                stima['validatore']['listino'],
                limiti_cfg['GENERATION_BUDGET_USD'],
                reg,
                corsa,
            )

            def verifica(domande):
                prima = len(corsa['chiamate'])
                try:
                    return validatore_regolato._sorvegliato(
                        chunk_val,
                        lambda: validator.verifica(chunk, domande),
                        voce=dict(ruolo='validazione_quiz_ramo',
                                  fornitore=validator.provider_name, modello=validator.model),
                    )
                finally:
                    validatore_regolato._regola(chunk_val, prima)
        else:
            verifica = None

        # 1. Chiamata di generazione (M2: una sola chiamata, niente retry applicativo)
        prima = len(corsa['chiamate'])
        try:
            draft = regolato._sorvegliato(
                chunk,
                lambda: generatore.genera(prompt),
                voce=dict(ruolo='quiz_ramo', fornitore=stima['fornitore'], modello=stima['modello']),
            )
        except GenerationError:
            raise
        except (ValidationError, ValueError) as error:
            raise GenerationError('invalid_generated_content', f'Bozza quiz non valida: {error}') from error
        finally:
            regolato._regola(chunk, prima)

        # 2. Catena di qualità e validazione (M2: tetto duro 6 prima di rigenerare)
        scarti = []
        accettate = _valida_e_filtra_domande(draft.questions, blocchi, verifica, scarti)
        accettate = accettate[:6]

        # 3. Se superstiti < question_count, un solo giro di rigenerazione del deficit
        warnings = []
        if len(accettate) < question_count:
            deficit = question_count - len(accettate)
            prompt_deficit = prompt_quiz_ramo(titolo_ramo, nodi_ramo, blocchi, max(3, deficit))
            prima_def = len(corsa['chiamate'])
            try:
                draft_def = regolato._sorvegliato(
                    chunk,
                    lambda: generatore.genera(prompt_deficit),
                    voce=dict(ruolo='quiz_ramo', fornitore=stima['fornitore'], modello=stima['modello']),
                )
                recuperate = _valida_e_filtra_domande(draft_def.questions, blocchi, verifica, scarti)
                prompt_esistenti = {d['prompt'].strip().lower() for d in accettate if 'prompt' in d}
                non_duplicate = []
                for d in recuperate:
                    p_norm = d.get('prompt', '').strip().lower()
                    if p_norm in prompt_esistenti:
                        scarti.append(dict(prompt=d.get('prompt', ''), rule='duplicata_rigenerazione', message='Domanda duplicata durante la rigenerazione'))
                    else:
                        prompt_esistenti.add(p_norm)
                        non_duplicate.append(d)
                accettate.extend(non_duplicate[:deficit])
            except Exception as ex:
                logger.warning('Rigenerazione deficit quiz non riuscita: %s', ex)
            finally:
                regolato._regola(chunk, prima_def)

        if len(accettate) < 3:
            if not accettate:
                raise GenerationError('invalid_generated_content', 'Nessuna domanda ha superato i controlli di qualità.')
            warnings.append('LOW_QUESTION_COUNT')

        # 4. Assegnazione ID definitivi
        domande_finali = []
        for k, d in enumerate(accettate, 1):
            d_copy = dict(d)
            d_copy['id'] = f'question-p{k}'
            domande_finali.append(d_copy)

        effettivi = [c.get('effettivoUSD') for c in corsa['chiamate']]
        costo_effettivo = sum((e for e in effettivi if e is not None), Decimal(0))
        corsa['effettivoUSD'] = costo_effettivo
        corsa['esito'] = 'completata'
        corsa['chiusa'] = adesso()
        reg.aggiorna_corsa(corsa)

        if not bool(stima['validatore']):
            warnings.append('NO_CROSS_VALIDATION')

        return {
            'questions': domande_finali,
            'scarti': scarti,
            'warnings': warnings,
            'costUsd': _usd(costo_effettivo),
            'validation': {'passed': len(domande_finali), 'discarded': len(scarti)},
            'crossValidation': {
                'enabled': bool(stima['validatore']),
                'provider': (stima['validatore'] or {}).get('fornitore'),
            },
        }
    except GenerationError:
        try:
            corsa['esito'] = 'errore'
            corsa['chiusa'] = adesso()
            reg.aggiorna_corsa(corsa)
        except Exception:
            pass
        raise
    except Exception as error:
        try:
            corsa['esito'] = 'errore'
            corsa['chiusa'] = adesso()
            reg.aggiorna_corsa(corsa)
        except Exception:
            pass
        raise errore_fornitore(stima['fornitore'], error) from error
    finally:
        lock.release()
