"""Ripresa di una generazione interrotta (ripresa_generazione.py, generate(ripresa=...)).

Prima: generate() era atomica; un blocco fallito buttava i moduli già generati e pagati.
"""
import json
from copy import deepcopy

import pytest

from formazione_api import ripresa_generazione as rg
from formazione_api.generation import GenerationError, generate, instructions
from formazione_api.generation.chunks import plan_chunks
from test_generation import FakeProvider

ID = 'a' * 32
TESTO = ('Leggere il manuale prima di iniziare. ' * 300)[:8000]


def estrazione(pagine=4):
    # Ogni pagina è lunga esattamente quanto un blocco (max_chars=8000): un blocco per pagina.
    return dict(id=ID, documentId='document-1', status='ready', warnings=[],
                blocks=[dict(id=f'p{p}', page=p, label=f'Pagina {p}', text=TESTO) for p in range(1, pagine + 1)])


class Interrotto(FakeProvider):
    """FakeProvider che fallisce al blocco `fallisce` (una volta sola se `una_volta`)."""

    def __init__(self, fallisce=None):
        super().__init__()
        self.fallisce = fallisce

    def module(self, chunk):
        if chunk.id == self.fallisce:
            self.calls.append(chunk)
            raise GenerationError('provider_error', 'Errore AI controllato')
        return super().module(chunk)


COMUNE = rg.impronta_comune('anthropic', 'claude-haiku-5-5', None, [])


def ripresa(tmp_path, est, comune=COMUNE, ignora=False):
    return rg.Ripresa(tmp_path, est['id'], comune, plan_chunks(est['blocks']), ignora_salvati=ignora)


def senza_id(risultato):
    corso = deepcopy(risultato['course'])
    corso.pop('id')
    return corso


def interrompi_al_terzo(tmp_path, est, comune=COMUNE):
    with pytest.raises(GenerationError) as errore:
        generate(est, Interrotto('chunk-3'), ripresa=ripresa(tmp_path, est, comune))
    return errore.value


def test_blocchi_riusciti_salvati_e_ripresa_dal_primo_mancante(tmp_path):
    est = estrazione()
    errore = interrompi_al_terzo(tmp_path, est)
    assert errore.ripresa == {'savedChunks': 2, 'totalChunks': 4}
    salvato = json.loads((tmp_path / f'{ID}.{rg.SUFFISSO}').read_text(encoding='utf-8'))
    assert sorted(salvato['blocchi']) == ['1', '2']
    voce = salvato['blocchi']['1']
    assert voce['modulo']['id'] == 'module-1'
    assert [d['id'] for d in voce['domande']][0] == 'question-1-1'
    assert voce['copertura']['chunkId'] == 'chunk-1' and voce['obiettivi'] and voce['usage']

    seconda = Interrotto()
    ripreso = generate(est, seconda, ripresa=ripresa(tmp_path, est))
    assert [c.id for c in seconda.calls] == ['chunk-3', 'chunk-4']
    unica = generate(est, FakeProvider())
    assert senza_id(ripreso) == senza_id(unica)
    assert ripreso['coverage'] == unica['coverage']
    assert ripreso['scarti'] == unica['scarti'] and ripreso['warnings'] == unica['warnings']
    assert ripreso['usage']['callCount'] == unica['usage']['callCount'] == 4


def test_il_blocco_e_salvato_prima_del_successivo(tmp_path):
    est = estrazione()
    visti = []

    class Osserva(FakeProvider):
        def module(self, chunk):
            file = tmp_path / f'{ID}.{rg.SUFFISSO}'
            visti.append(sorted(json.loads(file.read_text(encoding='utf-8'))['blocchi']) if file.exists() else [])
            return super().module(chunk)

    generate(est, Osserva(), ripresa=ripresa(tmp_path, est))
    assert visti == [[], ['1'], ['1', '2'], ['1', '2', '3']]


@pytest.mark.parametrize('diversa', [
    dict(modello='claude-sonnet-5-5'),
    dict(fornitore='openai', modello='gpt-5.4-mini'),
    dict(escluse=[7]),
    dict(validatore=('gemini', 'gemini-3-flash')),
], ids=['modello', 'fornitore', 'pagine_escluse', 'validatore'])
def test_impronta_diversa_nessun_riuso(tmp_path, diversa):
    est = estrazione()
    interrompi_al_terzo(tmp_path, est)
    argomenti = dict(fornitore='anthropic', modello='claude-haiku-5-5', validatore=None, escluse=[]) | diversa
    comune = rg.impronta_comune(argomenti['fornitore'], argomenti['modello'], argomenti['validatore'], argomenti['escluse'])
    assert comune != COMUNE
    nuova = ripresa(tmp_path, est, comune)
    assert nuova.stato() == {'savedChunks': 0, 'totalChunks': 4}
    fornitore = FakeProvider()
    generate(est, fornitore, ripresa=nuova)
    assert len(fornitore.calls) == 4


def test_istruzioni_diverse_nessun_riuso(tmp_path, monkeypatch):
    est = estrazione()
    interrompi_al_terzo(tmp_path, est)
    monkeypatch.setattr(instructions, 'ISTRUZIONI_DIDATTICHE', instructions.ISTRUZIONI_DIDATTICHE + ' Altro.')
    comune = rg.impronta_comune('anthropic', 'claude-haiku-5-5', None, [])
    assert comune != COMUNE
    assert ripresa(tmp_path, est, comune).stato()['savedChunks'] == 0


def test_testo_del_blocco_diverso_nessun_riuso_solo_per_quel_blocco(tmp_path):
    est = estrazione()
    interrompi_al_terzo(tmp_path, est)
    cambiata = deepcopy(est)
    cambiata['blocks'][1]['text'] = TESTO[:-1] + '!'
    nuova = ripresa(tmp_path, cambiata)
    assert sorted(nuova.validi) == [1]
    fornitore = FakeProvider()
    generate(cambiata, fornitore, ripresa=nuova)
    assert [c.id for c in fornitore.calls] == ['chunk-2', 'chunk-3', 'chunk-4']


def test_ricomincia_da_capo_rigenera_tutto(tmp_path):
    est = estrazione()
    interrompi_al_terzo(tmp_path, est)
    nuova = ripresa(tmp_path, est, ignora=True)
    assert nuova.stato() == {'savedChunks': 0, 'totalChunks': 4}
    nuova.ricomincia()
    assert not (tmp_path / f'{ID}.{rg.SUFFISSO}').exists()
    fornitore = FakeProvider()
    generate(est, fornitore, ripresa=nuova)
    assert len(fornitore.calls) == 4


def test_senza_ripresa_nessun_file_e_nessun_conteggio(tmp_path):
    est = estrazione()
    with pytest.raises(GenerationError) as errore:
        generate(est, Interrotto('chunk-3'))
    assert errore.value.ripresa is None
    assert not list(tmp_path.iterdir())


def test_errore_prima_dei_blocchi_senza_conteggio(tmp_path):
    est = {**estrazione(), 'status': 'needs_review'}
    with pytest.raises(GenerationError) as errore:
        generate(est, FakeProvider(), ripresa=ripresa(tmp_path, est))
    assert errore.value.code == 'needs_review' and errore.value.ripresa is None


def test_file_rovinato_ignorato(tmp_path):
    est = estrazione()
    (tmp_path / f'{ID}.{rg.SUFFISSO}').write_text('{non json', encoding='utf-8')
    assert ripresa(tmp_path, est).stato()['savedChunks'] == 0

