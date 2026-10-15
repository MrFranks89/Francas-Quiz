from pathlib import Path
from zipfile import BadZipFile, ZipFile

from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader

MAX_BYTES = 25 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024
KINDS = {'.pdf': 'pdf', '.docx': 'docx', '.xlsx': 'xlsx', '.txt': 'text', '.md': 'text', '.csv': 'text'}


def inspect_document(path, filename):
    kind = KINDS.get(Path(filename).suffix.lower())
    if kind is None:
        raise ValueError('Formato non supportato: PDF, DOCX, XLSX, TXT, MD o CSV.')
    count, sheets = None, []
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
    elif kind in ('docx', 'xlsx'):
        try:
            with ZipFile(path) as archive:
                members = archive.infolist()
                if sum(item.file_size for item in members) > MAX_EXPANDED or len(members) > 10000:
                    raise ValueError('Archivio troppo grande dopo la decompressione.')
                required = 'word/document.xml' if kind == 'docx' else 'xl/workbook.xml'
                if required not in archive.namelist() or '[Content_Types].xml' not in archive.namelist():
                    raise ValueError('Il contenuto del file non corrisponde al formato dichiarato.')
                if archive.testzip():
                    raise ValueError('Archivio danneggiato.')
            if kind == 'docx':
                Document(path)
            else:
                with path.open('rb') as source:
                    workbook = load_workbook(source, read_only=True, data_only=True)
                    sheets = workbook.sheetnames
                    workbook.close()
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
    return kind, count, sheets
