"""Il listino prezzi letto da ogni lettore: strumento di misura, preventivo, app, impostazioni.

Fissa i valori letti oggi, così lo spostamento del file (da tests/corpus a configurazione
dell'applicazione) può essere verificato con gli stessi test prima e dopo: nessun valore cambia,
tutti i lettori leggono lo stesso file.
"""
import hashlib
import importlib.util
import os
from pathlib import Path

import pytest

from formazione_api import impostazioni
from formazione_api.measurement import prezzi as modulo_prezzi
from formazione_api.measurement.prezzi import carica, modelli, prezzo
from formazione_api.spesa_generazione import PREZZI

TOOLS = Path(__file__).resolve().parents[1] / 'tools'

# Contenuto del file al momento dello spostamento: nessun valore può cambiare insieme al percorso.
SHA256_LISTINO = '05ff2707fb39f27b34c95c6c114c9682a00e10a15ab8cb9ed52f469eb6637a69'

# (fornitore, modello, ingresso, uscita, ingressoCache, altriIngressi, moltiplicatore, soglia, quota per chiamata)
ATTESI = [
    ('anthropic', 'claude-opus-5-5', '4', '20', '0.20', ('5', '8'), '1.1', None, 459),
    ('anthropic', 'claude-sonnet-5-5', '2', '10', '0.10', ('2.50', '4'), '1.1', None, 459),
    ('anthropic', 'claude-haiku-5-5', '0.10', '0.50', '0.01', ('0.125', '0.20'), '1.1', 100000, 459),
    ('openai', 'gpt-6-astra', '10.00', '50.00', '1.00', (), '1.1', 272000, None),
    ('openai', 'gpt-6.1-sol', '2.00', '10.00', '0.10', (), '1.1', 272000, None),
    ('openai', 'gpt-5.4-mini', '0.75', '4.50', '0.075', (), '1.1', 272000, None),
    ('openai', 'gpt-6-luna', '0.10', '0.50', '0.01', (), '1.1', 272000, None),
]


class _Letto(Exception):
    pass


def _carica_e_ferma(registrati):
    def finta(path):
        registrati.append(Path(path).resolve())
        raise _Letto
    return finta


def test_listino_dell_app_ha_gli_stessi_valori():
    letto = carica(PREZZI)
    voci = []
    for f, m in modelli(letto):
        p = prezzo(letto, f, m)
        voci.append((f, m, str(p.ingresso), str(p.uscita), str(p.ingresso_cache),
                     tuple(str(v) for v in p.altri_ingressi), str(p.moltiplicatore_massimo),
                     p.soglia_contesto_lungo, p.sovraccarico_ingresso))
    assert voci == ATTESI


def test_listino_ha_lo_stesso_contenuto_byte_per_byte():
    assert hashlib.sha256(Path(PREZZI).read_bytes()).hexdigest() == SHA256_LISTINO


def test_impostazioni_elencano_gli_stessi_modelli():
    voci = impostazioni.listino()
    assert {n: list(v['modelli']) for n, v in voci.items()} == {
        'openai': ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.4-mini', 'gpt-6-luna'],
        'anthropic': ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
        # Fornitore selezionabile ma ancora senza prezzi: nessun modello sceglibile.
        'gemini': [],
    }
    assert {n: v['misurata'] for n, v in voci.items()} == {'openai': False, 'anthropic': True, 'gemini': False}


@pytest.fixture
def strumenti(monkeypatch):
    """measure_generation imposta variabili d'ambiente all'import: ripristinate dopo il test."""
    salvato = dict(os.environ)
    monkeypatch.syspath_prepend(str(TOOLS))
    spec = importlib.util.spec_from_file_location('measure_generation', TOOLS / 'measure_generation.py')
    mg = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(__import__('sys').modules, 'measure_generation', mg)
    spec.loader.exec_module(mg)
    yield mg
    os.environ.clear()
    os.environ.update(salvato)


def test_strumento_di_misura_legge_lo_stesso_file(strumenti, monkeypatch):
    letti = []
    monkeypatch.setattr(strumenti, 'carica', _carica_e_ferma(letti))
    with pytest.raises(_Letto):
        strumenti.main(['preventivo'])
    assert letti == [Path(PREZZI).resolve()]


def test_misura_della_quota_legge_lo_stesso_file(strumenti, monkeypatch):
    spec = importlib.util.spec_from_file_location('misura_sovraccarico_anthropic',
                                                  TOOLS / 'misura_sovraccarico_anthropic.py')
    ms = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ms)
    letti = []
    monkeypatch.setattr(modulo_prezzi, 'carica', _carica_e_ferma(letti))
    with pytest.raises(_Letto):
        ms.prepara_gruppi(None)
    assert letti == [Path(PREZZI).resolve()]


def test_nessun_riferimento_al_vecchio_percorso_del_listino():
    """Il listino stava in tests/corpus ed era letto anche dall'app in produzione: nessun file del
    server o della documentazione deve tornare a indicarlo lì."""
    radice = Path(__file__).resolve().parents[3]
    vecchio = 'corpus' + '/prezzi.json'
    candidati = [*(radice / 'services' / 'api').rglob('*.py'), *(radice / 'docs').rglob('*.md')]
    trovati = [str(p.relative_to(radice)) for p in candidati
               if '.venv' not in p.parts and vecchio in p.read_text(encoding='utf-8').replace('\\', '/')
               and p.resolve() != Path(__file__).resolve()]
    assert trovati == []
    assert Path(PREZZI).resolve() == (radice / 'services' / 'api' / 'formazione_api' / 'config' / 'prezzi.json')
