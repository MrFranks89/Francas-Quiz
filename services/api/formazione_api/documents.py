import re
from pathlib import Path
from zipfile import BadZipFile, ZipFile, is_zipfile

import pypdfium2 as pdfium
from docx import Document
from pypdf import PdfReader

from .extractors import HEADING_PATTERN

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


_CHAPTER_LINE_RE = re.compile(
    r'^(?:Capitolo|Sezione|Parte|Paragrafo)\s+(?:\d+|[IVXLCDM]+)\b[^\n]{0,80}',
    re.IGNORECASE,
)
_NUMBERED_HEADING_RE = re.compile(
    r'^(?:\d+\.\d*(?:\.\d+)*)\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ][^\n]{1,78}$',
)
_TOC_LEADER_RE = re.compile(r'(?:\.{3,}|…)\s*\d+\s*$')


def extract_outline(path, page_count):
    """Estrae i capitoli del PDF: 1) outline/segnalibri nativi; 2) scansione rapida intestazioni."""
    if not page_count or page_count < 1:
        return []

    raw_items: list[tuple[str, int, int]] = []
    with path.open('rb') as source:
        reader = PdfReader(source, strict=False)

        def _walk_outline(entries, level=1):
            for entry in entries:
                if isinstance(entry, list):
                    _walk_outline(entry, level + 1)
                    continue
                raw_title = getattr(entry, 'title', None)
                if raw_title is None and hasattr(entry, 'get'):
                    raw_title = entry.get('/Title')
                title = str(raw_title or '').strip()
                if not title:
                    continue
                try:
                    page_num = reader.get_destination_page_number(entry) + 1
                except Exception:
                    continue
                if 1 <= page_num <= page_count:
                    raw_items.append((title, page_num, level))

        try:
            outline = reader.outline
            if outline:
                _walk_outline(outline, 1)
        except Exception:
            raw_items = []

        items = raw_items
        if len(raw_items) < 2:
            scanned_items: list[tuple[str, int, int]] = []
            for page_num, page in enumerate(reader.pages, start=1):
                if page_num > page_count:
                    break
                try:
                    text = page.extract_text() or ''
                except Exception:
                    continue
                for raw_line in text.splitlines():
                    line = raw_line.strip()
                    if not line or len(line) > 85 or _TOC_LEADER_RE.search(line):
                        continue
                    if _CHAPTER_LINE_RE.match(line):
                        level = 2 if line.lower().startswith('paragrafo') else 1
                        scanned_items.append((line, page_num, level))
                        break
                    match = HEADING_PATTERN.match(line)
                    if match and _NUMBERED_HEADING_RE.match(line):
                        heading = match.group(0).strip()
                        if not _TOC_LEADER_RE.search(heading):
                            first_token = heading.split()[0]
                            level = 2 if '.' in first_token and not first_token.endswith('.') else 1
                            scanned_items.append((heading, page_num, level))
                            break
            if len(scanned_items) >= len(raw_items):
                items = scanned_items

    chapters: list[dict] = []
    for idx, (title, start_page, level) in enumerate(items):
        end_page = page_count
        for _, next_page, next_level in items[idx + 1:]:
            if next_level <= level:
                end_page = max(start_page, next_page - 1)
                break
        chapters.append({
            'title': title,
            'fromPage': start_page,
            'toPage': min(page_count, end_page),
            'level': level,
        })
    return chapters


def has_digital_text(path: Path, count: int) -> bool:
    """Verifica rapidamente se il PDF contiene testo digitale estraibile nelle prime pagine."""
    if not count or count <= 0:
        return False
    pages_to_check = sorted({1, min(2, count), min(5, count)})
    total_chars = 0
    try:
        with pdfium.PdfDocument(str(path)) as pdf:
            for page_num in pages_to_check:
                page = pdf[page_num - 1]
                try:
                    textpage = page.get_textpage()
                    try:
                        text = textpage.get_text_range() or ''
                    finally:
                        textpage.close()
                finally:
                    page.close()
                total_chars += len(text.strip())
                if total_chars > 80:
                    return True
    except Exception:
        return False
    return False
