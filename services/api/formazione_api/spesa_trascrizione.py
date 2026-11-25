"""Guardia di spesa e registrazione per la trascrizione audio."""
import os
import uuid
from decimal import Decimal

from .generation.causa import oscura
from .measurement.guardia import GuardiaRifiuto, adesso, verifica_avvio
from .measurement.prezzi import PREZZI, carica
from .spesa_generazione import (
    GENERAZIONE_IN_CORSO,
    SpesaRifiuto,
    limiti_configurati,
    per_eccesso,
    registro,
)


def tariffa_audio(fornitore: str, modello: str) -> dict | None:
    """Legge la tariffa per secondo dal listino prezzi.json."""
    dati = carica(PREZZI)
    audio_prezzi = dati.get('audio', {})
    return audio_prezzi.get(fornitore, {}).get(modello)


def trascrivi_con_tetto(store, durata_secondi: float, chiama, fornitore: str = 'groq', modello: str | None = None, scope: str = 'local'):
    """Esegue la trascrizione audio sotto la guardia di spesa e registra la corsa."""
    mod = modello or os.getenv('GROQ_TRANSCRIPTION_MODEL', 'whisper-large-v3-turbo').strip()
    tariffa = tariffa_audio(fornitore, mod)
    if tariffa is None:
        raise SpesaRifiuto(
            'estimate_unavailable',
            f'Preventivo non disponibile: modello audio {fornitore}/{mod} senza prezzo in prezzi.json.',
        )

    usd_per_secondo = Decimal(str(tariffa.get('usdPerSecondo', 0)))
    stima = Decimal(str(round(durata_secondi, 2))) * usd_per_secondo

    limiti = limiti_configurati()
    budget = limiti['GENERATION_BUDGET_USD']
    reg = registro(store, scope=scope)
    speso = reg.speso()
    scope_kind = 'user' if scope.startswith('user:') else ('global' if scope in ('global', 'local') else None)

    try:
        verifica_avvio(budget, speso, stima, limite_completo=True)
    except GuardiaRifiuto as error:
        raise SpesaRifiuto(
            'over_budget',
            f'Tetto di spesa raggiunto: già prenotati {per_eccesso(speso)} USD su {budget} USD (GENERATION_BUDGET_USD); '
            f'questa trascrizione può costare fino a {per_eccesso(stima)} USD.',
            scope=scope_kind,
        ) from error

    if scope.startswith('user:'):
        speso_globale = registro(store, scope='global').speso()
        try:
            verifica_avvio(budget, speso_globale, stima, limite_completo=True)
        except GuardiaRifiuto as error:
            raise SpesaRifiuto(
                'over_budget',
                f'Tetto di spesa globale di sistema raggiunto: già prenotati {per_eccesso(speso_globale)} USD su {budget} USD (GENERATION_BUDGET_USD).',
                scope='global',
            ) from error

    if not GENERAZIONE_IN_CORSO.acquire(blocking=False):
        raise SpesaRifiuto('generation_in_progress', "Un'altra generazione è in corso: attendere che finisca.", 409)

    try:
        limiti = limiti_configurati()
        speso = reg.speso()
        try:
            verifica_avvio(limiti['GENERATION_BUDGET_USD'], speso, stima, limite_completo=True)
        except GuardiaRifiuto as error:
            raise SpesaRifiuto(
                'over_budget',
                f'Tetto di spesa raggiunto: già prenotati {per_eccesso(speso)} USD su {limiti["GENERATION_BUDGET_USD"]} USD.',
            ) from error

        corsa_id = uuid.uuid4().hex
        chiamata = dict(
            chunkId='audio-1',
            ruolo='trascrizione',
            inizio=adesso(),
            addebitatoUSD=stima,
            esito='in_corso',
        )
        corsa = dict(
            id=corsa_id,
            inizio=adesso(),
            fornitore=fornitore,
            modello=mod,
            budgetUSD=limiti['GENERATION_BUDGET_USD'],
            limitePerCorsoUSD=limiti['GENERATION_MAX_USD_PER_COURSE'],
            limiteSuperioreUSD=stima,
            blocchi=1,
            blocchiRiusati=0,
            blocchiTotali=1,
            addebitatoUSD=stima,
            chiamate=[chiamata],
            esito='in_corso',
        )
        reg.aggiorna_corsa(corsa)

        try:
            risultato = chiama()
            chiamata.update(
                esito='completata',
                fine=adesso(),
                effettivoUSD=stima,
                regolatoUSD=stima,
            )
            corsa.update(
                esito='completata',
                fine=adesso(),
                effettivoUSD=stima,
            )
            reg.aggiorna_corsa(corsa)
            return risultato
        except Exception as error:
            chiamata.update(
                esito='errore',
                fine=adesso(),
                effettivoUSD=stima,
                regolatoUSD=stima,
                errore=getattr(error, 'code', type(error).__name__),
            )
            corsa.update(
                esito='fallita',
                fine=adesso(),
                effettivoUSD=stima,
                errore=dict(code=getattr(error, 'code', type(error).__name__), message=oscura(str(error))),
            )
            reg.aggiorna_corsa(corsa)
            raise
    finally:
        GENERAZIONE_IN_CORSO.release()
