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
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from formazione_api.measurement import corsa as misura
from formazione_api.pagine_non_lette import (avviso_ocr_vuoto, avviso_pagina_bianca, avviso_scansione,
                                             pagine_bianche, pagine_non_lette)
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_difetti_estrazione import INTESTAZIONE, file_corpus
from test_generation_http import Provider

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


def docling_finto(monkeypatch, tmp_path, letto):
    """Docling sostituito: restituisce per ogni pagina il testo di `letto` (nessun blocco se manca)."""
    status = pytest.importorskip('docling.datamodel.base_models').ConversionStatus
    monkeypatch.setenv('DOCLING_ARTIFACTS_PATH', str(tmp_path))

    def converti(_sorgente, page_range, **_):
        pagine = range(page_range[0], page_range[1] + 1)
        voci = [(SimpleNamespace(text=letto[p], label='text', prov=[SimpleNamespace(page_no=p)]), 0)
                for p in pagine if p in letto]
        return SimpleNamespace(status=status.SUCCESS, pages=[SimpleNamespace(page_no=p) for p in pagine],
                               errors=[], document=SimpleNamespace(iterate_items=lambda: voci))
    monkeypatch.setattr('formazione_api.docling_adapter._converter',
                        lambda *_: SimpleNamespace(convert=converti))


# --- Avvisi ----------------------------------------------------------------------------

def test_la_pagina_bianca_non_e_una_pagina_non_letta():
    avvisi = [avviso_pagina_bianca(2), avviso_ocr_vuoto(5), avviso_pagina_bianca(47), avviso_scansione(9)]
    assert avviso_pagina_bianca(2) == 'Pagina 2: pagina bianca, ignorata.'
    assert pagine_non_lette(avvisi) == [5, 9]
    assert pagine_bianche(avvisi) == [2, 47]


# --- Misura dell'inchiostro ------------------------------------------------------------------

def test_inchiostro_ignora_bordi_e_testo_nativo(tmp_path):
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni(None, 'riga', 'illeggibile'))
    misure = scansioni(path, 1, 3)
    assert misure[1].testo.count('GURITEL') == 2       # il testo nativo c'è, ma non conta come inchiostro
    assert misure[1].inchiostro < SOGLIA_PAGINA_BIANCA / 10
    assert SOGLIA_PAGINA_BIANCA < misure[2].inchiostro < misure[3].inchiostro


# --- Estrazione nativa ----------------------------------------------------------------------

def test_estrazione_nativa_segnala_la_scansione_bianca_senza_bloccare(tmp_path):
    from formazione_api.extractors import native_extract
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni(None, 'illeggibile'))
    _blocks, warnings, _status = native_extract(path, 'pdf', 1, 2)
    assert avviso_pagina_bianca(1) in warnings and avviso_scansione(1) not in warnings
    assert avviso_scansione(2) in warnings
    assert pagine_non_lette(warnings) == [2]


# --- OCR -------------------------------------------------------------------------------

def test_ocr_bianca_ignorata_riga_letta_accettata_contenuto_non_letto_bloccante(monkeypatch, tmp_path):
    from formazione_api.docling_adapter import docling_extract
    docling_finto(monkeypatch, tmp_path, {3: 'PREZZO L. 300'})
    path = tmp_path / 'source'
    path.write_bytes(pdf_scansioni(None, 'illeggibile', 'riga', 'riga'))
    _blocks, warnings, _status = docling_extract(path, 'pdf', 1, 4)
    assert pagine_bianche(warnings) == [1]
    # 2: contenuto illeggibile, nessun testo; 4: la stessa riga di 3, ma l'OCR non l'ha letta.
    assert pagine_non_lette(warnings) == [2, 4]


def test_file_reale_02_pagine_bianche_e_prezzo(tmp_path):
    from formazione_api.docling_adapter import _scansioni_non_lette
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = file_corpus('02-dpr-547-1955')
    misure = scansioni(path, 1, 48)
    assert sorted(misure) == list(range(1, 49))
    bianche = {p for p, m in misure.items() if m.inchiostro < SOGLIA_PAGINA_BIANCA}
    assert bianche == {2, 47}
    assert misure[48].inchiostro > SOGLIA_PAGINA_BIANCA
    assert min(m.inchiostro for p, m in misure.items() if p not in (2, 47, 48)) > 0.05
    # Testo come quello dell'OCR reale (var/misure/estrazioni): niente su 2 e 47, la riga sulla 48.
    testo = {p: f'Art. {p}. I datori di lavoro devono attuare le misure di sicurezza previste.' for p in range(1, 49)}
    testo[48] = 'PREZZO L. 300'
    blocchi = [{'page': p, 'text': t} for p, t in testo.items() if p not in (2, 47)]
    avvisi = _scansioni_non_lette(path, 1, 48, blocchi)
    assert pagine_bianche(avvisi) == [2, 47] and pagine_non_lette(avvisi) == []
    # Se l'OCR non legge nemmeno la riga della 48, c'è contenuto visibile non letto: blocca.
    avvisi = _scansioni_non_lette(path, 1, 48, [b for b in blocchi if b['page'] != 48])
    assert pagine_non_lette(avvisi) == [48]


def test_file_reale_01_le_scansioni_corte_non_sono_bianche():
    from formazione_api.extractors import SOGLIA_PAGINA_BIANCA, scansioni
    path = file_corpus('01-dlgs-81-2008')
    misure = scansioni(path, 94, 106)
    assert len(misure) == 13
    assert min(m.inchiostro for m in misure.values()) > 3 * SOGLIA_PAGINA_BIANCA   # p. 98: 0,0019


# --- Generazione e misura -----------------------------------------------------------------

def test_si_genera_da_un_ocr_con_sole_pagine_bianche_segnalate(client, monkeypatch, tmp_path):
    client.app.state.generation_provider = Provider()
    letto = 'Il datore di lavoro valuta tutti i rischi e redige il documento di valutazione. ' * 4
    docling_finto(monkeypatch, tmp_path, {1: letto, 3: letto})
    doc = upload(client, 'scansione.pdf', pdf_scansioni('nativa', None, 'nativa'))
    estratta = extraction(client, doc, {'mode': 'all'}, engine='docling').json()
    assert pagine_bianche(estratta['warnings']) == [2]
    assert pagine_non_lette(estratta['warnings']) == []
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'acknowledgeWarnings': True})
    assert risposta.status_code == 201, risposta.text
    # Lo strumento di misura: la pagina bianca senza blocchi non è un'estrazione OCR troncata.
    selezione = dict(id='s', documento=doc['id'])
    voce = misura.preventivo_selezione(selezione, dict(estratta, inizio=1, fine=3), {'fornitori': {}})
    assert 'nonStimata' not in voce and 'rifiutataDallaPipeline' not in voce, voce


def test_la_pagina_mancante_non_bianca_resta_un_ocr_troncato():
    estrazione = dict(engine='docling', inizio=1, fine=3, status='needs_review', warnings=[avviso_pagina_bianca(2)],
                      blocks=[{'id': 'b1', 'text': 'Testo letto dalla scansione. ' * 5, 'page': 1, 'label': 'Pagina 1'}])
    voce = misura.preventivo_selezione(dict(id='s', documento='d'), estrazione, {'fornitori': {}})
    assert 'nonStimata' in voce and '1 pagine su 3' in voce['nonStimata']
