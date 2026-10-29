import json
from pathlib import Path

import pytest
from formazione_api.generation import generate
from formazione_api.generation.models import ModuleDraft
from formazione_api.generation.pipeline import SOGLIA_SUPERAMENTO_PERCENTO, soglia_predefinita

# Unica fonte della scala, letta anche dal motore TypeScript (packages/learning-engine/src/grade.ts).
SCALA = Path(__file__).resolve().parents[3] / 'packages' / 'contracts' / 'fixtures' / 'grading-scale.json'


def test_soglia_python_coincide_con_la_scala_condivisa():
    assert SOGLIA_SUPERAMENTO_PERCENTO == json.loads(SCALA.read_text(encoding='utf-8'))['sogliaSuperamentoPercento']


@pytest.mark.parametrize('n,attesa', [(1, 1), (2, 2), (3, 2), (4, 3), (5, 3), (7, 5), (10, 6), (20, 12)])
def test_soglia_predefinita_e_il_minimo_intero_al_60_percento(n, attesa):
    assert soglia_predefinita(n) == attesa
    assert attesa * 100 >= 60 * n and (attesa - 1) * 100 < 60 * n


class SetteDomande:
    def module(self, chunk):
        refs = list(dict.fromkeys(p.source_id for p in chunk.pieces))
        return ModuleDraft(title='Modulo', objectives=['Obiettivo'],
                           slides=[dict(heading='T', body='Corpo', highlight='', sourceRefs=refs)],
                           questions=[dict(kind='single', rationales=['', ''], difficulty='base', prompt=f'Domanda {i}?', options=['A', 'B'], correctIndex=0,
                                           explanation='Spiegazione', sourceRefs=refs) for i in range(7)])


def test_pipeline_imposta_la_soglia_predefinita_al_60_percento():
    extraction = dict(id='e', documentId='d', status='ready', warnings=[],
                      blocks=[dict(id='page-1', page=1, label='Pagina 1', text='Testo di formazione.')])
    exam = generate(extraction, SetteDomande())['course']['modules'][0]['exam']
    assert len(exam['questionIds']) == 7
    assert exam['passingScore'] == 5
