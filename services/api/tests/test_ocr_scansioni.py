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


# --- Controllo automatico: OCR «completo ma vuoto» ----------------------------------------

def test_ocr_che_restituisce_solo_la_filigrana_e_segnalato_pagina_per_pagina(monkeypatch, tmp_path):
    """Il difetto di prima della correzione: 50 pagine su 50 completate, solo la filigrana."""
    from types import SimpleNamespace
    status = pytest.importorskip('docling.datamodel.base_models').ConversionStatus
    from formazione_api.docling_adapter import docling_extract
    from formazione_api.pagine_non_lette import pagine_non_lette
    from test_difetti_estrazione import INTESTAZIONE, pdf_misto
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))
    letto = 'Mancata elaborazione del documento di valutazione dei rischi e del piano di emergenza. ' * 3
    voce = lambda testo, pagina: (SimpleNamespace(text=testo, label='text', prov=[SimpleNamespace(page_no=pagina)]), 0)  # noqa: E731
    # pdf_misto: 1 e 4 scansioni con intestazione nativa, 2 nativa, 3 quasi vuota, 5-6 non scansioni.
    voci = [voce(INTESTAZIONE, 1), voce('Articolo 1: testo nativo della norma. ' * 20, 2), voce('pagina bianca', 3),
            voce(INTESTAZIONE, 4), voce(letto, 4), voce('Testo', 5), voce('Testo', 6)]
    documento = SimpleNamespace(iterate_items=lambda: voci)
    risultato = SimpleNamespace(status=status.SUCCESS, pages=[SimpleNamespace(page_no=p) for p in range(1, 7)],
                                errors=[], document=documento)
    monkeypatch.setattr('formazione_api.docling_adapter._converter',
                        lambda *_: SimpleNamespace(convert=lambda *a, **k: risultato))
    path = tmp_path / 'source'
    path.write_bytes(pdf_misto())
    blocks, warnings, status_estrazione = docling_extract(path, 'pdf', 1, 6)
    assert pagine_non_lette(warnings) == [1]
    assert any(w.startswith('Pagina 1: OCR senza testo utile') for w in warnings)
    assert status_estrazione == 'needs_review'


def test_caratteri_utili_non_contano_il_testo_nativo_ne_i_suoi_frammenti():
    from formazione_api.docling_adapter import caratteri_utili
    nativo = 'COPIA TRATTA DA GURITEL - GAZZETTA UFFICIALE ON-LINE\n30-4-2008 Supplemento ordinario'
    assert caratteri_utili('copia tratta da guritel gazzetta ufficiale ON-LINE 30-4-2008', nativo) == 0
    assert caratteri_utili('Mancata formazione', nativo) == len('Mancataformazione')
