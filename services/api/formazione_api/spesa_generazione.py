"""Tetto di spesa della generazione dall'app: preventivo, limiti del server e registro cumulativo.

Il preventivo è quello dello strumento di misura, non una copia: stessa pianificazione dei blocchi
(measurement.preventivo.pianifica), stesso limite superiore per blocco con la quota per chiamata
misurata (preventivo_corsa), stessi prezzi (measurement.prezzi, formazione_api/config/prezzi.json).
Anche il registro e l'arresto a metà generazione sono quelli della misura (measurement.guardia):
limite del blocco prenotato prima della chiamata, costo effettivo registrato dopo, generazioni
fallite comprese. Cambiano il file del registro, separato da quello delle misure, e la regolazione:
dopo ogni chiamata completata con i contatori del fornitore la prenotazione del blocco è sostituita
da un importo regolato (importo_regolato), che resta un maggiorante della spesa reale. Il registro
dello strumento di misura resta prudente: somma sempre i prenotati.

Una sola funzione, `valuta`, decide sia ciò che il pannello mostra sia ciò che la rotta applica:
il costo mostrato non può essere diverso da quello controllato.
"""
import os
import threading
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from pathlib import Path

from .generation import GenerationError, generate
from .generation.causa import oscura
from .generation.selection import FORNITORI, config_status, create_provider, selected_name
from .generation.validazione import create_validator
from .measurement import preventivo as pv
from .measurement.guardia import FornitoreSorvegliato, GuardiaRifiuto, Registro, adesso, verifica_avvio
from .measurement.prezzi import PREZZI, Prezzo, PrezzoMancante, carica, prezzo
from .ripresa_generazione import Ripresa, impronta_comune
from .account.percorsi import radice_utente

# Unico punto dei valori predefiniti, in USD; documentati in docs/GENERAZIONE.md e restituiti da
# GET /generation/config (campo `spending`).
PREDEFINITI = {'GENERATION_MAX_USD_PER_COURSE': Decimal('0.50'), 'GENERATION_BUDGET_USD': Decimal('5.00')}

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


def importo_regolato(usage: dict | None, limite: pv.LimiteBlocco, listino: Prezzo) -> Decimal | None:
    """Maggiorante della spesa reale di un blocco completato, al posto del suo limite prenotato.
    Include l'ultimo tentativo alle tariffe del preventivo e i tentativi precedenti (retriesTaken)
    calcolati al limite per tentativo del preventivo. Contatori assenti o oltre soglia -> None."""
    if not usage:
        return None
    entrata, uscita = usage.get('inputTokens'), usage.get('outputTokens')
    if entrata is None or uscita is None:
        return None
    if entrata > limite.ingresso_massimo_per_tentativo or uscita > limite.uscita_massima:
        return None
    # Tentativi precedenti: quelli davvero inviati, se il fornitore li dichiara (`retriesTaken`, letto da
    # `retries_taken` della risposta grezza dello SDK, generation/telemetry.chiama_con_tentativi);
    # altrimenti tutti quelli possibili (limite.tentativi - 1 = MAX_RETRIES). Un valore non intero o
    # fuori da 0..MAX_RETRIES smentisce il maggiorante → None, resta il prenotato.
    ripetuti = usage.get('retriesTaken')
    if ripetuti is None:
        ripetuti = limite.tentativi - 1
    elif type(ripetuti) is not int or not 0 <= ripetuti <= limite.tentativi - 1:
        return None
    ultimo = pv.costo_tentativo(entrata, uscita, listino)
    precedenti = pv.costo_tentativo(limite.ingresso_massimo_per_tentativo, limite.uscita_massima, listino)         * ripetuti
    return ultimo + precedenti


def _decimale(valore) -> Decimal:
    return Decimal(str(valore))


def importo_corsa(corsa: dict) -> Decimal:
    """Ciò che una generazione pesa sul tetto: il prenotato meno, per ogni chiamata regolata, la
    differenza fra prenotato e regolato. Voci senza regolatoUSD (in corso, fallite, senza contatori o
    scritte prima della regolazione) restano conteggiate per il prenotato: nessuna migrazione."""
    totale = _decimale(corsa.get('addebitatoUSD', 0))
    for chiamata in corsa.get('chiamate') or []:
        if chiamata.get('regolatoUSD') is not None:
            totale -= _decimale(chiamata['addebitatoUSD']) - _decimale(chiamata['regolatoUSD'])
    return totale


class RegistroApp(Registro):
    """Registro dell'app: stesso file e stesse voci della guardia, ma `speso` somma gli importi
    regolati. È ciò che leggono verifica_avvio (decidi), il controllo prima di ogni blocco
    (FornitoreSorvegliato.module, che chiama self.registro.speso()) e GET /generation/config."""

    def speso(self) -> Decimal:
        return sum((importo_corsa(c) for c in self.leggi()['corse']), Decimal(0))

    def prenotato(self) -> Decimal:
        return super().speso()

    def aggiorna_corsa(self, corsa: dict) -> None:
        # Ricalcolato a ogni scrittura: il totale della corsa non può restare indietro rispetto alle chiamate.
        corsa['regolatoUSD'] = importo_corsa(corsa)
        super().aggiorna_corsa(corsa)


class FornitoreRegolato(FornitoreSorvegliato):
    """FornitoreSorvegliato della misura, invariato; dopo ogni chiamata completata con i contatori
    del fornitore scrive regolatoUSD accanto al prenotato (addebitatoUSD) e all'effettivo."""

    def module(self, chunk):
        prima = len(self.corsa['chiamate'])
        try:
            return super().module(chunk)
        finally:
            self._regola(chunk, prima)

    def _regola(self, chunk, prima: int):
        # Nessuna chiamata aggiunta = arresto prima del blocco: niente da regolare.
        if len(self.corsa['chiamate']) <= prima:
            return
        chiamata = self.corsa['chiamate'][-1]
        regolato = None
        if chiamata.get('esito') == 'completata' and not chiamata.get('violazioneLimite'):
            regolato = importo_regolato(chiamata.get('usage'), self.limiti[chunk.id], self.prezzo)
        if regolato is not None:
            chiamata['regolatoUSD'] = regolato
            self.registro.aggiorna_corsa(self.corsa)


class ValidatoreRegolato(FornitoreRegolato):
    """Validatore incrociato sotto la stessa guardia: la sua chiamata per blocco (rispondere alla
    cieca alle domande accettate) prenota lo stesso limite del blocco, ingresso dominato dallo
    stesso materiale e uscita molto minore, alle tariffe del SUO fornitore (prezzi.json)."""

    def verifica(self, chunk, domande):
        prima = len(self.corsa['chiamate'])
        try:
            # Stessa guardia di module() (FornitoreSorvegliato._sorvegliato); la voce nel registro dice
            # che è la chiamata del validatore, con il suo fornitore e modello.
            return self._sorvegliato(chunk, lambda: self.interno.verifica(chunk, domande),
                                     voce=dict(ruolo='validazione', fornitore=self.provider_name, modello=self.model))
        finally:
            self._regola(chunk, prima)


def registro(store, scope: str = 'local') -> RegistroApp:
    base = getattr(store, 'base_root', getattr(store, 'root', store))
    if scope == 'local':
        file_path = Path(getattr(store, 'root', base)) / NOME_REGISTRO
    elif scope.startswith('user:'):
        uid = scope.split(':', 1)[1]
        file_path = radice_utente(uid, base) / NOME_REGISTRO
    elif scope == 'global':
        file_path = Path(base) / f'global_{NOME_REGISTRO}'
    else:
        file_path = Path(getattr(store, 'root', base)) / f'{scope}_{NOME_REGISTRO}'
    return RegistroApp(file_path)


def configurazione_spesa(store, scope: str = 'local') -> dict:
    """Parte `spending` di GET /generation/config."""
    reg = registro(store, scope=scope)
    speso = reg.speso()
    voce = {'defaults': {k: _usd(v) for k, v in PREDEFINITI.items()}, 'spentUsd': _usd(speso),
            'reservedUsd': _usd(reg.prenotato())}
    try:
        limiti = limiti_configurati()
    except SpesaRifiuto as rifiuto:
        return {**voce, 'error': {'code': rifiuto.code, 'message': str(rifiuto)}}
    budget = limiti['GENERATION_BUDGET_USD']
    return {**voce, 'maxUsdPerCourse': _usd(limiti['GENERATION_MAX_USD_PER_COURSE']), 'budgetUsd': _usd(budget),
            'remainingUsd': _usd(max(budget - speso, Decimal(0)))}


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


def valuta(extraction: dict, provider, store, escluse=(), ricomincia: bool = False) -> dict:
    """Preventivo e decisione, senza chiamare fornitori. Restituisce la stima completa (con i
    limiti per blocco usati da FornitoreSorvegliato); solleva SpesaRifiuto se la generazione non
    può partire. Ordine dei controlli come measurement.corsa.esegui_selezione.

    Ripresa (ripresa_generazione.py): gli importi contano solo i blocchi da generare, cioè quelli
    senza una voce salvata con la stessa impronta (`escluse`: pagine escluse, parte dell'impronta;
    `ricomincia`: richiesta `restart`, nessun blocco riusato). I controlli di disponibilità del
    preventivo restano su tutti i blocchi, come prima. Senza blocchi salvati la stima è quella di
    sempre. La stima porta `blocchiSalvati`, `blocchiTotali` e la `ripresa` da passare a generate()."""
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
    # Validatore incrociato attivo (VALIDATION_PROVIDER): una chiamata per blocco con lo stesso
    # limite in token della generazione (l'ingresso è dominato dallo stesso materiale), alle
    # tariffe del suo fornitore; il suo limite superiore si somma a quello della generazione,
    # così il tetto per corso e il pannello contano entrambe le chiamate.
    nome_validatore = os.getenv('VALIDATION_PROVIDER', '').strip().lower()
    validatore = None
    if nome_validatore:
        if nome_validatore not in FORNITORI:
            raise SpesaRifiuto('not_configured', f"VALIDATION_PROVIDER deve essere {' oppure '.join(FORNITORI)}", 503)
        if nome_validatore == fornitore:
            raise SpesaRifiuto('invalid_validation_provider', 'VALIDATION_PROVIDER deve essere diverso da '
                                                              'GENERATION_PROVIDER: il controllo incrociato richiede '
                                                              'un fornitore indipendente.')
        modello_validatore = os.getenv(f'{nome_validatore.upper()}_MODEL', '').strip()
        if not modello_validatore:
            raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: modello del validatore non '
                                                       f'dichiarato ({nome_validatore.upper()}_MODEL).')
        try:
            listino_validatore = prezzo(carica(PREZZI), nome_validatore, modello_validatore)
        except PrezzoMancante as error:
            raise SpesaRifiuto('estimate_unavailable', f'Preventivo non disponibile: {error}.') from error
        stima_validatore = pv.preventivo_corsa(chunks, listino_validatore)
        if not stima_validatore['limiteCompleto']:
            raise SpesaRifiuto('estimate_unavailable', 'Preventivo non disponibile: quota per chiamata del fornitore '
                                                       'di validazione non misurata (sovraccaricoIngressoPerChiamata in prezzi.json).')
        validatore = (nome_validatore, modello_validatore, listino_validatore)
    ripresa = Ripresa(store.root, extraction.get('id'),
                      impronta_comune(fornitore, modello, validatore and validatore[:2], escluse),
                      chunks, ignora_salvati=ricomincia)
    da_generare = ripresa.da_generare(chunks)
    if len(da_generare) != len(chunks):
        # Importi sui soli blocchi da generare; con tutti da generare restano quelli già calcolati.
        stima = pv.preventivo_corsa(da_generare, listino)
        if validatore:
            stima_validatore = pv.preventivo_corsa(da_generare, validatore[2])
    stima.update(blocchiTotali=len(chunks), blocchiSalvati=len(chunks) - len(da_generare), ripresa=ripresa)
    if validatore:
        stima['limiteSuperioreUSD'] += stima_validatore['limiteSuperioreUSD']
        stima['tokenIngressoMassimi'] += stima_validatore['tokenIngressoMassimi']
        stima['tokenUscitaMassimi'] += stima_validatore['tokenUscitaMassimi']
        stima['chiamateMassime'] += stima_validatore['chiamateMassime']
        stima['validazione'] = {'fornitore': nome_validatore, 'modello': modello_validatore,
                                'limiteSuperioreUSD': stima_validatore['limiteSuperioreUSD']}
        stima['listinoValidazione'] = listino_validatore
    return {**stima, 'listino': listino}


def decidi(stima: dict, store, scope: str = 'local') -> dict:
    """Limiti del server sulla stima: per corso, poi cumulativo con verifica_avvio della guardia."""
    limiti = limiti_configurati()
    massimo, budget = limiti['GENERATION_MAX_USD_PER_COURSE'], limiti['GENERATION_BUDGET_USD']
    limite = stima['limiteSuperioreUSD']
    if limite > massimo:
        raise SpesaRifiuto('over_course_limit', f'Costo massimo {per_eccesso(limite)} USD oltre il limite per corso '
                                                f'di {massimo} USD (GENERATION_MAX_USD_PER_COURSE). '
                                                'Ridurre le pagine selezionate.')
    speso = registro(store, scope=scope).speso()
    try:
        verifica_avvio(budget, speso, limite, stima['limiteCompleto'])
    except GuardiaRifiuto as error:
        raise SpesaRifiuto('over_budget', f'Tetto di spesa raggiunto: già prenotati {per_eccesso(speso)} USD su '
                                          f'{budget} USD (GENERATION_BUDGET_USD); questa generazione può costare '
                                          f'fino a {per_eccesso(limite)} USD.') from error
    return {'maxUsdPerCourse': massimo, 'budgetUsd': budget, 'spentUsd': speso}


def preventivo_pubblico(extraction: dict, provider, store, escluse=(), scope: str = 'local') -> dict:
    """Risposta di GET /extractions/{id}/generation-estimate."""
    try:
        stima = valuta(extraction, provider, store, escluse)
    except SpesaRifiuto as rifiuto:
        return {'available': False, 'allowed': False, 'refusal': {'code': rifiuto.code, 'message': str(rifiuto)}}
    voce = {'available': True, 'provider': stima['fornitore'], 'model': stima['modello'], 'chunks': stima['blocchi'],
            'savedChunks': stima['blocchiSalvati'], 'totalChunks': stima['blocchiTotali'],
            'maxCalls': stima['chiamateMassime'], 'upperBoundUsd': _usd(stima['limiteSuperioreUSD']),
            'maxCostUsd': _usd(per_eccesso(stima['limiteSuperioreUSD']))}
    try:
        limiti = decidi(stima, store, scope=scope)
    except SpesaRifiuto as rifiuto:
        return {**voce, 'allowed': False, 'refusal': {'code': rifiuto.code, 'message': str(rifiuto)}}
    return {**voce, 'allowed': True, 'limits': {k: _usd(v) for k, v in limiti.items()}}


def genera_con_tetto(extraction: dict, provider, store, corsa_id: str, escluse=(), ricomincia: bool = False,
                     scope: str = 'local', **opzioni) -> dict:
    """Generazione con preventivo, limiti e registro."""
    stima = valuta(extraction, provider, store, escluse, ricomincia)
    decidi(stima, store, scope=scope)
    if not GENERAZIONE_IN_CORSO.acquire(blocking=False):
        raise SpesaRifiuto('generation_in_progress', "Un'altra generazione è in corso: attendere che finisca.", 409)
    try:
        limiti = decidi(stima, store, scope=scope)
        if ricomincia:
            stima['ripresa'].ricomincia()
        reg = registro(store, scope=scope)
        corsa = dict(id=corsa_id, inizio=adesso(), documento=extraction.get('documentId'), fornitore=stima['fornitore'],
                     modello=stima['modello'], budgetUSD=limiti['budgetUsd'], limitePerCorsoUSD=limiti['maxUsdPerCourse'],
                     limiteSuperioreUSD=stima['limiteSuperioreUSD'], blocchi=stima['blocchi'],
                     blocchiRiusati=stima['blocchiSalvati'], blocchiTotali=stima['blocchiTotali'],
                     addebitatoUSD=Decimal(0), chiamate=[], esito='in_corso')
        reg.aggiorna_corsa(corsa)
        try:
            sorvegliato = FornitoreRegolato(provider if provider is not None else create_provider(),
                                               {l.chunk_id: l for l in stima['limiti']}, stima['listino'],
                                               limiti['budgetUsd'], reg, corsa)
            validatore = None
            if stima.get('validazione'):
                validatore = ValidatoreRegolato(create_validator(), {l.chunk_id: l for l in stima['limiti']},
                                                stima['listinoValidazione'], limiti['budgetUsd'], reg, corsa)
            risultato = generate(extraction, sorvegliato, validator=validatore, ripresa=stima['ripresa'], **opzioni)
            corsa['esito'] = 'completata'
            return risultato
        except GenerationError as error:
            corsa['esito'] = 'arrestata' if error.code == 'budget_guard' else 'fallita'
            corsa['errore'] = dict(code=error.code, message=oscura(str(error)))
            raise
        except Exception as error:
            corsa['esito'] = 'fallita'
            corsa['errore'] = dict(code=type(error).__name__, message=oscura(str(error)))
            raise
        finally:
            effettivi = [c.get('effettivoUSD') for c in corsa['chiamate']]
            corsa.update(fine=adesso(),
                          effettivoUSD=sum(effettivi, Decimal(0)) if all(e is not None for e in effettivi) else None)
            reg.aggiorna_corsa(corsa)
    finally:
        GENERAZIONE_IN_CORSO.release()


def genera_mappa_con_tetto(extraction: dict, provider, store, corsa_id: str, escluse=(), scope: str = 'local') -> dict:
    from .spesa_mappa import genera_mappa_con_tetto as _genera_mappa
    return _genera_mappa(extraction, provider, store, corsa_id, escluse=escluse, scope=scope)


def trascrivi_con_tetto(store, durata_secondi: float, chiama, scope: str = 'local', **kwargs):
    from .spesa_trascrizione import trascrivi_con_tetto as _trascrivi
    return _trascrivi(store, durata_secondi, chiama, scope=scope, **kwargs)


