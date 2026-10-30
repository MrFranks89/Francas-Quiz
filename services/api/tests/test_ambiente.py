"""File .env del server: parser minimo nostro e caricamento all'avvio senza sovrascrivere l'ambiente."""
import os

from formazione_api import ambiente
from formazione_api.main import create_app


def test_parser_righe_commenti_vuote_e_virgolette():
    testo = '\n'.join([
        '# commento iniziale',
        '',
        'GENERATION_PROVIDER=anthropic',
        '  ANTHROPIC_MODEL = claude-haiku-5-5  ',
        "ANTHROPIC_API_KEY='sk-ant-prova-0000'",
        'OPENAI_MODEL="gpt-6-luna"',
        'VUOTA=',
        '   # commento rientrato',
        'CON_UGUALE=a=b',
        'CON_CANCELLETTO=abc#def',
    ])
    assert ambiente.leggi(testo) == {
        'GENERATION_PROVIDER': 'anthropic', 'ANTHROPIC_MODEL': 'claude-haiku-5-5',
        'ANTHROPIC_API_KEY': 'sk-ant-prova-0000', 'OPENAI_MODEL': 'gpt-6-luna', 'VUOTA': '',
        'CON_UGUALE': 'a=b', 'CON_CANCELLETTO': 'abc#def',
    }


def test_parser_ignora_righe_non_valide_e_virgolette_spaiate():
    testo = 'senza uguale\n1NOME=x\nNOME CON SPAZI=x\n=x\nAPERTA="abc\nMISTE=\'abc"\nBUONA=1'
    assert ambiente.leggi(testo) == {'APERTA': '"abc', 'MISTE': '\'abc"', 'BUONA': '1'}


def test_parser_fine_riga_windows_e_bom():
    assert ambiente.leggi('﻿A=1\r\nB=2\r\n') == {'A': '1', 'B': '2'}


def test_parser_ultima_occorrenza_vince():
    assert ambiente.leggi('A=1\nA=2') == {'A': '2'}


def test_righe_non_valide_segnalate_senza_contenuto(caplog):
    caplog.set_level('WARNING')
    ambiente.leggi('ANTHROPIC_API_KEY sk-ant-segreto-9999\nB=1')
    assert 'riga 1' in caplog.text
    assert 'segreto' not in caplog.text


def test_carica_non_sovrascrive_ambiente(tmp_path, monkeypatch):
    percorso = tmp_path / '.env'
    percorso.write_text('PROVA_GIA_IMPOSTATA=dal-file\nPROVA_NUOVA=dal-file\n', encoding='utf-8')
    monkeypatch.setenv('PROVA_GIA_IMPOSTATA', 'dal-processo')
    monkeypatch.delenv('PROVA_NUOVA', raising=False)
    impostate = ambiente.carica(percorso)
    try:
        assert os.environ['PROVA_GIA_IMPOSTATA'] == 'dal-processo'
        assert os.environ['PROVA_NUOVA'] == 'dal-file'
        assert impostate == ['PROVA_NUOVA']
    finally:
        os.environ.pop('PROVA_NUOVA', None)


def test_carica_file_assente(tmp_path):
    assert ambiente.carica(tmp_path / 'non-esiste.env') == []


def test_percorso_configurabile(tmp_path, monkeypatch):
    monkeypatch.setenv('FORMAZIONE_ENV_FILE', str(tmp_path / 'prova.env'))
    assert ambiente.percorso() == tmp_path / 'prova.env'
    monkeypatch.delenv('FORMAZIONE_ENV_FILE')
    assert ambiente.percorso().name == '.env'
    assert ambiente.percorso().parent.name == 'api'
    assert ambiente.percorso().parent.parent.name == 'services'


def test_create_app_legge_il_file_all_avvio(tmp_path, monkeypatch):
    """Il percorso vero: create_app (come all'avvio di uvicorn) legge il file indicato."""
    percorso = tmp_path / '.env'
    percorso.write_text('PROVA_AVVIO=letta\n', encoding='utf-8')
    monkeypatch.setenv('FORMAZIONE_ENV_FILE', str(percorso))
    monkeypatch.delenv('PROVA_AVVIO', raising=False)
    try:
        app = create_app(tmp_path / 'dati')
        assert os.environ['PROVA_AVVIO'] == 'letta'
        assert app.state.env_file == percorso
    finally:
        os.environ.pop('PROVA_AVVIO', None)


def test_i_test_non_leggono_il_vero_env():
    """conftest.py punta FORMAZIONE_ENV_FILE a un file inesistente: le chiavi vere non entrano nei test."""
    assert ambiente.percorso().name == 'env-dei-test-inesistente'
    assert not ambiente.percorso().exists()


def test_git_ignora_il_file_env_e_i_temporanei():
    """Il file con le chiavi non deve poter entrare in Git, nemmeno il temporaneo della scrittura atomica."""
    import shutil
    import subprocess
    import pytest
    git = shutil.which('git')
    if git is None:
        pytest.skip('git non disponibile')
    radice = ambiente.PREDEFINITO.parents[2]
    for relativo in ('services/api/.env', 'services/api/.env.scrittura-1234.tmp'):
        esito = subprocess.run([git, '-c', f'safe.directory={radice.as_posix()}', 'check-ignore', '-q', relativo],
                               cwd=radice, capture_output=True)
        assert esito.returncode == 0, f'{relativo} non è ignorato da .gitignore'
