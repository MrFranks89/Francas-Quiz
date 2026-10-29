"""OCR delle pagine scansionate con un testo nativo sovrapposto (filigrana GURITEL).

In 01-dlgs-81-2008 (tests/corpus/manifest.json) le pagine 94-325 sono immagini con sopra una
filigrana testuale diagonale «COPIA TRATTA DA GURITEL - GAZZETTA UFFICIALE ON-LINE», il cui
riquadro copre quasi tutta la pagina. Con l'OcrMode predefinito di Docling 2.138 l'OCR leggeva il
testo dell'immagine e poi lo scartava tutto (vedi docling_adapter.py): restava solo la filigrana.
"""
import os
from io import BytesIO
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
PESI = ROOT / '.cache' / 'docling'


def pdf_scansione_con_filigrana() -> bytes:
    """Una pagina immagine con testo, più intestazione e filigrana diagonale come testo nativo."""
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
    image = Image.new('RGB', (1600, 2000), 'white')
    draw = ImageDraw.Draw(image)
    font_path = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'arial.ttf'
    font = ImageFont.truetype(str(font_path), 40) if font_path.exists() else ImageFont.load_default(size=40)
    righe = ['ALLEGATO PRIMO', 'Mancata elaborazione del documento di valutazione dei rischi.',
             'Mancata nomina del responsabile del servizio di prevenzione.',
             'Mancata formazione e addestramento dei lavoratori.',
             'Mancata costituzione del servizio di prevenzione e protezione.']
    for i, riga in enumerate(righe):
        draw.text((120, 200 + i * 120), riga, fill='black', font=font)
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(640, 800))
    pdf.drawImage(ImageReader(image), 0, 0, width=640, height=800)
    pdf.setFont('Helvetica', 9)
    pdf.drawString(150, 780, 'Supplemento ordinario alla GAZZETTA UFFICIALE')
    # Filigrana diagonale: come in 01, il suo riquadro copre quasi tutta l'immagine.
    pdf.saveState()
    pdf.translate(60, 60)
    pdf.rotate(50)
    pdf.setFont('Helvetica', 40)
    pdf.setFillColorRGB(0.85, 0.85, 0.85)
    pdf.drawString(0, 0, 'COPIA TRATTA DA GURITEL - GAZZETTA UFFICIALE ON-LINE')
    pdf.restoreState()
    pdf.showPage()
    pdf.save()
    return output.getvalue()


@pytest.fixture
def pesi_locali(monkeypatch):
    pytest.importorskip('docling.document_converter')
    if not (PESI / 'RapidOcr').is_dir():
        pytest.skip('pesi Docling assenti: provisioning offline in docs/API.md')
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(PESI))
    monkeypatch.setenv('HF_HUB_OFFLINE', '1')
    monkeypatch.setenv('TRANSFORMERS_OFFLINE', '1')


def test_ocr_legge_il_testo_della_scansione_sotto_la_filigrana(pesi_locali, tmp_path):
    from formazione_api.docling_adapter import docling_extract
    from formazione_api.extractors import native_extract
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansione_con_filigrana())
    # Premessa: per il parser nativo è la pagina di 01, solo intestazione e filigrana.
    nativi, avvisi_nativi, _ = native_extract(path, 'pdf', 1, 1)
    assert 'GURITEL' in nativi[0]['text'] and 'rischi' not in nativi[0]['text']
    assert any('probabile scansione' in a for a in avvisi_nativi)
    blocks, warnings, status = docling_extract(path, 'pdf', 1, 1)
    testo = ' '.join(b['text'] for b in blocks).lower()
    for parola in ('valutazione', 'rischi', 'responsabile', 'addestramento', 'costituzione'):
        assert parola in testo, testo
    assert all(b['page'] == 1 for b in blocks)
    assert not any('senza testo utile' in w for w in warnings), warnings
    assert status == 'needs_review'
