"""Impostazioni del fornitore AI per l'operatore locale: lettura e scrittura del file .env del server.

Uso locale con un solo operatore (la versione per studenti non avrà questa schermata: le chiavi
resteranno sul server). Le regole di sicurezza sono applicate qui e nella rotta
(impostazioni_routes.py):
- una chiave non esce mai dal server: lo stato riporta solo se è configurata e, se abbastanza
  lunga, le ultime 4 cifre;
- nessun messaggio d'errore ripete i valori ricevuti (un campo sbagliato può contenere la chiave);
- nessun log dei valori;
- una chiave vuota non cancella quella salvata: serve `removeKey`.

Le fonti dei valori sono il codice e i dati del progetto, non copie scritte a mano:
- fornitori: selection.FORNITORI;
- nomi delle variabili: la convenzione <FORNITORE>_API_KEY / <FORNITORE>_MODEL, verificata dal test
  test_convenzione_dei_nomi_delle_variabili_vale_per_ogni_fornitore contro config_status() di
  ogni fornitore;
- modelli ammessi e prezzi: formazione_api/config/prezzi.json letto con measurement.prezzi, lo stesso
  file del tetto di spesa (measurement.prezzi.PREZZI): un modello senza prezzo non può generare, quindi
  non si può nemmeno scegliere.
"""
import os
import re
import threading
from pathlib import Path

from . import ambiente
from .generation import selection
from .measurement.prezzi import PREZZI, PrezzoMancante, carica, modelli, prezzo

VARIABILE_FORNITORE = 'GENERATION_PROVIDER'  # letta da selection.selected_name()
ETICHETTE = {'openai': 'OpenAI', 'anthropic': 'Anthropic', 'gemini': 'Gemini'}
CIFRE_MOSTRATE = 4
# Sotto questa lunghezza le ultime 4 cifre sarebbero una parte troppo grande della chiave.
LUNGHEZZA_MINIMA_PER_MOSTRARE = 12
LUNGHEZZA_MASSIMA_CHIAVE = 512
# Caratteri ASCII stampabili senza spazi né virgolette: le chiavi dei fornitori usano lettere,
# cifre, - e _; niente a capo, così una chiave non può aggiungere righe al file .env.
CHIAVE_AMMESSA = re.compile(r'[!#-&(-~]+')
CAMPI = {'provider', 'model', 'apiKey', 'removeKey'}

SCRITTURA = threading.Lock()


class ImpostazioniRifiuto(Exception):
    """Messaggio leggibile, senza mai ripetere i valori ricevuti."""


def variabile_chiave(fornitore: str) -> str:
    return f'{fornitore.upper()}_API_KEY'


def variabile_modello(fornitore: str) -> str:
    return f'{fornitore.upper()}_MODEL'


def ultime_cifre(chiave: str) -> str | None:
    return chiave[-CIFRE_MOSTRATE:] if len(chiave) >= LUNGHEZZA_MINIMA_PER_MOSTRARE else None


def listino() -> dict[str, dict]:
    """Per fornitore: modelli con un prezzo valido e quota per chiamata misurata o no."""
    prezzi = carica(PREZZI)
    voci = {nome: {'modelli': {}, 'misurata': False} for nome in selection.FORNITORI}
    for nome, modello in modelli(prezzi):
        if nome not in voci:
            continue
        try:
            p = prezzo(prezzi, nome, modello)
        except PrezzoMancante:
            continue
        voci[nome]['modelli'][modello] = p
        # La quota è del fornitore (sovraccaricoIngressoPerChiamata), uguale per tutti i suoi modelli.
        voci[nome]['misurata'] = p.sovraccarico_ingresso is not None
    return voci


def stato() -> dict:
    """Risposta di GET /settings: nessuna chiave, solo se è configurata e le ultime cifre."""
    voci = listino()
    attivo = selection.selected_name()
    fornitori = []
    for nome, voce in voci.items():
        chiave = os.getenv(variabile_chiave(nome), '').strip()
        modello = os.getenv(variabile_modello(nome), '').strip() or None
        fornitori.append({
            'id': nome, 'label': ETICHETTE.get(nome, nome),
            'keyConfigured': bool(chiave), 'keyLast4': ultime_cifre(chiave) if chiave else None,
            'model': modello, 'modelPriced': modello in voce['modelli'] if modello else None,
            'models': [{'id': m, 'inputUsdPerMTok': str(p.ingresso), 'outputUsdPerMTok': str(p.uscita),
                        'cachedInputUsdPerMTok': str(p.ingresso_cache)} for m, p in voce['modelli'].items()],
            'perCallOverheadMeasured': voce['misurata'],
            # Con prezzo 0 dichiarato (Prezzo.gratuito) il tetto non ha bisogno della quota: nessun rifiuto.
            'notice': None if voce['misurata'] or (voce['modelli'] and all(p.gratuito for p in voce['modelli'].values()))
            else (
                f'Quota per chiamata di {ETICHETTE.get(nome, nome)} non misurata (prezzi.json): il tetto di spesa '
                'non può garantire un costo massimo, quindi ogni generazione con questo fornitore viene rifiutata.'),
        })
    return {
        'configured': selection.config_status()['configured'],
        'activeProvider': attivo,
        'activeModel': (os.getenv(variabile_modello(attivo), '').strip() or None) if attivo else None,
        'providers': fornitori,
    }


def valida(corpo) -> dict[str, str | None]:
    """Modifiche da applicare: nome → valore, None = da togliere. Solleva ImpostazioniRifiuto."""
    if not isinstance(corpo, dict):
        raise ImpostazioniRifiuto('Corpo della richiesta non valido: atteso un oggetto JSON.')
    if set(corpo) - CAMPI:
        raise ImpostazioniRifiuto('Campo non ammesso nella richiesta: sono ammessi provider, model, apiKey e removeKey.')
    voci = listino()
    fornitore = corpo.get('provider')
    if not isinstance(fornitore, str) or fornitore not in voci:
        raise ImpostazioniRifiuto(f"Fornitore non supportato: scegliere {' oppure '.join(voci)}.")
    modello = corpo.get('model')
    ammessi = voci[fornitore]['modelli']
    if not isinstance(modello, str) or not modello.strip():
        raise ImpostazioniRifiuto('Scegliere un modello.')
    if modello not in ammessi:
        raise ImpostazioniRifiuto(f"Modello senza prezzo in prezzi.json per {ETICHETTE.get(fornitore, fornitore)}: "
                                  f"scegliere fra {', '.join(ammessi) or 'nessun modello disponibile'}.")
    rimuovi = corpo.get('removeKey', False)
    if not isinstance(rimuovi, bool):
        raise ImpostazioniRifiuto('removeKey deve essere vero oppure falso.')
    chiave = corpo.get('apiKey')
    if chiave is not None and not isinstance(chiave, str):
        raise ImpostazioniRifiuto('La chiave deve essere un testo.')
    chiave = (chiave or '').strip()
    if chiave and rimuovi:
        raise ImpostazioniRifiuto('Inserire una chiave nuova oppure rimuovere quella salvata, non entrambe le cose.')
    if chiave and (len(chiave) > LUNGHEZZA_MASSIMA_CHIAVE or not CHIAVE_AMMESSA.fullmatch(chiave)):
        raise ImpostazioniRifiuto('La chiave contiene caratteri non ammessi (spazi, virgolette o a capo) '
                                  'oppure è troppo lunga: incollarla di nuovo.')
    modifiche: dict[str, str | None] = {VARIABILE_FORNITORE: fornitore, variabile_modello(fornitore): modello}
    if rimuovi:
        modifiche[variabile_chiave(fornitore)] = None
    elif chiave:
        modifiche[variabile_chiave(fornitore)] = chiave
    # Campo chiave vuoto: la chiave salvata resta com'è.
    return modifiche


def aggiorna_testo(testo: str, modifiche: dict[str, str | None]) -> str:
    """Nuovo contenuto del file: le righe delle variabili modificate sono sostituite al loro posto
    (una sola; i doppioni tolti), quelle da togliere eliminate, le nuove aggiunte in fondo. Commenti
    e altre righe restano come sono."""
    righe, viste = [], set()
    for riga in testo.lstrip('﻿').splitlines():
        trovata = ambiente.voce(riga)
        if trovata is None or trovata[0] not in modifiche:
            righe.append(riga)
            continue
        nome = trovata[0]
        if nome not in viste and modifiche[nome] is not None:
            righe.append(f'{nome}={modifiche[nome]}')
        viste.add(nome)
    righe += [f'{nome}={valore}' for nome, valore in modifiche.items() if nome not in viste and valore is not None]
    return '\n'.join(righe) + '\n'


def scrivi(file: Path, modifiche: dict[str, str | None]) -> None:
    """Scrittura atomica: file temporaneo nella stessa cartella, poi os.replace. Se qualcosa fallisce
    il file precedente resta intatto e il temporaneo viene tolto. Il nome del temporaneo
    (.env.scrittura-<pid>.tmp) è escluso da Git come il file (test_ambiente.py)."""
    file = Path(file)
    file.parent.mkdir(parents=True, exist_ok=True)
    attuale = file.read_text(encoding='utf-8-sig') if file.is_file() else ''
    temporaneo = file.with_name(f'{file.name}.scrittura-{os.getpid()}.tmp')
    try:
        with open(temporaneo, 'w', encoding='utf-8', newline='\n') as uscita:
            uscita.write(aggiorna_testo(attuale, modifiche))
            uscita.flush()
            os.fsync(uscita.fileno())
        os.replace(temporaneo, file)
    finally:
        temporaneo.unlink(missing_ok=True)


def applica(modifiche: dict[str, str | None]) -> None:
    """Al processo, senza riavvio: fornitori e tetto di spesa leggono l'ambiente a ogni richiesta."""
    for nome, valore in modifiche.items():
        if valore is None:
            os.environ.pop(nome, None)
        else:
            os.environ[nome] = valore


def salva(file: Path, corpo) -> dict:
    """Valida, scrive il file e solo dopo applica al processo: se la scrittura fallisce, nulla cambia."""
    modifiche = valida(corpo)
    with SCRITTURA:
        scrivi(file, modifiche)
        applica(modifiche)
    return stato()
