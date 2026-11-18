from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt


class AllSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['all']


class RangeSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['range']
    fromPage: StrictInt
    toPage: StrictInt


class ExtractionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    selection: Annotated[AllSelection | RangeSelection, Field(discriminator='mode')]
    engine: Literal['native', 'docling'] = 'native'


def selected_pages(selection, count, kind):
    if selection.mode == 'all':
        return (1, count) if count else (None, None)
    if kind != 'pdf':
        raise ValueError('La selezione per pagina non si applica a questo formato: verrà letto tutto il documento.')
    if not 1 <= selection.fromPage <= selection.toPage <= count:
        raise ValueError(f'Intervallo non valido: indicare pagine da 1 a {count}, in ordine crescente.')
    return selection.fromPage, selection.toPage
