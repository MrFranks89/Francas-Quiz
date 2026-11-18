"""Modelli della generazione: ri-esporta i nomi pubblici dai moduli che li definiscono.

- comune.py: base Model, TipoDomanda, Difficolta, OPZIONI_VERO_FALSO, SPAZIO;
- bozze.py: le bozze inviate ai fornitori come output strutturato (ModuleDraft);
- corso.py: il formato del corso (Course e le sue parti) con i validatori strutturali;
- regole.py: regole di qualità per tipo (errori_tipo, violazioni_tipo, violazioni_domanda);
- soglia.py: soglia predefinita e soglia minima (soglia_minima, errore_soglia_minima).

L'insieme dei nomi è fissato da tests/istantanee/nomi-generation-models.json.
"""
from .bozze import ModuleDraft, QuestionDraft, SlideDraft  # noqa: F401
from .comune import OPZIONI_VERO_FALSO, SPAZIO, Difficolta, Model, TipoDomanda  # noqa: F401
from .corso import Course, Exam, Lesson, Module, Option, Pair, Question, Slide, Source  # noqa: F401
from .regole import errori_tipo, violazioni_domanda, violazioni_tipo  # noqa: F401
from .soglia import errore_soglia_minima, soglia_minima  # noqa: F401
