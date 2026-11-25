"""Guardia di spesa e stime per il Coach Orale (Voice Recall - TASK-12/13)."""
from __future__ import annotations

import json
import logging
import os
from decimal import Decimal
from typing import Any

from pydantic import ValidationError

from .generation.chunks import Chunk, SourcePiece
from .generation.selection import FORNITORI
from .measurement import preventivo as pv
from .measurement.guardia import GuardiaRifiuto, costo_limite_blocco, verifica_avvio
from .measurement.prezzi import PREZZI, PrezzoMancante, carica, prezzo
from .spesa_generazione import (
    SpesaRifiuto,
    _usd,
    limiti_configurati,
    per_eccesso,
    registro,
)
from .spesa_trascrizione import tariffa_audio
from .voice_recall import ISTRUZIONI_VALUTATORE_ORALE, ValutazioneOraleLLM

logger = logging.getLogger(__name__)


def valuta_voice(
    extraction: dict,
    blocchi: list[dict],
    summary: str,
    key_terms: list[str],
    input_tipo: str,
    durata_secondi: float | None,
    store: Any,
    valutatore_override: Any = None,
) -> dict[str, Any]:
    """Calcola la stima del caso peggiore per trascrizione e valutazione orale."""
    # 1. Trascrizione
    costo_trascrizione = Decimal(0)
    durata_effettiva = 0.0
    if input_tipo == 'audio':
        durata_effettiva = float(durata_secondi or 300.0)
        fornitore_audio = 'groq'
        modello_audio = os.getenv('GROQ_TRANSCRIPTION_MODEL', 'whisper-large-v3-turbo').strip()
        tariffa = tariffa_audio(fornitore_audio, modello_audio)
        if tariffa is None:
            raise SpesaRifiuto(
                'estimate_unavailable',
                f'Preventivo non disponibile: modello audio {fornitore_audio}/{modello_audio} senza prezzo in prezzi.json.',
            )
        usd_per_secondo = Decimal(str(tariffa.get('usdPerSecondo', 0)))
        costo_trascrizione = Decimal(str(round(durata_effettiva, 2))) * usd_per_secondo

    # 2. Valutatore LLM
    nome_val = os.getenv('VOICE_EVAL_PROVIDER', '').strip().lower()
    if not nome_val:
        nome_val = os.getenv('VALIDATION_PROVIDER', '').strip().lower()

    if valutatore_override is not None:
        nome_val = getattr(valutatore_override, 'provider_name', nome_val)

    valutatore_info: dict[str, Any] = {'enabled': False, 'provider': None}
    costo_valutazione = Decimal(0)
    limite_val = None
    limite_completo = True

    if nome_val and (nome_val in FORNITORI or valutatore_override is not None):
        modello_val = ''
        if valutatore_override is not None:
            modello_val = getattr(valutatore_override, 'model', '')
        if not modello_val:
            modello_val = os.getenv(f'{nome_val.upper()}_MODEL', '').strip()

        if modello_val:
            try:
                listino_val = prezzo(carica(PREZZI), nome_val, modello_val)
            except PrezzoMancante as error:
                raise SpesaRifiuto(
                    'estimate_unavailable',
                    f'Preventivo non disponibile per il valutatore orale: {error}.',
                ) from error

            # Prepariamo un chunk con i pezzi sorgente dei blocchi + summary + keyTerms
            pieces = [SourcePiece(b['id'], 0, len(b['text']), b['text']) for b in blocchi]
            testo_extra = f"{summary}\n{' '.join(key_terms)}\n{'a' * 10000}"
            pieces.append(SourcePiece('synth-voice-ctx', 0, len(testo_extra), testo_extra))
            chunk = Chunk('voice-recall-eval', tuple(pieces))

            schema_byte_val = pv.byte_utf8(
                json.dumps(pv.schema_inviato(nome_val, modello_bozza=ValutazioneOraleLLM), ensure_ascii=False)
            )
            from .generation.instructions import materiale

            byte_mat = pv.byte_utf8(materiale(chunk))
            limite_val = pv.LimiteBlocco(
                chunk.id,
                pv.byte_utf8(ISTRUZIONI_VALUTATORE_ORALE),
                byte_mat,
                schema_byte_val,
                listino_val.sovraccarico_ingresso,
                600,
                1,
            )
            # Solo 1 chiamata, nessun retry applicativo
            costo_valutazione = costo_limite_blocco(limite_val, listino_val)
            limite_completo = listino_val.gratuito or listino_val.sovraccarico_ingresso is not None
            valutatore_info = {
                'enabled': True,
                'provider': nome_val,
                'model': modello_val,
                'limite': limite_val,
                'listino': listino_val,
            }

    costo_totale = costo_trascrizione + costo_valutazione

    reg = registro(store)
    speso = reg.speso()
    limiti = limiti_configurati()
    budget = limiti['GENERATION_BUDGET_USD']
    rimanente = max(budget - speso, Decimal(0))
    fits_budget = (speso + costo_totale) <= budget and costo_totale <= limiti['GENERATION_MAX_USD_PER_COURSE']

    return {
        'costoTrascrizioneUsd': _usd(costo_trascrizione),
        'costoValutazioneMaxUsd': _usd(costo_valutazione),
        'maxCostUsd': _usd(costo_totale),
        'costoTotaleDecimal': costo_totale,
        'fitsBudget': fits_budget,
        'remainingBudgetUsd': _usd(rimanente),
        'limiteCompleto': limite_completo,
        'valutatore': valutatore_info,
        'durataSecondi': durata_effettiva,
    }


def decidi_voice(stima: dict[str, Any], store: Any) -> None:
    """Verifica tetto per corso e budget complessivo per la sessione voice recall."""
    limiti = limiti_configurati()
    massimo = limiti['GENERATION_MAX_USD_PER_COURSE']
    budget = limiti['GENERATION_BUDGET_USD']
    limite = stima['costoTotaleDecimal']

    if limite > massimo:
        raise SpesaRifiuto(
            'budget_exceeded',
            'Il budget disponibile per questo corso non basta per la sessione di voice recall.',
            status=402,
        )

    speso = registro(store).speso()
    try:
        verifica_avvio(budget, speso, limite, stima['limiteCompleto'])
    except GuardiaRifiuto as error:
        raise SpesaRifiuto(
            'budget_exceeded',
            'Il budget disponibile non basta per completare la sessione di voice recall.',
            status=402,
        ) from error
