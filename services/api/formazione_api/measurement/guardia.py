"""Tetto di spesa: decisione di avvio, registro cumulativo e arresto a metà corsa.

Due importi per ogni chiamata:
- `addebitatoUSD`: il limite superiore del blocco (tutti i tentativi), riservato nel registro PRIMA
  della chiamata. È l'importo che la guardia somma: i retry interni allo SDK non sono visibili nei
  contatori d'uso, quindi il costo dichiarato può essere inferiore a quello fatturato; il limite no.
  Se il processo cade durante la chiamata, la riserva è già scritta.
- `effettivoUSD`: token dichiarati dal fornitore × prezzi; è la misura, None se un contatore manca.
"""
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from ..generation.causa import LUNGHEZZA_MASSIMA, oscura
from ..generation.errors import GenerationError
from .preventivo import LimiteBlocco, costo_limite_blocco
from .prezzi import MILIONE, Prezzo


class GuardiaRifiuto(ValueError):
    pass


def verifica_avvio(budget: Decimal, speso: Decimal, limite_corsa: Decimal, limite_completo: bool = True) -> None:
    """Una corsa reale parte solo se budget > 0 e speso + limite superiore della corsa ≤ budget."""
    if budget <= 0:
        raise GuardiaRifiuto('Budget zero: nessuna corsa reale. Usare il preventivo.')
    if not limite_completo:
        raise GuardiaRifiuto('Limite superiore incompleto: quota d\'ingresso aggiunta dal fornitore non pubblicata '
                             '(sovraccaricoIngressoPerChiamata in prezzi.json). Nessuna corsa reale.')
    if speso + limite_corsa > budget:
        raise GuardiaRifiuto(f'Spesa registrata {speso} + limite della corsa {limite_corsa} > budget {budget} USD')


def costo_effettivo(usage: dict | None, prezzo: Prezzo) -> Decimal | None:
    """Token reali × prezzi. inputTokens è il totale, cachedInputTokens la sua parte letta dalla cache
    (stessa semantica per i due fornitori, docs/GENERAZIONE.md). Contatore assente → None, non zero."""
    if not usage:
        return None
    entrata, uscita, cache = usage.get('inputTokens'), usage.get('outputTokens'), usage.get('cachedInputTokens')
    if entrata is None or uscita is None:
        return None
    cache = cache or 0
    # Tariffe standard: i fornitori non impostano endpoint regionali (il moltiplicatore vale solo per il limite).
    return (Decimal(entrata - cache) * prezzo.ingresso + Decimal(cache) * prezzo.ingresso_cache
            + Decimal(uscita) * prezzo.uscita) / MILIONE


def _decimale(valore):
    return str(valore) if isinstance(valore, Decimal) else valore


class Registro:
    """Registro cumulativo della spesa in JSON; riscritto per intero a ogni modifica (file temporaneo + replace)."""

    def __init__(self, path: Path):
        self.path = Path(path)

    def leggi(self) -> dict:
        if not self.path.exists():
            return {'schemaVersion': 1, 'valuta': 'USD', 'corse': []}
        return json.loads(self.path.read_text(encoding='utf-8'), parse_float=Decimal)

    def speso(self) -> Decimal:
        return sum((Decimal(str(c.get('addebitatoUSD', 0))) for c in self.leggi()['corse']), Decimal(0))

    def _scrivi(self, dati: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporaneo = self.path.with_suffix('.tmp')
        temporaneo.write_text(json.dumps(dati, ensure_ascii=False, indent=2, default=_decimale), encoding='utf-8')
        os.replace(temporaneo, self.path)

    def aggiorna_corsa(self, corsa: dict) -> None:
        dati = self.leggi()
        dati['corse'] = [c for c in dati['corse'] if c['id'] != corsa['id']] + [corsa]
        self._scrivi(dati)


def dettaglio_errore(error: BaseException) -> str:
    """Testo di un'eccezione per il registro: prima il filtro dei segreti (generation/causa.oscura), poi il
    taglio a LUNGHEZZA_MASSIMA, così un taglio a metà di una chiave non sfugge al filtro (come causa._pulito)."""
    testo = oscura(str(error))
    return testo if len(testo) <= LUNGHEZZA_MASSIMA else testo[:LUNGHEZZA_MASSIMA - 1] + '…'


def adesso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class FornitoreSorvegliato:
    """Avvolge il fornitore reale passato a generate(): prima di ogni blocco ricontrolla il budget
    con il registro riletto dal disco (anche altre corse possono averlo aggiornato) e, se il blocco
    potrebbe sforare, si ferma sollevando GenerationError: la pipeline interrompe la corsa."""

    def __init__(self, interno, limiti: dict[str, LimiteBlocco], prezzo: Prezzo, budget: Decimal,
                 registro: Registro, corsa: dict):
        self.interno, self.limiti, self.prezzo, self.budget = interno, limiti, prezzo, budget
        self.registro, self.corsa = registro, corsa
        self.violazione = None

    # Metadati letti da generation/telemetry.call_usage: si delega al fornitore reale.
    @property
    def provider_name(self):
        return getattr(self.interno, 'provider_name', None)

    @property
    def model(self):
        return getattr(self.interno, 'model', None)

    @property
    def last_usage(self):
        return getattr(self.interno, 'last_usage', None)

    def _ferma(self, motivo: str):
        self.corsa['arresto'] = motivo
        self.registro.aggiorna_corsa(self.corsa)
        raise GenerationError('budget_guard', motivo)

    def module(self, chunk):
        return self._sorvegliato(chunk, lambda: self.interno.module(chunk))

    def _sorvegliato(self, chunk, chiama, voce: dict | None = None):
        """Una chiamata del blocco sotto la guardia: controllo, prenotazione, `chiama()`, registrazione.
        Usata da module() e dal validatore incrociato (spesa_generazione.ValidatoreRegolato.verifica).
        `voce`: campi aggiunti alla voce della chiamata nel registro (per il validatore: ruolo,
        fornitore, modello); assente per module(), la cui voce resta quella di sempre."""
        limite = self.limiti[chunk.id]
        if self.violazione:
            self._ferma(self.violazione)
        riserva = costo_limite_blocco(limite, self.prezzo)
        speso = self.registro.speso()
        if speso + riserva > self.budget:
            self._ferma(f'Arresto prima di {chunk.id}: speso {speso} + limite del blocco {riserva} > budget {self.budget} USD')
        chiamata = dict(chunkId=chunk.id, **(voce or {}), inizio=adesso(), addebitatoUSD=riserva, esito='in_corso')
        self.corsa['chiamate'].append(chiamata)
        self.corsa['addebitatoUSD'] = Decimal(str(self.corsa['addebitatoUSD'])) + riserva
        self.registro.aggiorna_corsa(self.corsa)
        try:
            risultato = chiama()
            chiamata['esito'] = 'completata'
            return risultato
        except Exception as error:
            chiamata['esito'] = 'errore'
            chiamata['errore'] = getattr(error, 'code', type(error).__name__)
            # Testo dell'errore: per una bozza non valida dice quale campo (prima restava solo «ValidationError»).
            chiamata['dettaglio'] = dettaglio_errore(error)
            # Causa dell'errore del fornitore, senza segreti (generation/causa.py): vale per il registro
            # delle misure e per quello dell'app (spesa_generazione.FornitoreRegolato eredita da qui).
            if getattr(error, 'causa', None):
                chiamata['causa'] = error.causa
            raise
        finally:
            usage = self.last_usage
            chiamata.update(fine=adesso(), usage=usage, effettivoUSD=costo_effettivo(usage, self.prezzo))
            # Un tentativo oltre il limite per tentativo smentisce il maggiorante: blocco successivo fermato.
            if usage and ((usage.get('inputTokens') or 0) > limite.ingresso_massimo_per_tentativo
                          or (usage.get('outputTokens') or 0) > limite.uscita_massima):
                self.violazione = f'Token reali di {chunk.id} oltre il limite per tentativo: maggiorante non valido'
                chiamata['violazioneLimite'] = True
            self.registro.aggiorna_corsa(self.corsa)
