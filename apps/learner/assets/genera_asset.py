"""Genera gli asset placeholder di Studio Formazione per app.json.

Colori del brand (packages/civis-ui tema chiaro + ui.tsx):
navy #132c3e, teal #087e83, pale #e6f4f1.
Asset: icon.png, splash-mark.png, splash-mark-dark.png,
adaptive-icon-foreground.png, adaptive-icon-monochrome.png.
"""
from PIL import Image, ImageDraw, ImageFont
import matplotlib
from pathlib import Path

RADICE = Path(matplotlib.__file__).parent / 'mpl-data' / 'fonts' / 'ttf'
FONT = str(RADICE / 'DejaVuSans-Bold.ttf')
NAVY = (19, 44, 62, 255)
TEAL = (8, 126, 131, 255)
PALE = (230, 244, 241, 255)
BIANCO = (255, 255, 255, 255)
TRASPARENTE = (0, 0, 0, 0)
DEST = Path(__file__).parent


def monogramma(disegna: ImageDraw.ImageDraw, lato: int, colore, diametro: float) -> None:
    """Disegna «SF» centrato dentro un cerchio sicuro di `diametro` px."""
    corpo = int(diametro * 0.52)
    font = ImageFont.truetype(FONT, corpo)
    testo = 'SF'
    box = disegna.textbbox((0, 0), testo, font=font)
    larghezza, altezza = box[2] - box[0], box[3] - box[1]
    x = (lato - larghezza) / 2 - box[0]
    y = (lato - altezza) / 2 - box[1]
    disegna.text((x, y), testo, font=font, fill=colore)


def nuovo(lato: int, sfondo) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new('RGBA', (lato, lato), sfondo)
    return img, ImageDraw.Draw(img)


# icon.png: 1024x1024 opaco, teal pieno con monogramma bianco.
img, d = nuovo(1024, TEAL)
monogramma(d, 1024, BIANCO, 660)
img.save(DEST / 'icon.png')

# adaptive-icon-foreground.png: 1024 trasparente, marchio nel cerchio sicuro 660.
img, d = nuovo(1024, TRASPARENTE)
monogramma(d, 1024, TEAL, 660)
img.save(DEST / 'adaptive-icon-foreground.png')

# adaptive-icon-monochrome.png: marchio bianco pieno per le icone a tema Android.
img, d = nuovo(1024, TRASPARENTE)
monogramma(d, 1024, BIANCO, 660)
img.save(DEST / 'adaptive-icon-monochrome.png')

# splash-mark.png (tema chiaro) e splash-mark-dark.png (tema scuro): trasparenti.
img, d = nuovo(1024, TRASPARENTE)
monogramma(d, 1024, TEAL, 700)
img.save(DEST / 'splash-mark.png')
img, d = nuovo(1024, TRASPARENTE)
monogramma(d, 1024, PALE, 700)
img.save(DEST / 'splash-mark-dark.png')

print('asset generati in', DEST)
for f in sorted(DEST.glob('*.png')):
    print(' ', f.name, Image.open(f).size)
