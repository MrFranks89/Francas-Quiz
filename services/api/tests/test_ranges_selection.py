import pytest
from formazione_api.models import (
    AllSelection,
    PageInterval,
    RangeSelection,
    RangesSelection,
    merge_intervals,
    selected_pages,
)


def test_merge_intervals_sovrapposti_e_adiacenti():
    intervals = [(10, 15), (1, 5), (4, 8), (16, 20)]
    merged = merge_intervals(intervals)
    assert merged == [(1, 8), (10, 20)]


def test_ranges_selection_pagine_disgiunte():
    sel = RangesSelection(
        mode='ranges',
        intervals=[
            PageInterval(fromPage=2, toPage=3),
            PageInterval(fromPage=7, toPage=8),
        ],
    )
    pages = selected_pages(sel, 20, 'pdf')
    assert pages == [2, 3, 7, 8]


def test_ranges_selection_duplicati_e_fusione():
    sel = RangesSelection(
        mode='ranges',
        intervals=[
            PageInterval(fromPage=5, toPage=10),
            PageInterval(fromPage=5, toPage=10),
            PageInterval(fromPage=7, toPage=12),
        ],
    )
    pages = selected_pages(sel, 30, 'pdf')
    assert pages == [5, 6, 7, 8, 9, 10, 11, 12]


def test_ranges_selection_fuori_limite():
    sel_oltre = RangesSelection(
        mode='ranges',
        intervals=[PageInterval(fromPage=10, toPage=25)],
    )
    with pytest.raises(ValueError, match='Intervallo non valido'):
        selected_pages(sel_oltre, 20, 'pdf')

    sel_inverso = RangesSelection(
        mode='ranges',
        intervals=[PageInterval(fromPage=15, toPage=10)],
    )
    with pytest.raises(ValueError, match='Intervallo non valido'):
        selected_pages(sel_inverso, 20, 'pdf')


def test_ranges_selection_rifiuta_non_pdf():
    sel = RangesSelection(
        mode='ranges',
        intervals=[PageInterval(fromPage=1, toPage=2)],
    )
    with pytest.raises(ValueError, match='non si applica a questo formato'):
        selected_pages(sel, 10, 'docx')


def test_retrocompatibilita_all_e_range():
    all_sel = AllSelection(mode='all')
    assert selected_pages(all_sel, 10, 'pdf') == (1, 10)

    range_sel = RangeSelection(mode='range', fromPage=2, toPage=5)
    assert selected_pages(range_sel, 10, 'pdf') == (2, 5)
