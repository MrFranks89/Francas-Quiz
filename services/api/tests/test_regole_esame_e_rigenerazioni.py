"""Test per il Blocco E (Ordine 15, E.1 ed E.2).

E.1: Regole d'esame (controllo, sbarramento, e regola automatica sbarramento dopo 2 sezioni).
E.2: Salvataggio corsi in accounts.sqlite3 e contatore rigenerazioni (default 3 con blocco a esaurimento).
"""
import pytest
from types import SimpleNamespace

from formazione_api.account.corsi import (
    salva_corso_utente, puo_rigenerare, consuma_rigenerazione, elenco_corsi_utente, DEFAULT_MAX_RIGENERAZIONI
)
from formazione_api.account.db import inizializza_db
from formazione_api.generation.pipeline import generate
from test_generation import FakeProvider, extraction
from bozze_di_prova import bozza


def test_e1_regola_automatica_sbarramento_dopo_due_sezioni():
    """Se lo sbarramento non è impostato, i primi 2 moduli sono practice, dal 3° in poi diventano gate."""
    blocks = [
        {'id': f'b{i}', 'page': i, 'label': f'P.{i}', 'text': f'Testo blocco {i}. Paragrafo {i}.'}
        for i in range(1, 5)
    ]
    ext = {'id': 'ext-multi', 'documentId': 'doc-multi', 'status': 'ready', 'warnings': [], 'blocks': blocks}
    res = generate(ext, FakeProvider(), max_chars=35)
    mods = res['course']['modules']
    assert len(mods) >= 3
    # Modulo 1 e 2: practice
    assert mods[0]['exam']['mode'] == 'practice'
    assert mods[1]['exam']['mode'] == 'practice'
    # Modulo 3 in poi: gate (regola automatica dopo 2 sezioni)
    assert mods[2]['exam']['mode'] == 'gate'


def test_e1_sbarramento_esplicito():
    """Se lo sbarramento è selezionato esplicitamente, i moduli sono impostati come gate con passingScore."""
    ext = extraction()
    res = generate(ext, FakeProvider(), passing_score_gate=4)
    mod = res['course']['modules'][0]
    assert mod['exam']['mode'] == 'gate'
    assert mod['exam']['passingScore'] >= 4


def test_e2_salvataggio_e_contatore_rigenerazioni(tmp_path):
    """Verifica il salvataggio dei corsi e il limite di 3 rigenerazioni."""
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    uid = "utente-test-1"
    cid = "corso-123"

    # Inizialmente puo rigenerare (0 usate)
    ammesso, usate, massime = puo_rigenerare(db_file, uid, cid)
    assert ammesso is True
    assert usate == 0
    assert massime == DEFAULT_MAX_RIGENERAZIONI

    # Registra corso
    salva_corso_utente(db_file, uid, cid)
    corsi = elenco_corsi_utente(db_file, uid)
    assert len(corsi) == 1
    assert corsi[0]['extractionId'] == cid
    assert corsi[0]['rigenerazioniUsate'] == 0
    assert corsi[0]['rigenerazioniRimanenti'] == 3

    # Consuma 1, 2, 3 rigenerazioni
    ok1, u1, _ = consuma_rigenerazione(db_file, uid, cid)
    assert ok1 is True and u1 == 1

    ok2, u2, _ = consuma_rigenerazione(db_file, uid, cid)
    assert ok2 is True and u2 == 2

    ok3, u3, _ = consuma_rigenerazione(db_file, uid, cid)
    assert ok3 is True and u3 == 3

    # Al 4° tentativo deve fallire
    ammesso, usate, _ = puo_rigenerare(db_file, uid, cid)
    assert ammesso is False
    assert usate == 3

    ok4, u4, _ = consuma_rigenerazione(db_file, uid, cid)
    assert ok4 is False
    assert u4 == 3
