"""Test del Blocco B1: centralizzazione percorsi dati (radice_utente) e parametro scope per spesa."""
from pathlib import Path
import pytest

from formazione_api.account.percorsi import radice_utente
from formazione_api.storage import Store
from formazione_api.gamification import (
    percorso_gamification,
    carica_stato,
    salva_stato,
    stato_iniziale,
)
from formazione_api.spesa_generazione import registro, NOME_REGISTRO


def test_radice_utente_local_e_radice_legacy(tmp_path):
    assert radice_utente('local', tmp_path) == tmp_path


def test_radice_utente_uuid_valido_sotto_utenti(tmp_path):
    valid_uuid = '12345678-1234-1234-1234-123456789abc'
    atteso = tmp_path / 'utenti' / valid_uuid
    assert radice_utente(valid_uuid, tmp_path) == atteso


def test_radice_utente_rifiuta_user_id_con_path_traversal(tmp_path):
    casi_invalidi = [
        '../etc/passwd',
        '..\\windows\\system32',
        'user123',
        '',
        '   ',
        '12345678_1234_1234_1234_123456789abc',
        'local/extra',
    ]
    for caso in casi_invalidi:
        with pytest.raises(ValueError, match="user_id non valido o non consentito"):
            radice_utente(caso, tmp_path)


def test_gamification_percorso_per_utente_e14_1(tmp_path):
    ext_id = 'ext-abcdef123456'
    path_local = percorso_gamification(str(tmp_path), ext_id, user_id='local')
    assert Path(path_local) == tmp_path / f'{ext_id}.gamification.json'

    uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    path_user = percorso_gamification(str(tmp_path), ext_id, user_id=uid)
    assert Path(path_user) == tmp_path / 'utenti' / uid / f'{ext_id}.gamification.json'

    # Verifica persistenza reale sotto radice utente
    stato = stato_iniziale(ext_id)
    stato.xp = 150
    salva_stato(str(tmp_path), stato, user_id=uid)

    assert Path(path_user).exists()
    assert not (tmp_path / f'{ext_id}.gamification.json').exists()

    caricato = carica_stato(str(tmp_path), ext_id, user_id=uid)
    assert caricato.xp == 150


def test_store_per_utente_isola_i_percorsi(tmp_path):
    store_local = Store(tmp_path)
    assert store_local.root == tmp_path

    uid = '11111111-2222-3333-4444-555555555555'
    store_user = store_local.per_utente(uid)
    assert store_user.root == tmp_path / 'utenti' / uid
    assert store_user.base_root == tmp_path

    ident = 'a' * 32
    assert store_user.path(ident, 'course.json') == tmp_path / 'utenti' / uid / f'{ident}.course.json'


def test_spesa_registro_scope(tmp_path):
    store = Store(tmp_path)
    reg_local = registro(store, scope='local')
    assert reg_local.path == tmp_path / NOME_REGISTRO

    uid = '22222222-3333-4444-5555-666666666666'
    reg_user = registro(store, scope=f'user:{uid}')
    assert reg_user.path == tmp_path / 'utenti' / uid / NOME_REGISTRO

    reg_global = registro(store, scope='global')
    assert reg_global.path == tmp_path / f'global_{NOME_REGISTRO}'
