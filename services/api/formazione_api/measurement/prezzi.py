"""Prezzi per milione di token, letti alla fonte e registrati in formazione_api/config/prezzi.json.

Il listino è configurazione dell'applicazione (lo leggono l'app, il preventivo, le impostazioni e
lo strumento di misura), non un dato di prova: sta nel pacchetto e si raggiunge da PREZZI, unico
punto del percorso.

Si usa Decimal (json parse_float) per non introdurre arrotondamenti nei confronti col budget.
"""
import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

MILIONE = Decimal(1_000_000)
PREZZI = Path(__file__).resolve().parents[1] / 'config' / 'prezzi.json'


class PrezzoMancante(ValueError):
    pass


@dataclass(frozen=True)
class Prezzo:
    fornitore: str
    modello: str
    ingresso: Decimal          # USD per milione di token in ingresso non in cache
    uscita: Decimal            # USD per milione di token in uscita
    ingresso_cache: Decimal    # USD per milione di token letti dalla cache
    altri_ingressi: tuple[Decimal, ...]  # altre tariffe d'ingresso (es. scrittura cache), solo per il limite
    moltiplicatore_massimo: Decimal      # maggiorazione massima documentata (es. residenza dei dati)
    soglia_contesto_lungo: int | None    # oltre questi token d'ingresso la tariffa cambia
    sovraccarico_ingresso: int | None    # token aggiunti dal fornitore per chiamata; None = non pubblicato

    @property
    def gratuito(self) -> bool:
        """Ogni tariffa è 0: il costo è 0 per qualunque numero di token. prezzo() lo ammette solo se
        la voce dichiara `piano: gratuito` con la sua condizione."""
        return all(v == 0 for v in (self.ingresso, self.uscita, self.ingresso_cache, *self.altri_ingressi))

    @property
    def ingresso_massimo(self) -> Decimal:
        """Tariffa d'ingresso più alta fra quelle elencate: il limite non dipende da come il
        fornitore ripartisce i token fra cache e non cache."""
        return max((self.ingresso, self.ingresso_cache, *self.altri_ingressi))


def carica(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_float=Decimal)


def prezzo(prezzi: dict, fornitore: str, modello: str) -> Prezzo:
    """Un modello senza prezzo letto alla fonte viene rifiutato: nessun valore predefinito."""
    if prezzi.get('valuta') != 'USD':
        raise PrezzoMancante('Valuta dei prezzi diversa da USD: nessuna conversione è ammessa')
    voce_fornitore = prezzi.get('fornitori', {}).get(fornitore)
    if voce_fornitore is None:
        raise PrezzoMancante(f'Fornitore senza prezzi: {fornitore}')
    voce = voce_fornitore.get('modelli', {}).get(modello)
    if voce is None:
        raise PrezzoMancante(f'Modello senza prezzo letto alla fonte: {fornitore}/{modello}')
    try:
        valori = {k: Decimal(voce[k]) for k in ('ingresso', 'uscita', 'ingressoCache')}
    except (KeyError, TypeError) as error:
        raise PrezzoMancante(f'Prezzo incompleto per {fornitore}/{modello}') from error
    if not voce.get('fonte') or not voce.get('lettoIl'):
        raise PrezzoMancante(f'Prezzo senza fonte o data di lettura: {fornitore}/{modello}')
    if any(v < 0 for v in valori.values()):
        raise PrezzoMancante(f'Prezzo negativo per {fornitore}/{modello}')
    # Prezzo 0 solo dichiarato: piano gratuito con la condizione in cui vale (per Gemini, chiave di un
    # progetto senza fatturazione). Così uno 0 scritto per errore non diventa una porta a spese vere,
    # e un piano gratuito non può avere tariffe diverse da 0.
    altri = [Decimal(v) for v in voce.get('altriIngressi', {}).values()]
    tutto_zero = all(v == 0 for v in (*valori.values(), *altri))
    gratuito = voce.get('piano') == 'gratuito' and bool(voce.get('condizione'))
    if tutto_zero != gratuito:
        raise PrezzoMancante(f'Prezzo 0 senza piano gratuito dichiarato, o piano gratuito con tariffe non nulle: '
                             f'{fornitore}/{modello}')
    moltiplicatore = Decimal(voce_fornitore.get('moltiplicatoreMassimo', {}).get('valore', 1))
    if moltiplicatore < 1:
        raise PrezzoMancante('Moltiplicatore massimo inferiore a 1')
    sovraccarico = voce_fornitore.get('sovraccaricoIngressoPerChiamata', {}).get('token')
    return Prezzo(fornitore, modello, valori['ingresso'], valori['uscita'], valori['ingressoCache'],
                  tuple(Decimal(v) for v in voce.get('altriIngressi', {}).values()), moltiplicatore,
                  voce.get('sogliaContestoLungo'), None if sovraccarico is None else int(sovraccarico))


def modelli(prezzi: dict):
    for fornitore, voce in prezzi.get('fornitori', {}).items():
        for modello in voce.get('modelli', {}):
            yield fornitore, modello
