"""Impostazioni del fornitore AI dalla schermata dell'app: GET/PUT /settings.

Uso locale con un solo operatore. Ogni punto di sicurezza ha il suo test: solo richieste locali,
chiavi mai restituite né scritte nei log o nei messaggi d'errore, campo vuoto che non cancella,
CORS invariata.
"""
import logging
import os

import pytest
from fastapi.testclient import TestClient

from formazione_api import ambiente, impostazioni
from formazione_api.generation import selection
from formazione_api.main import create_app
from formazione_api.measurement.prezzi import PrezzoMancante, carica, modelli, prezzo
from formazione_api.spesa_generazione import PREZZI
from test_api import extraction, upload

CHIAVE = 'sk-ant-prova-0000-segreta-1234'
LOCALE = ('127.0.0.1', 50000)
VARIABILI = ('GENERATION_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL')


@pytest.fixture
def env_pulito():
    """PUT /settings scrive in os.environ: l'ambiente del processo torna com'era dopo ogni test."""
    salvato = dict(os.environ)
    for nome in VARIABILI:
        os.environ.pop(nome, None)
    yield
    os.environ.clear()
    os.environ.update(salvato)


@pytest.fixture
def env_file(tmp_path, monkeypatch, env_pulito):
    percorso = tmp_path / 'config' / '.env'
    monkeypatch.setenv('FORMAZIONE_ENV_FILE', str(percorso))
    return percorso


@pytest.fixture
def app(tmp_path, env_file):
    return create_app(tmp_path / 'dati')


@pytest.fixture
def client(app):
    return TestClient(app, base_url='http://127.0.0.1:8000', client=LOCALE)


def salva(client, **corpo):
    return client.put('/settings', json=corpo)


def fornitore(stato, nome):
    return next(f for f in stato['providers'] if f['id'] == nome)


# --- Lettura ----------------------------------------------------------------------------------

def test_fornitori_letti_dal_codice_di_selezione(client):
    stato = client.get('/settings').json()
    assert [f['id'] for f in stato['providers']] == list(selection.FORNITORI)


def test_convenzione_dei_nomi_delle_variabili_vale_per_ogni_fornitore(env_pulito):
    """impostazioni.py scrive <FORNITORE>_API_KEY e <FORNITORE>_MODEL: sono le variabili che ogni
    fornitore chiede davvero (config_status), e GENERATION_PROVIDER è quella letta dalla selezione."""
    for nome, modulo in selection.FORNITORI.items():
        assert modulo.config_status()['missing'] == [impostazioni.variabile_chiave(nome), impostazioni.variabile_modello(nome)]
        os.environ[impostazioni.VARIABILE_FORNITORE] = nome
        assert selection.selected_name() == nome


def test_modelli_ammessi_sono_solo_quelli_con_prezzo(client):
    listino = carica(PREZZI)
    attesi = {}
    for nome, modello in modelli(listino):
        try:
            p = prezzo(listino, nome, modello)
        except PrezzoMancante:
            continue
        attesi.setdefault(nome, {})[modello] = p
    stato = client.get('/settings').json()
    for voce in stato['providers']:
        assert {m['id'] for m in voce['models']} == set(attesi.get(voce['id'], {}))
        for m in voce['models']:
            p = attesi[voce['id']][m['id']]
            assert (m['inputUsdPerMTok'], m['outputUsdPerMTok'], m['cachedInputUsdPerMTok']) == (str(p.ingresso), str(p.uscita), str(p.ingresso_cache))
    assert any(m['id'] == 'claude-haiku-5-5' for m in fornitore(stato, 'anthropic')['models'])


def test_quota_per_chiamata_misurata_per_fornitore(client):
    stato = client.get('/settings').json()
    assert fornitore(stato, 'anthropic')['perCallOverheadMeasured'] is True
    openai = fornitore(stato, 'openai')
    assert openai['perCallOverheadMeasured'] is False
    assert 'rifiutata' in openai['notice']


def test_senza_configurazione(client):
    stato = client.get('/settings').json()
    assert stato['configured'] is False
    assert stato['activeProvider'] == 'openai'
    assert all(f['keyConfigured'] is False and f['keyLast4'] is None for f in stato['providers'])


def test_chiave_mostrata_solo_con_le_ultime_quattro_cifre(client):
    os.environ['ANTHROPIC_API_KEY'] = CHIAVE
    risposta = client.get('/settings')
    voce = fornitore(risposta.json(), 'anthropic')
    assert voce['keyConfigured'] is True and voce['keyLast4'] == '1234'
    assert CHIAVE not in risposta.text and 'segreta' not in risposta.text


def test_chiave_corta_non_mostra_cifre():
    assert impostazioni.ultime_cifre('abcd1234') is None
    assert impostazioni.ultime_cifre('x' * 12 + '9876') == '9876'


# --- Salvataggio ------------------------------------------------------------------------------

def test_salva_scrive_il_file_e_applica_senza_riavvio(client, env_file):
    env_file.parent.mkdir(parents=True)
    env_file.write_text('# mie note\nGENERATION_BUDGET_USD=3.00\nANTHROPIC_MODEL=vecchio\n', encoding='utf-8')
    risposta = salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE)
    assert risposta.status_code == 200, risposta.text
    testo = env_file.read_text(encoding='utf-8')
    assert testo.startswith('# mie note\nGENERATION_BUDGET_USD=3.00\nANTHROPIC_MODEL=claude-haiku-5-5\n')
    assert ambiente.leggi(testo) == {'GENERATION_BUDGET_USD': '3.00', 'ANTHROPIC_MODEL': 'claude-haiku-5-5',
                                     'GENERATION_PROVIDER': 'anthropic', 'ANTHROPIC_API_KEY': CHIAVE}
    assert os.environ['ANTHROPIC_API_KEY'] == CHIAVE and os.environ['GENERATION_PROVIDER'] == 'anthropic'
    stato = risposta.json()
    assert stato['configured'] is True and stato['activeProvider'] == 'anthropic' and stato['activeModel'] == 'claude-haiku-5-5'
    assert client.get('/generation/config').json()['configured'] is True
    # Un nuovo avvio legge lo stesso file: il salvataggio non vive solo nel processo.
    for nome in VARIABILI:
        os.environ.pop(nome, None)
    create_app(env_file.parent / 'dati')
    assert os.environ['ANTHROPIC_API_KEY'] == CHIAVE and os.environ['ANTHROPIC_MODEL'] == 'claude-haiku-5-5'


def test_il_preventivo_vede_subito_la_nuova_configurazione(client):
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    estratto = extraction(client, doc, {'mode': 'all'}).json()
    prima = client.get(f"/extractions/{estratto['id']}/generation-estimate").json()
    assert prima['available'] is False and prima['refusal']['code'] == 'not_configured'
    assert salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE).status_code == 200
    dopo = client.get(f"/extractions/{estratto['id']}/generation-estimate").json()
    assert dopo['available'] is True and dopo['allowed'] is True and dopo['model'] == 'claude-haiku-5-5'


def test_openai_si_salva_ma_il_tetto_rifiuta(client):
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    estratto = extraction(client, doc, {'mode': 'all'}).json()
    assert salva(client, provider='openai', model='gpt-6-luna', apiKey='sk-proj-prova-0000-5678').status_code == 200
    stima = client.get(f"/extractions/{estratto['id']}/generation-estimate").json()
    assert stima['available'] is False and 'quota per chiamata' in stima['refusal']['message']


@pytest.mark.parametrize('corpo, frammento', [
    ({'provider': 'anthropic', 'model': 'claude-inesistente'}, 'senza prezzo'),
    ({'provider': 'anthropic', 'model': 'gpt-6-luna'}, 'senza prezzo'),
    ({'provider': 'mistral', 'model': 'x'}, 'non supportato'),
    ({'provider': 'anthropic'}, 'modello'),
    ({'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'altro': 1}, 'non ammesso'),
])
def test_rifiuti_leggibili_senza_scrivere(client, env_file, corpo, frammento):
    risposta = salva(client, **corpo)
    assert risposta.status_code == 422
    assert frammento in risposta.json()['detail']['message']
    assert not env_file.exists()
    assert 'GENERATION_PROVIDER' not in os.environ


def test_corpo_non_json_o_non_oggetto(client):
    for contenuto in (b'non json', b'[1, 2]', b'"stringa"'):
        risposta = client.put('/settings', content=contenuto, headers={'Content-Type': 'application/json'})
        assert risposta.status_code == 422
        assert risposta.json()['detail']['code'] == 'invalid_settings'


def test_campo_chiave_vuoto_non_cancella(client, env_file):
    salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE)
    for vuoto in ('', '   ', None):
        assert salva(client, provider='anthropic', model='claude-sonnet-5-5', apiKey=vuoto).status_code == 200
        assert os.environ['ANTHROPIC_API_KEY'] == CHIAVE
        assert ambiente.leggi(env_file.read_text(encoding='utf-8'))['ANTHROPIC_API_KEY'] == CHIAVE
    assert salva(client, provider='anthropic', model='claude-sonnet-5-5').status_code == 200
    assert os.environ['ANTHROPIC_API_KEY'] == CHIAVE


def test_rimuovi_chiave_esplicito(client, env_file):
    salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE)
    risposta = salva(client, provider='anthropic', model='claude-haiku-5-5', removeKey=True)
    assert risposta.status_code == 200
    assert 'ANTHROPIC_API_KEY' not in os.environ
    assert 'ANTHROPIC_API_KEY' not in ambiente.leggi(env_file.read_text(encoding='utf-8'))
    assert fornitore(risposta.json(), 'anthropic')['keyConfigured'] is False
    assert risposta.json()['configured'] is False


def test_rimuovi_e_chiave_insieme_rifiutato(client):
    risposta = salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE, removeKey=True)
    assert risposta.status_code == 422
    assert CHIAVE not in risposta.text


def test_scrittura_atomica_conserva_il_file_se_fallisce(client, env_file, monkeypatch):
    env_file.parent.mkdir(parents=True)
    env_file.write_text('ANTHROPIC_MODEL=claude-haiku-5-5\n', encoding='utf-8')

    def guasto(*_):
        raise OSError('disco pieno')
    monkeypatch.setattr(impostazioni.os, 'replace', guasto)
    client_tollerante = TestClient(client.app, base_url='http://127.0.0.1:8000', client=LOCALE, raise_server_exceptions=False)
    risposta = client_tollerante.put('/settings', json={'provider': 'anthropic', 'model': 'claude-sonnet-5-5', 'apiKey': CHIAVE})
    assert risposta.status_code == 500
    assert CHIAVE not in risposta.text
    assert env_file.read_text(encoding='utf-8') == 'ANTHROPIC_MODEL=claude-haiku-5-5\n'
    assert list(env_file.parent.iterdir()) == [env_file]
    assert 'ANTHROPIC_API_KEY' not in os.environ


def test_aggiorna_testo_puro():
    testo = '# nota\nA=1\nANTHROPIC_MODEL=x\n\nANTHROPIC_MODEL=doppione\nB=2'
    nuovo = impostazioni.aggiorna_testo(testo, {'ANTHROPIC_MODEL': 'y', 'C': '3', 'B': None})
    assert nuovo == '# nota\nA=1\nANTHROPIC_MODEL=y\n\nC=3\n'


# --- Sicurezza --------------------------------------------------------------------------------

@pytest.mark.parametrize('origine', [('192.168.1.20', 50000), ('10.0.2.2', 50000), ('testclient', 50000)])
def test_solo_richieste_locali(app, env_file, origine):
    remoto = TestClient(app, base_url='http://127.0.0.1:8000', client=origine)
    assert remoto.get('/settings').status_code == 403
    assert remoto.put('/settings', json={'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'apiKey': CHIAVE}).status_code == 403
    assert not env_file.exists() and 'ANTHROPIC_API_KEY' not in os.environ


def test_ipv6_locale_ammesso(app):
    assert TestClient(app, base_url='http://[::1]:8000', client=('::1', 50000)).get('/settings').status_code == 200
    assert TestClient(app, base_url='http://localhost:8000', client=LOCALE).get('/settings').status_code == 200


def test_host_non_locale_rifiutato(app):
    """Protezione dal DNS rebinding: un sito che risolve il proprio nome su 127.0.0.1 manda un Host diverso."""
    assert TestClient(app, base_url='http://sito-estraneo.example:8000', client=LOCALE).get('/settings').status_code == 403


def test_chiave_mai_nei_messaggi_d_errore(client):
    casi = [
        {'provider': 'anthropic', 'model': 'claude-inesistente', 'apiKey': CHIAVE},
        {'provider': 'mistral', 'model': 'x', 'apiKey': CHIAVE},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'apiKey': CHIAVE + '\nALTRA=1'},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'apiKey': CHIAVE + ' spazio'},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'apiKey': [CHIAVE]},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'apiKey': 'x' * 600 + CHIAVE},
        {'provider': CHIAVE, 'model': CHIAVE},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', CHIAVE: 1},
        {'provider': 'anthropic', 'model': 'claude-haiku-5-5', 'removeKey': CHIAVE},
    ]
    for corpo in casi:
        risposta = salva(client, **corpo)
        assert risposta.status_code == 422, corpo
        assert 'segreta' not in risposta.text, risposta.text


def test_chiave_con_a_capo_non_inietta_righe(client, env_file):
    assert salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey='sk-ant-prova\nGENERATION_PROVIDER=openai').status_code == 422
    assert not env_file.exists()


def test_chiave_mai_nei_log(client, caplog):
    caplog.set_level(logging.DEBUG)
    salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE)
    client.get('/settings')
    salva(client, provider='anthropic', model='claude-inesistente', apiKey=CHIAVE)
    salva(client, provider='anthropic', model='claude-haiku-5-5', apiKey=CHIAVE + '\n')
    assert 'segreta' not in caplog.text


def test_cors_invariata_solo_origini_locali(client):
    def preflight(origine):
        return client.options('/settings', headers={'Origin': origine, 'Access-Control-Request-Method': 'PUT',
                                                     'Access-Control-Request-Headers': 'Content-Type'})
    assert preflight('http://localhost:8081').headers.get('access-control-allow-origin') == 'http://localhost:8081'
    estranea = preflight('https://sito-estraneo.example')
    assert estranea.status_code == 400 and 'access-control-allow-origin' not in estranea.headers
