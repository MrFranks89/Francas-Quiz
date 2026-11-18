"""Bozze di domanda per i test, nella forma piatta di QuestionDraft (generation/bozze.py).

Ogni campo di ogni tipo è obbligatorio nello schema inviato ai fornitori; qui i campi che il tipo non usa
prendono il valore neutro che le istruzioni chiedono al modello, così i test scrivono solo ciò che conta.
"""

NEUTRI = dict(situation='', sentence='', wrong='', options=[], correctIndex=0, correctIndexes=[], correct=False,
              pairTerms=[], rationales=[])


def bozza(**campi) -> dict:
    """Una bozza di domanda: i campi dati, più i neutri per quelli mancanti."""
    return {**NEUTRI, **campi}
