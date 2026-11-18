"""Base dei modelli e valori comuni a bozze, formato del corso e regole di qualità."""
from typing import Literal
from pydantic import BaseModel, ConfigDict


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid')


# Tipi di domanda: stessi valori e stesse regole di packages/contracts/src/tipi.ts.
TipoDomanda = Literal['single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement', 'multiple',
                      'matching']
# Livelli letti da DifficultyBadge di Civis (packages/civis-ui/src/comune/DifficultyBadge.tsx).
Difficolta = Literal['base', 'medio', 'avanzato']
# Opzioni fisse del vero/falso, nell'ordine di Civis (TrueFalseStep, normalizzaPerRipasso).
OPZIONI_VERO_FALSO = ('Vero', 'Falso')
# Segnaposto della parola mancante (FillBlankStep di Civis).
SPAZIO = '___'
