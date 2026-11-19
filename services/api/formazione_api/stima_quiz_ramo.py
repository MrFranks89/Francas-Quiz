"""Stima di spesa e verifica del budget per i quiz mirati di ramo."""
import json
import logging
import os
from decimal import Decimal

from .generation.branch_quiz import BranchQuizDraft, ISTRUZIONI_QUIZ_RAMO
from .generation.chunks import Chunk, SourcePiece
from .generation.selection import config_status
from .generation.validazione import ISTRUZIONI_VALIDATORE, RisposteValidatore
from .measurement import preventivo as pv
from .measurement.guardia import GuardiaRifiuto, costo_limite_blocco, verifica_avvio
from .measurement.prezzi import PREZZI, PrezzoMancante, carica, prezzo
from .spesa_generazione import (
    FORNITORI,
    SpesaRifiuto,
    _non_configurato,
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
    costo_totale = 2 * costo_gen

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
                limiti['branch-quiz-validation'] = limite_val
                costo_val = costo_limite_blocco(limite_val, listino_val)
                # Caso peggiore: due generazioni (iniziale + rigenerazione del deficit)
                # e due validazioni se il validatore è attivo.
                costo_totale += 2 * costo_val
                if not (listino_val.gratuito or listino_val.sovraccarico_ingresso is not None):
                    limite_completo = False
                info_validatore = {'fornitore': nome_val, 'modello': modello_val, 'limite': limite_val, 'listino': listino_val}

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
