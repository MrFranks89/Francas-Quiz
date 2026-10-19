"""Verifica sha256 dei file del corpus: un file diverso da quello registrato non si misura."""
import hashlib
from pathlib import Path
from zipfile import ZipFile


class FileNonConforme(ValueError):
    pass


def sha256_byte(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def verifica_file(path: Path, atteso: str) -> str:
    """Restituisce l'hash se coincide con il manifest, altrimenti rifiuta."""
    if not Path(path).is_file():
        raise FileNonConforme(f'File assente: {path}')
    trovato = sha256_file(path)
    if trovato != atteso.lower():
        raise FileNonConforme(f'sha256 diverso dal manifest per {path}: atteso {atteso}, trovato {trovato}')
    return trovato


def verifica_membro_zip(archivio: Path, atteso_archivio: str, membro: str, estratto: Path) -> str:
    """Il manifest registra l'hash dell'archivio, non dei file estratti: si verifica l'archivio,
    poi che il file estratto sia byte per byte il membro dell'archivio verificato."""
    verifica_file(archivio, atteso_archivio)
    with ZipFile(archivio) as zip_file:
        atteso = sha256_byte(zip_file.read(membro))
    return verifica_file(estratto, atteso)
