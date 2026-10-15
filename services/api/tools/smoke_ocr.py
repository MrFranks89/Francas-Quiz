"""Explicit local OCR integration check. Run after provisioning models, never in default tests."""
import json
import os
import sys
from io import BytesIO
from pathlib import Path

root = Path(__file__).resolve().parents[3]
os.environ.setdefault('DOCLING_ARTIFACTS_PATH', str(root / '.cache' / 'docling'))
os.environ.setdefault('HF_HOME', str(root / '.cache' / 'huggingface'))
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
sys.path.insert(0, str(root / 'services' / 'api'))

from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from fastapi.testclient import TestClient
from formazione_api.main import create_app


def main():
    folder = root / '.cache' / 'ocr-smoke'
    folder.mkdir(parents=True, exist_ok=True)
    image = Image.new('RGB', (1600, 2000), 'white')
    draw = ImageDraw.Draw(image)
    font_path = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'arial.ttf'
    font = ImageFont.truetype(str(font_path), 40) if font_path.exists() else ImageFont.load_default(size=40)
    draw.text((120, 140), 'PROCEDURA AZIENDALE', fill='black', font=font)
    draw.text((120, 240), 'Prima di iniziare leggere il manuale.', fill='black', font=font)
    rows = [('Attivita', 'Responsabile'), ('Controllo accessi', 'Mario Rossi'), ('Verifica strumenti', 'Anna Bianchi')]
    for i, row in enumerate(rows):
        y = 440 + i * 100
        draw.rectangle((120, y, 1480, y+100), outline='black', width=3)
        draw.line((860, y, 860, y+100), fill='black', width=3)
        draw.text((140, y+25), row[0], fill='black', font=font)
        draw.text((880, y+25), row[1], fill='black', font=font)
    image.save(folder / 'scan.png')
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=(640, 800))
    pdf.drawImage(ImageReader(image), 0, 0, width=640, height=800)
    pdf.showPage()
    pdf.save()
    (folder / 'scan.pdf').write_bytes(output.getvalue())
    with TestClient(create_app(folder / 'storage')) as client:
        uploaded = client.post('/documents', files={'file': ('scan.pdf', output.getvalue())})
        assert uploaded.status_code == 201, uploaded.text
        endpoint = f"/documents/{uploaded.json()['id']}/extract"
        native = client.post(endpoint, json={'selection': {'mode': 'all'}, 'engine': 'native'})
        assert native.status_code == 201 and native.json()['blocks'] == [], native.text
        response = client.post(endpoint, json={'selection': {'mode': 'all'}, 'engine': 'docling'})
        (folder / 'response.json').write_text(json.dumps(response.json(), ensure_ascii=False, indent=2), encoding='utf-8')
        assert response.status_code == 201, response.text
        result = response.json()
        text = ' '.join(b['text'] for b in result['blocks']).lower()
        assert 'manuale' in text and 'rossi' in text and 'bianchi' in text, text
        assert all(b['page'] == 1 for b in result['blocks'])
        print(json.dumps({'ok': True, 'blocks': len(result['blocks']), 'tables': sum('table' in b['label'] for b in result['blocks']),
                          'status': result['status'], 'evidence': str(folder / 'response.json')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
