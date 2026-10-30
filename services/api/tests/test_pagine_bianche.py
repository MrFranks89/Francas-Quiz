"""Pagine scansionate bianche: segnalate come bianche, senza bloccare la generazione.

In 02-dpr-547-1955 (tests/corpus/manifest.json) le pagine 2 e 47 sono scansioni bianche e la 48
contiene solo «PREZZO L. 300». L'OCR non vi legge 50 caratteri utili e l'avviso «OCR senza testo
utile» bloccava l'intero documento. Si blocca solo quando c'è contenuto visibile che l'OCR non ha
letto: la pagina bianca è segnalata e non blocca; la riga isolata letta dall'OCR non è un
fallimento; la scansione con contenuto e senza testo letto continua a bloccare.
"""
import os
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from test_difetti_estrazione import INTESTAZIONE, file_corpus

LATO = (1240, 1754)   # A4 a 150 punti per pollice, come una scansione


def _font(size):
    path = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'arial.ttf'
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default(size=size)


def scansione(contenuto=None):
    """Scansione bianca con i difetti dei bordi di 02 p. 2: bordo nero a destra, ombra in basso."""
    image = Image.new('L', LATO, 255)
    draw = ImageDraw.Draw(image)
    draw.rectangle((LATO[0] - 30, 0, LATO[0], LATO[1]), fill=0)
    draw.rectangle((0, LATO[1] - 20, LATO[0] // 2, LATO[1]), fill=0)
    if contenuto == 'illeggibile':
        # Contenuto visibile che l'OCR non legge: tratti fitti come una stampa sbiadita e macchiata.
        for riga in range(30):
            y = 250 + riga * 42
            for x in range(150, 1050, 60):
                draw.line((x, y, x + 40, y + (riga % 3) * 6), fill=20, width=5)
    elif contenuto == 'riga':
        draw.text((470, 860), 'PREZZO L. 300', fill=0, font=_font(44))
    output = BytesIO()
    image.save(output, 'PNG')
    output.seek(0)
    return ImageReader(output)


def pdf_scansioni(*pagine):
    """Pagine scansionate con intestazione nativa (come 01) o nativa ('nativa'). L'intestazione
    è anche al centro della pagina: la misura dell'inchiostro deve ignorare il testo nativo."""
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=(595, 842))
    for pagina in pagine:
        if pagina == 'nativa':
            for riga in range(20):
                c.drawString(72, 780 - riga * 14, f'Articolo {riga}: testo nativo della norma, abbastanza lungo da contare.')
        else:
            c.drawImage(scansione(pagina), 0, 0, 595, 842)
            c.drawString(72, 815, INTESTAZIONE)
            c.drawString(150, 421, INTESTAZIONE)
        c.showPage()
    c.save()
    return output.getvalue()


# --- Misura dell'inchiostro ------------------------------------------------------------------

def test_inchiostro_ignora_bordi_e_testo_nativo(tmp_path):
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni(None, 'riga', 'illeggibile'))
    misure = scansioni(path, 1, 3)
    assert misure[1].testo.count('GURITEL') == 2       # il testo nativo c'è, ma non conta come inchiostro
    assert misure[1].inchiostro < SOGLIA_PAGINA_BIANCA / 10
    assert SOGLIA_PAGINA_BIANCA < misure[2].inchiostro < misure[3].inchiostro


def test_file_reale_02_pagine_bianche_e_prezzo():
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = file_corpus('02-dpr-547-1955')
    misure = scansioni(path, 1, 48)
    assert sorted(misure) == list(range(1, 49))
    bianche = {p for p, m in misure.items() if m.inchiostro < SOGLIA_PAGINA_BIANCA}
    assert bianche == {2, 47}
    assert misure[48].inchiostro > SOGLIA_PAGINA_BIANCA
    assert min(m.inchiostro for p, m in misure.items() if p not in (2, 47, 48)) > 0.05


def test_file_reale_01_le_scansioni_corte_non_sono_bianche():
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = file_corpus('01-dlgs-81-2008')
    misure = scansioni(path, 94, 106)
    assert len(misure) == 13
    assert min(m.inchiostro for m in misure.values()) > 3 * SOGLIA_PAGINA_BIANCA   # p. 98: 0,0019
