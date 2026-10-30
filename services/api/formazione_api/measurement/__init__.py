"""Misura della generazione sul corpus di prova, con tetto di spesa.

- integrita: sha256 dei file del corpus rispetto al manifest;
- prezzi: prezzi per milione di token letti da formazione_api/config/prezzi.json (prezzi.PREZZI);
- preventivo: limite superiore di token e di costo per blocco e per corsa;
- guardia: decisione di avvio, registro cumulativo della spesa, arresto a metà corsa;
- corsa: estrazione delle selezioni, preventivo e corsa reale attraverso generation.generate().
"""
