from pathlib import Path
from zipfile import BadZipFile, ZipFile, is_zipfile

from docx import Document
from pypdf import PdfReader

MAX_BYTES = 25 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024
KINDS = {'.pdf': 'pdf', '.docx': 'docx', '.txt': 'text', '.md': 'text'}

# Decisione del 29 ottobre 2026 (docs/decisions/004-niente-fogli-di-calcolo.md): i fogli di calcolo
# non sono una fonte, perché un foglio di dati renderebbe facile «barare».
MESSAGGIO_FOGLI = 'Formato non supportato: i fogli di calcolo (XLSX, CSV) non sono ammessi come fonte.'
ESTENSIONI_FOGLI = {'.xlsx', '.csv'}
# Parte principale di un foglio di calcolo OOXML (ECMA-376 parte 1, SpreadsheetML: workbook part
# in /xl/workbook.xml per convenzione; è il controllo che il caricamento faceva già per gli XLSX).
PARTE_FOGLIO = 'xl/workbook.xml'


def _e_un_foglio(path, filename):
    """Vero se il file è un foglio di calcolo: per estensione o, qualunque sia l'estensione, per contenuto."""
    if Path(filename).suffix.lower() in ESTENSIONI_FOGLI:
        return True
    if not is_zipfile(path):
        return False
    try:
        with ZipFile(path) as archive:
            return PARTE_FOGLIO in archive.namelist()
    except BadZipFile:
        return False


def fonte_ammessa(document):
    """Un documento salvato prima della decisione può essere un foglio di calcolo: non va riaperto."""
    suffix = Path(document.get('name', '')).suffix.lower()
    return suffix in KINDS and document.get('kind') == KINDS[suffix]


def inspect_document(path, filename):
    if _e_un_foglio(path, filename):
        raise ValueError(MESSAGGIO_FOGLI)
    kind = KINDS.get(Path(filename).suffix.lower())
    if kind is None:
        raise ValueError('Formato non supportato: PDF, DOCX, TXT o MD.')
    count = None
    if kind == 'pdf':
        with path.open('rb') as source:
            if source.read(5) != b'%PDF-':
                raise ValueError('Il file non è un PDF valido.')
            source.seek(0)
            reader = PdfReader(source, strict=True)
            if reader.is_encrypted:
                raise ValueError('PDF protetto: caricare una copia non cifrata.')
            count = len(reader.pages)
            if count == 0:
                raise ValueError('Il PDF non contiene pagine.')
    elif kind == 'docx':
        try:
            with ZipFile(path) as archive:
                members = archive.infolist()
                if sum(item.file_size for item in members) > MAX_EXPANDED or len(members) > 10000:
                    raise ValueError('Archivio troppo grande dopo la decompressione.')
                if 'word/document.xml' not in archive.namelist() or '[Content_Types].xml' not in archive.namelist():
                    raise ValueError('Il contenuto del file non corrisponde al formato dichiarato.')
                if archive.testzip():
                    raise ValueError('Archivio danneggiato.')
            Document(path)
        except BadZipFile as error:
            raise ValueError('Archivio Office non valido.') from error
    else:
        content = path.read_bytes()
        if b'\x00' in content:
            raise ValueError('Il file contiene dati binari, non testo UTF-8.')
        try:
            content.decode('utf-8-sig')
        except UnicodeDecodeError as error:
            raise ValueError('Il testo deve essere codificato UTF-8.') from error
    return kind, count
