"""Ripresa di una generazione interrotta: i blocchi riusciti si conservano, si paga solo il resto.

`generate()` (generation/pipeline.py) genera un modulo per blocco, in sequenza. Prima di questo file
un blocco fallito buttava tutto il lavoro già fatto e pagato (18 novembre 2026: corso di 10 blocchi
fallito al sesto, cinque moduli persi). Ora dopo ogni blocco riuscito il suo risultato (modulo,
domande con i loro id, obiettivi, voce di copertura, scarti, usage delle chiamate) è scritto in
`{id estrazione}.ripresa-generazione.json` nella cartella dei dati, PRIMA del blocco successivo:
sopravvive anche se il processo muore. Una nuova richiesta riusa i blocchi salvati validi e chiama
il fornitore solo per gli altri. La bozza nasce comunque solo con tutti i blocchi fatti: nessuna
bozza parziale, la copertura resta completa.

Un blocco salvato si riusa solo se la sua **impronta** coincide: tutto ciò che ne determina il
contenuto (impronta_comune + impronta_blocco). Gli id (`module-{i}`, `question-{i}-{n}`,
`slide-{i}-{j}`, `exam-{i}`) dipendono solo dalla posizione del blocco, che è la chiave del file:
il corso ripreso è identico a quello di una generazione unica con le stesse risposte del modello.

Fuori dall'impronta, di proposito:
- il titolo del corso: entra solo in `course.title`, assemblato alla fine, mai nei moduli; e il
  preventivo (GET /extractions/{id}/generation-estimate) non lo riceve, quindi con il titolo
  dentro non potrebbe sapere quali blocchi sono salvati. Cambiare titolo fra un tentativo e
  l'altro non deve far ripagare i blocchi;
- `acknowledgeWarnings`: decide solo se si può partire, non cambia il materiale.

Il file si cancella a bozza salvata (generation_routes.generate_course) e con `restart: true`
(spesa_generazione.genera_con_tetto, sotto il lucchetto della generazione).
"""
import hashlib
import json
import os
import re
from pathlib import Path

from .generation import instructions, validazione
from .generation.instructions import materiale
from .measurement import preventivo as pv

SUFFISSO = 'ripresa-generazione.json'
# Da cambiare quando cambia la forma della voce salvata o il modo in cui la pipeline la costruisce:
# un numero diverso rende inutilizzabili i blocchi salvati prima.
VERSIONE = 1


def _hash(valore) -> str:
    testo = valore if isinstance(valore, str) else json.dumps(valore, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(testo.encode('utf-8')).hexdigest()


def impronta_comune(fornitore: str, modello: str, validatore: tuple[str, str] | None, escluse) -> str:
    """Parte dell'impronta uguale per tutti i blocchi di una generazione.

    Fornitore e modello della generazione; istruzioni e schema dell'output così come vengono inviati
    (stessa funzione del preventivo, measurement.preventivo.schema_inviato) e tetto d'uscita;
    pianificazione dei blocchi; validatore incrociato (fornitore, modello, istruzioni, schema delle
    risposte, tetto d'uscita: decide quali domande restano); pagine escluse, ordinate.
    Valori letti dai moduli al momento della chiamata, non copiati: se cambiano, cambia l'impronta.
    """
    voce_validatore = None
    if validatore is not None:
        nome, modello_validatore = validatore
        voce_validatore = dict(fornitore=nome, modello=modello_validatore,
                               istruzioni=_hash(validazione.ISTRUZIONI_VALIDATORE),
                               schema=_hash(validazione.RisposteValidatore.model_json_schema()),
                               uscitaMassima=validazione.MAX_OUTPUT_VALIDAZIONE)
    return _hash(dict(versione=VERSIONE, fornitore=fornitore, modello=modello,
                      istruzioni=_hash(instructions.ISTRUZIONI_DIDATTICHE),
                      schema=_hash(pv.schema_inviato(fornitore)), uscitaMassima=instructions.MAX_OUTPUT_TOKENS,
                      maxChars=pv.MAX_CHARS, maxChunks=pv.MAX_CHUNKS, validatore=voce_validatore,
                      pagineEscluse=sorted(escluse)))


def impronta_blocco(comune: str, chunk) -> str:
    """Impronta di un blocco: la parte comune più il materiale inviato al fornitore (testo e pezzi
    con sourceId, start, end: generation/instructions.materiale)."""
    return _hash(dict(comune=comune, chunkId=chunk.id, materiale=materiale(chunk)))


def percorso(root, extraction_id) -> Path | None:
    """File di ripresa di un'estrazione; None per un id che non è quello dello Store (32 cifre esadecimali,
    come storage.Store.path): niente ripresa, per esempio per le estrazioni finte dei test."""
    if not isinstance(extraction_id, str) or not re.fullmatch(r'[a-f0-9]{32}', extraction_id):
        return None
    return Path(root) / f'{extraction_id}.{SUFFISSO}'


def cancella(root, extraction_id) -> None:
    if (file := percorso(root, extraction_id)) is not None:
        file.unlink(missing_ok=True)


class Ripresa:
    """Blocchi salvati di una generazione, per la pipeline (generate(ripresa=...)) e per il preventivo.

    I blocchi riusabili si leggono UNA volta, alla costruzione: il preventivo conta come da generare
    esattamente i blocchi che la pipeline genererà, anche se nel frattempo il file cambia. Con
    `ignora_salvati` (richiesta `restart: true`) nessun blocco è riusabile.
    """

    def __init__(self, root, extraction_id, comune: str, chunks, ignora_salvati: bool = False):
        self.file = percorso(root, extraction_id)
        self.comune, self.totale = comune, len(chunks)
        salvati = {} if ignora_salvati else self._leggi()['blocchi']
        self.validi = {}
        for i, chunk in enumerate(chunks, 1):
            voce = salvati.get(str(i))
            if voce and voce.get('impronta') == impronta_blocco(comune, chunk):
                self.validi[i] = voce

    def _leggi(self) -> dict:
        if self.file is None or not self.file.exists():
            return {'schemaVersion': 1, 'blocchi': {}}
        try:
            dati = json.loads(self.file.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            # File rovinato (processo morto durante una scrittura non atomica di un'altra versione):
            # nessun blocco riusabile, si rigenera. Non è un errore della richiesta.
            return {'schemaVersion': 1, 'blocchi': {}}
        return dati if isinstance(dati, dict) and isinstance(dati.get('blocchi'), dict) else {'schemaVersion': 1, 'blocchi': {}}

    def da_generare(self, chunks) -> list:
        return [c for i, c in enumerate(chunks, 1) if i not in self.validi]

    def riprendi(self, i: int, chunk) -> dict | None:
        """Voce salvata del blocco in posizione i, se la sua impronta coincide."""
        voce = self.validi.get(i)
        return voce if voce is not None and voce['impronta'] == impronta_blocco(self.comune, chunk) else None

    def conserva(self, i: int, chunk, voce: dict) -> None:
        """Scrive la voce del blocco i, subito e in modo atomico (temporaneo + replace)."""
        voce = {**voce, 'impronta': impronta_blocco(self.comune, chunk)}
        self.validi[i] = voce
        if self.file is None:
            return
        dati = self._leggi()
        dati['blocchi'][str(i)] = voce
        temporaneo = self.file.with_suffix('.tmp')
        temporaneo.write_text(json.dumps(dati, ensure_ascii=False), encoding='utf-8')
        os.replace(temporaneo, self.file)

    def ricomincia(self) -> None:
        """`restart: true`: i blocchi salvati si scartano anche dal disco."""
        self.validi = {}
        if self.file is not None:
            self.file.unlink(missing_ok=True)

    def stato(self) -> dict:
        """Per la risposta d'errore della rotta e per l'app: blocchi salvati validi su blocchi totali."""
        return dict(savedChunks=len(self.validi), totalChunks=self.totale)
