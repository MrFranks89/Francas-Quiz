"""Tetto di spesa della generazione dall'app: preventivo, limiti del server e registro cumulativo.

Il preventivo è quello dello strumento di misura, non una copia: stessa pianificazione dei blocchi
(measurement.preventivo.pianifica), stesso limite superiore per blocco con la quota per chiamata
misurata (preventivo_corsa), stessi prezzi (measurement.prezzi, tests/corpus/prezzi.json).
Anche il registro e l'arresto a metà generazione sono quelli della misura (measurement.guardia):
limite del blocco prenotato prima della chiamata, costo effettivo registrato dopo, generazioni
fallite comprese. Cambia solo il file del registro, separato da quello delle misure.

Una sola funzione, `valuta`, decide sia ciò che il pannello mostra sia ciò che la rotta applica:
il costo mostrato non può essere diverso da quello controllato.
"""
import os
import threading
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from pathlib import Path

from .generation import GenerationError, generate
from .generation.selection import config_status, create_provider, selected_name
from .measurement import preventivo as pv
from .measurement.guardia import FornitoreSorvegliato, GuardiaRifiuto, Registro, adesso, verifica_avvio
from .measurement.prezzi import PrezzoMancante, carica, prezzo

# Unico punto dei valori predefiniti, in USD; documentati in docs/GENERAZIONE.md e restituiti da
# GET /generation/config (campo `spending`).
PREDEFINITI = {'GENERATION_MAX_USD_PER_COURSE': Decimal('0.50'), 'GENERATION_BUDGET_USD': Decimal('5.00')}

PREZZI = Path(__file__).resolve().parents[3] / 'tests' / 'corpus' / 'prezzi.json'
NOME_REGISTRO = 'registro-spesa-app.json'

# Una generazione alla volta per processo: il registro è riletto prima di ogni blocco, ma due
# generazioni simultanee potrebbero leggere la stessa spesa e superare insieme il tetto.
GENERAZIONE_IN_CORSO = threading.Lock()


class SpesaRifiuto(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code, self.status = code, status


def _usd(valore: Decimal) -> str:
    return str(valore)


def per_eccesso(valore: Decimal) -> Decimal:
    """Al centesimo superiore: il costo mostrato resta un massimo anche arrotondato."""
    return valore.quantize(Decimal('0.01'), rounding=ROUND_CEILING)


def limiti_configurati() -> dict[str, Decimal]:
    """Limiti dalle variabili d'ambiente del processo server; assenti → PREDEFINITI. Un valore
    non numerico o negativo non viene sostituito dal predefinito: è rifiutato."""
    limiti = {}
    for nome, predefinito in PREDEFINITI.items():
        grezzo = os.getenv(nome, '').strip()
        try:
            valore = Decimal(grezzo) if grezzo else predefinito
        except InvalidOperation:
            valore = None
        if valore is None or not valore.is_finite() or valore < 0:
            raise SpesaRifiuto('invalid_spending_limit', f'{nome} deve essere un importo in USD maggiore o uguale a zero')
        limiti[nome] = valore
    return limiti


def registro(store) -> Registro:
    return Registro(Path(store.root) / NOME_REGISTRO)


def configurazione_spesa(store) -> dict:
    """Parte `spending` di GET /generation/config."""
    voce = {'defaults': {k: _usd(v) for k, v in PREDEFINITI.items()}, 'spentUsd': _usd(registro(store).speso())}
    try:
        limiti = limiti_configurati()
    except SpesaRifiuto as rifiuto:
        return {**voce, 'error': {'code': rifiuto.code, 'message': str(rifiuto)}}
    return {**voce, 'maxUsdPerCourse': _usd(limiti['GENERATION_MAX_USD_PER_COURSE']),
            'budgetUsd': _usd(limiti['GENERATION_BUDGET_USD'])}


def fornitore_e_modello(provider) -> tuple[str | None, str | None]:
    """Il fornitore che riceverà le chiamate: quello iniettato in app.state (test e verifiche,
    come in test_generation_http.py) oppure quello scelto con GENERATION_PROVIDER e <FORNITORE>_MODEL,
    la stessa convenzione di selection.create_provider() e di measurement.corsa.ambiente_fornitore."""
    if provider is not None:
        return getattr(provider, 'provider_name', None), getattr(provider, 'model', None)
    nome = selected_name()
    if nome is None:
        return None, None
    return nome, os.getenv(f'{nome.upper()}_MODEL', '').strip() or None


def _non_configurato() -> SpesaRifiuto:
    stato = config_status()
    variabili = stato.get('missing') or stato.get('invalid') or []
    return SpesaRifiuto('not_configured', f"Configurare {' e '.join(variabili)} nel processo server", 503)


def valuta(extraction: dict, provider, store) -> dict:
    """Preventivo e decisione, senza chiamare fornitori. Restituisce la stima completa (con i
    limiti per blocco usati da FornitoreSorvegliato); solleva SpesaRifiuto se la generazione non
    può partire. Ordine dei controlli come measurement.corsa.esegui_selezione."""
    if provider is None and not config_status()['configured']:
        raise _non_configurato()
    fornitore, modello = fornitore_e_modello(provider)
    if not fornitore or not modello:
        raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: fornitore o modello non dichiarati. '
                                                   'Nessuna generazione senza costo massimo.')
    try:
        listino = prezzo(carica(PREZZI), fornitore, modello)
    except PrezzoMancante as error:
        raise SpesaRifiuto('estimate_unavailable', f'Preventivo non disponibile: {error}.') from error
    try:
        chunks = pv.pianifica(extraction.get('blocks', []))
    except GenerationError as error:
        raise SpesaRifiuto(error.code, str(error)) from error
    stima = pv.preventivo_corsa(chunks, listino)
    if not stima['limiteCompleto']:
        raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: quota per chiamata del fornitore '
                                                   'non misurata (sovraccaricoIngressoPerChiamata in prezzi.json).')
    if stima['oltreSogliaContestoLungo']:
        raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: un blocco supera la soglia del '
                                                   'contesto lungo, oltre la quale il prezzo registrato non vale.')
    return {**stima, 'listino': listino}


def decidi(stima: dict, store) -> dict:
    """Limiti del server sulla stima: per corso, poi cumulativo con verifica_avvio della guardia."""
    limiti = limiti_configurati()
    massimo, budget = limiti['GENERATION_MAX_USD_PER_COURSE'], limiti['GENERATION_BUDGET_USD']
    limite = stima['limiteSuperioreUSD']
    if limite > massimo:
        raise SpesaRifiuto('over_course_limit', f'Costo massimo {per_eccesso(limite)} USD oltre il limite per corso '
                                                f'di {massimo} USD (GENERATION_MAX_USD_PER_COURSE). '
                                                'Ridurre le pagine selezionate.')
    speso = registro(store).speso()
    try:
        verifica_avvio(budget, speso, limite, stima['limiteCompleto'])
    except GuardiaRifiuto as error:
        raise SpesaRifiuto('over_budget', f'Tetto di spesa raggiunto: già prenotati {per_eccesso(speso)} USD su '
                                          f'{budget} USD (GENERATION_BUDGET_USD); questa generazione può costare '
                                          f'fino a {per_eccesso(limite)} USD.') from error
    return {'maxUsdPerCourse': massimo, 'budgetUsd': budget, 'spentUsd': speso}


def preventivo_pubblico(extraction: dict, provider, store) -> dict:
    """Risposta di GET /extractions/{id}/generation-estimate: ciò che il pannello mostra."""
    try:
        stima = valuta(extraction, provider, store)
    except SpesaRifiuto as rifiuto:
        return {'available': False, 'allowed': False, 'refusal': {'code': rifiuto.code, 'message': str(rifiuto)}}
    voce = {'available': True, 'provider': stima['fornitore'], 'model': stima['modello'], 'chunks': stima['blocchi'],
            'maxCalls': stima['chiamateMassime'], 'upperBoundUsd': _usd(stima['limiteSuperioreUSD']),
            'maxCostUsd': _usd(per_eccesso(stima['limiteSuperioreUSD']))}
    try:
        limiti = decidi(stima, store)
    except SpesaRifiuto as rifiuto:
        return {**voce, 'allowed': False, 'refusal': {'code': rifiuto.code, 'message': str(rifiuto)}}
    return {**voce, 'allowed': True, 'limits': {k: _usd(v) for k, v in limiti.items()}}


def genera_con_tetto(extraction: dict, provider, store, corsa_id: str, **opzioni) -> dict:
    """Generazione con preventivo, limiti e registro. Il fornitore reale si crea solo dopo che i
    limiti hanno autorizzato la generazione, come in measurement.corsa.esegui_selezione."""
    stima = valuta(extraction, provider, store)
    decidi(stima, store)
    if not GENERAZIONE_IN_CORSO.acquire(blocking=False):
        raise SpesaRifiuto('generation_in_progress', "Un'altra generazione è in corso: attendere che finisca.", 409)
    try:
        # Ricontrollo sotto il lucchetto: la spesa registrata può essere cambiata nel frattempo.
        limiti = decidi(stima, store)
        reg = registro(store)
        corsa = dict(id=corsa_id, inizio=adesso(), documento=extraction.get('documentId'), fornitore=stima['fornitore'],
                     modello=stima['modello'], budgetUSD=limiti['budgetUsd'], limitePerCorsoUSD=limiti['maxUsdPerCourse'],
                     limiteSuperioreUSD=stima['limiteSuperioreUSD'], blocchi=stima['blocchi'],
                     addebitatoUSD=Decimal(0), chiamate=[], esito='in_corso')
        reg.aggiorna_corsa(corsa)
        try:
            sorvegliato = FornitoreSorvegliato(provider if provider is not None else create_provider(),
                                               {l.chunk_id: l for l in stima['limiti']}, stima['listino'],
                                               limiti['budgetUsd'], reg, corsa)
            risultato = generate(extraction, sorvegliato, **opzioni)
            corsa['esito'] = 'completata'
            return risultato
        except GenerationError as error:
            corsa['esito'] = 'arrestata' if error.code == 'budget_guard' else 'fallita'
            corsa['errore'] = dict(code=error.code, message=str(error))
            raise
        except Exception as error:  # registrata comunque: anche le generazioni fallite costano
            corsa['esito'] = 'fallita'
            corsa['errore'] = dict(code=type(error).__name__, message=str(error))
            raise
        finally:
            effettivi = [c.get('effettivoUSD') for c in corsa['chiamate']]
            corsa.update(fine=adesso(),
                         effettivoUSD=sum(effettivi, Decimal(0)) if all(e is not None for e in effettivi) else None)
            reg.aggiorna_corsa(corsa)
    finally:
        GENERAZIONE_IN_CORSO.release()
