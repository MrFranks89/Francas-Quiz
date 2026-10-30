"""File .env del server: letto all'avvio, scritto dalla schermata Impostazioni (impostazioni.py).

Parser minimo nostro, senza dipendenze: righe `NOME=valore`, commenti `#` a inizio riga, righe
vuote, valore fra virgolette semplici o doppie (tolte, senza sequenze di escape). Un `#` dentro il
valore fa parte del valore. Le righe non valide sono ignorate e segnalate nel log con il solo
numero di riga: il contenuto potrebbe essere una chiave.

Le variabili già presenti nell'ambiente del processo non vengono sovrascritte: chi le imposta nel
terminale prima di avviare il server ha la precedenza sul file.
"""
import logging
import os
import re
from pathlib import Path

log = logging.getLogger(__name__)

NOME = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
PREDEFINITO = Path(__file__).resolve().parents[1] / '.env'


def percorso() -> Path:
    """services/api/.env, oppure il file indicato da FORMAZIONE_ENV_FILE (test e prove)."""
    scelto = os.environ.get('FORMAZIONE_ENV_FILE', '').strip()
    return Path(scelto) if scelto else PREDEFINITO


def voce(riga: str) -> tuple[str, str] | None:
    """(nome, valore) di una riga `NOME=valore`; None per righe vuote, commenti e righe non valide."""
    pulita = riga.strip()
    if not pulita or pulita.startswith('#') or '=' not in pulita:
        return None
    nome, valore = pulita.split('=', 1)
    nome, valore = nome.strip(), valore.strip()
    if not NOME.fullmatch(nome):
        return None
    if len(valore) >= 2 and valore[0] == valore[-1] and valore[0] in '\'"':
        valore = valore[1:-1]
    return nome, valore


def leggi(testo: str) -> dict[str, str]:
    """Variabili del file; a parità di nome vale l'ultima riga."""
    valori = {}
    for numero, riga in enumerate(testo.lstrip('﻿').splitlines(), start=1):
        trovata = voce(riga)
        if trovata is not None:
            valori[trovata[0]] = trovata[1]
        elif riga.strip() and not riga.strip().startswith('#'):
            log.warning('File .env: riga %d ignorata (attesa la forma NOME=valore)', numero)
    return valori


def carica(file: Path) -> list[str]:
    """Imposta nel processo le variabili del file che l'ambiente non ha già. Restituisce i nomi impostati."""
    file = Path(file)
    if not file.is_file():
        return []
    impostate = []
    for nome, valore in leggi(file.read_text(encoding='utf-8-sig')).items():
        if nome not in os.environ:
            os.environ[nome] = valore
            impostate.append(nome)
    return impostate
