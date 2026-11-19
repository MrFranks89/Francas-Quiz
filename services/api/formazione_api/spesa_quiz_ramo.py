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
    prompt_quiz_ramo,
    seleziona_blocchi,
)
from .generation.causa import errore_fornitore
from .generation.chunks import Chunk, SourcePiece
from .generation.errors import GenerationError
from .generation.pipeline import domanda_del_contratto
from .generation.regole import violazioni_domanda
from .generation.selection import config_status
from .generation.source_refs import resolve_source_refs
from .generation.telemetry import call_usage
from .generation.validazione import (
    ISTRUZIONI_VALIDATORE,
    RisposteValidatore,
    create_validator,
)
from .measurement import preventivo as pv
from .measurement.guardia import GuardiaRifiuto, adesso, costo_limite_blocco, verifica_avvio
from .measurement.prezzi import PREZZI, PrezzoMancante, carica, prezzo
from .spesa_generazione import (
    FORNITORI,
    GENERAZIONE_IN_CORSO,
    FornitoreRegolato,
    SpesaRifiuto,
    _non_configurato,
    _usd,
    fornitore_e_modello,
    limiti_configurati,
    per_eccesso,
    registro,
)

logger = logging.getLogger(__name__)


def valuta_quiz_ramo(extraction: dict, blocchi: list[dict], provider, store, con_validatore: bool = False) -> dict:
    """Stima di spesa per il quiz di ramo prima di effettuare chiamate a fornitori esterni."""
    if provider is None and not config_status()['configured']:
        raise _non_configurato()
    fornitore, modello = fornitore_e_modello(provider)
    if fornitore is None or modello is None:
        if provider is not None:
            fornitore = fornitore or getattr(provider, 'provider_name', None) or 'anthropic'
            modello = modello or getattr(provider, 'model', None) or 'claude-haiku-5-5'
        else:
            raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: fornitore o modello non dichiarati.')

    try:
        listino = prezzo(carica(PREZZI), fornitore, modello)
    except PrezzoMancante as error:
        raise SpesaRifiuto('estimate_unavailable', f'Preventivo non disponibile: {error}.') from error

    chunk = Chunk('branch-quiz', tuple(SourcePiece(b['id'], 0, len(b['text']), b['text']) for b in blocchi))
    schema_byte_gen = pv.byte_utf8(json.dumps(pv.schema_inviato(fornitore, modello_bozza=BranchQuizDraft), ensure_ascii=False))
    limite_gen = pv.limite_blocco(
        chunk,
        fornitore,
        listino.sovraccarico_ingresso,
        schema_byte=schema_byte_gen,
        istruzioni=ISTRUZIONI_QUIZ_RAMO,
    )

    costo_gen = costo_limite_blocco(limite_gen, listino)
    limite_completo = listino.gratuito or listino.sovraccarico_ingresso is not None

    limiti = {'branch-quiz': limite_gen}
    costo_totale = costo_gen

    # Validatore incrociato (se abilitato o configurato)
    info_validatore = None
    if con_validatore:
        nome_val = os.getenv('VALIDATION_PROVIDER', '').strip().lower()
        if nome_val and nome_val in FORNITORI and nome_val != fornitore:
            modello_val = os.getenv(f'{nome_val.upper()}_MODEL', '').strip()
            if modello_val:
                try:
                    listino_val = prezzo(carica(PREZZI), nome_val, modello_val)
                except PrezzoMancante as error:
                    raise SpesaRifiuto(
                        'estimate_unavailable',
                        f'Preventivo non disponibile per il validatore incrociato: {error}.',
                    ) from error
                schema_byte_val = pv.byte_utf8(json.dumps(pv.schema_inviato(nome_val, modello_bozza=RisposteValidatore), ensure_ascii=False))
                limite_val = pv.limite_blocco(
                    chunk,
                    nome_val,
                    listino_val.sovraccarico_ingresso,
                    schema_byte=schema_byte_val,
                    istruzioni=ISTRUZIONI_VALIDATORE,
                )
                # Limite dedicato al validatore, con chiave propria: le sue chiamate sono prenotate
                # e regolate come quelle della generazione (FornitoreRegolato, spesa_generazione.py).
                limiti['branch-quiz-validation'] = limite_val
                costo_val = costo_limite_blocco(limite_val, listino_val)
                # Caso peggiore: due generazioni (iniziale + rigenerazione del deficit)
                # e due validazioni (una per giro).
                costo_totale += 2 * costo_val + costo_gen
                if not (listino_val.gratuito or listino_val.sovraccarico_ingresso is not None):
                    limite_completo = False
                info_validatore = {'fornitore': nome_val, 'modello': modello_val, 'limite': limite_val, 'listino': listino_val}

    # Costo atteso realistico (frazione dei massimi teorici per 1 blocco di 3-6 domande)
    costo_atteso = per_eccesso(costo_totale * Decimal('0.35')) if not listino.gratuito else Decimal(0)

    return {
        'chunk': chunk,
        'limite_gen': limite_gen,
        'limiti': limiti,
        'fornitore': fornitore,
        'modello': modello,
        'listino': listino,
        'limiteSuperioreUSD': costo_totale,
        'costoAttesoUSD': costo_atteso,
        'limiteCompleto': limite_completo,
        'validatore': info_validatore,
        'tokenIngressoMassimi': limite_gen.ingresso_massimo_per_tentativo,
        'tokenUscitaMassimi': limite_gen.uscita_massima,
    }


def decidi_quiz(stima: dict, store) -> None:
    """Verifica tetto per corso e budget complessivo, rispondendo 402 se superati."""
    limiti = limiti_configurati()
    massimo = limiti['GENERATION_MAX_USD_PER_COURSE']
    budget = limiti['GENERATION_BUDGET_USD']
    limite = stima['limiteSuperioreUSD']

    if limite > massimo:
        raise SpesaRifiuto(
            'budget_exceeded',
            'Il budget disponibile per questo documento non basta per generare il quiz.',
            status=402,
        )

    speso = registro(store).speso()
    try:
        verifica_avvio(budget, speso, limite, stima['limiteCompleto'])
    except GuardiaRifiuto as error:
        raise SpesaRifiuto(
            'budget_exceeded',
            'Il budget disponibile per questo documento non basta per generare il quiz.',
            status=402,
        ) from error


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
        if not res_fonti.get('blockIds'):
            scarti.append(dict(position=pos, prompt=q.prompt, rule='fonte_non_risolta', message='Fonte non risolta nei blocchi selezionati'))
            scartate_per_fonte += 1
            continue

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

        # 1. Chiamata di generazione con 1 retry in caso di ValidationError bozza
        draft = None
        for attempt in range(2):
            try:
                prima = len(corsa['chiamate'])
                res = regolato._sorvegliato(chunk, lambda: generatore.genera(prompt), voce=dict(ruolo='quiz_ramo', fornitore=stima['fornitore'], modello=stima['modello']))
                regolato._regola(chunk, prima)
                draft = res
                break
            except GenerationError:
                raise
            except (ValidationError, ValueError) as error:
                if attempt == 1:
                    raise GenerationError('invalid_generated_content', f'Bozza quiz non valida: {error}') from error

        # 2. Catena di qualità e validazione
        scarti = []
        accettate = _valida_e_filtra_domande(draft.questions, blocchi, verifica, scarti)

        # 3. Se superstiti < question_count (in particolare se < 3), un solo giro di rigenerazione del deficit
        warnings = []
        if len(accettate) < question_count:
            deficit = question_count - len(accettate)
            prompt_deficit = prompt_quiz_ramo(titolo_ramo, nodi_ramo, blocchi, max(3, deficit))
            try:
                prima = len(corsa['chiamate'])
                draft_def = regolato._sorvegliato(chunk, lambda: generatore.genera(prompt_deficit), voce=dict(ruolo='quiz_ramo', fornitore=stima['fornitore'], modello=stima['modello']))
                regolato._regola(chunk, prima)
                recuperate = _valida_e_filtra_domande(draft_def.questions, blocchi, verifica, scarti)
                accettate.extend(recuperate[:deficit])
            except Exception as ex:
                logger.warning('Rigenerazione deficit quiz non riuscita: %s', ex)

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

        return {
            'questions': domande_finali,
            'scarti': scarti,
            'warnings': warnings,
            'costUsd': _usd(costo_effettivo),
            'validation': {'passed': len(domande_finali), 'discarded': len(scarti)},
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
