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


class PageInterval(BaseModel):
    model_config = ConfigDict(extra='forbid')
    fromPage: StrictInt
    toPage: StrictInt


class RangesSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['ranges']
    intervals: list[PageInterval] = Field(min_length=1, max_length=50)


class ExtractionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    selection: Annotated[AllSelection | RangeSelection | RangesSelection, Field(discriminator='mode')]
    engine: Literal['native', 'docling', 'trascrizione'] = 'native'


def merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    sorted_intervals = sorted(intervals, key=lambda x: (x[0], x[1]))
    merged = [sorted_intervals[0]]
    for current in sorted_intervals[1:]:
        prev_start, prev_end = merged[-1]
        curr_start, curr_end = current
        if curr_start <= prev_end + 1:
            merged[-1] = (prev_start, max(prev_end, curr_end))
        else:
            merged.append(current)
    return merged


def selected_pages(selection, count, kind):
    if selection.mode == 'all':
        return (1, count) if count else (None, None)
    if kind != 'pdf':
        raise ValueError('La selezione per pagina non si applica a questo formato: verrà letto tutto il documento.')
    if selection.mode == 'range':
        if not 1 <= selection.fromPage <= selection.toPage <= count:
            raise ValueError(f'Intervallo non valido: indicare pagine da 1 a {count}, in ordine crescente.')
        return selection.fromPage, selection.toPage
    if selection.mode == 'ranges':
        if not selection.intervals or len(selection.intervals) > 50:
            raise ValueError('Intervalli non validi: richiesto tra 1 e 50 intervalli.')
        raw = []
        for it in selection.intervals:
            if not 1 <= it.fromPage <= it.toPage <= count:
                raise ValueError(f'Intervallo non valido: indicare pagine da 1 a {count}, in ordine crescente.')
            raw.append((it.fromPage, it.toPage))
        merged = merge_intervals(raw)
        pages = []
        for s, e in merged:
            pages.extend(range(s, e + 1))
        return pages
    raise ValueError(f'Modalità di selezione non riconosciuta: {selection.mode}')
