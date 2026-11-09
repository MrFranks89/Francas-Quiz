"""Prova dello schema su Anthropic (tools/prova_schema_anthropic.py): nessuna rete, nessuna chiave reale,
nessuna chiamata che spende. Solo count_tokens, con la richiesta del provider."""
import importlib.util
import json
from pathlib import Path

import anthropic
import httpx2
import pytest

from formazione_api.generation.anthropic_provider import richiesta

_PERCORSO = Path(__file__).resolve().parents[1] / 'tools' / 'prova_schema_anthropic.py'
_spec = importlib.util.spec_from_file_location('prova_schema_anthropic', _PERCORSO)
ps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ps)

MODELLO = 'modello-di-prova'
STORICO = json.loads((Path(__file__).parent / 'fixtures' / 'schema-anthropic-rifiutato-2026-11-09.json').read_text(encoding='utf-8'))


@pytest.fixture(autouse=True)
def senza_chiavi(monkeypatch):
    # Il file .env dei test non esiste (conftest.py); l'ambiente del processo non deve portare chiavi.
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    monkeypatch.delenv('ANTHROPIC_MODEL', raising=False)


def sdk(handler):
    return anthropic.Anthropic(api_key='test-key-not-real', base_url='http://anthropic.invalid', max_retries=0,
                               http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))


def test_chiave_o_modello_assenti_nessun_client(capsys, monkeypatch):
    creati = []
    assert ps.main([], crea_client=lambda: creati.append(1)) == 1
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    assert ps.main([], crea_client=lambda: creati.append(1)) == 1
    assert creati == []
    err = capsys.readouterr().err
    assert 'ANTHROPIC_MODEL' in err and 'test-key-not-real' not in err


def test_solo_count_tokens_con_la_richiesta_del_provider_e_lo_schema_storico(monkeypatch, capsys):
    """Sul filo: due POST a /v1/messages/count_tokens, nessun altro percorso; il corpo del nuovo è quello di
    AnthropicProvider senza max_tokens, il vecchio differisce solo per output_config."""
    corpi = []

    def handler(request):
        corpi.append((request.method, request.url.path, json.loads(request.content)))
        return httpx2.Response(200, json={'input_tokens': 100 + len(corpi)})
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    assert ps.main(['--modello', MODELLO], crea_client=lambda: sdk(handler)) == 0
    assert [(m, p) for m, p, _ in corpi] == [('POST', '/v1/messages/count_tokens')] * 2
    (_, _, vecchio), (_, _, nuovo) = corpi
    attesa = richiesta(MODELLO, ps.blocco_minimo())
    assert attesa.pop('max_tokens') == 6000
    assert nuovo == json.loads(json.dumps(attesa))
    assert vecchio['output_config'] == STORICO
    assert {k: v for k, v in vecchio.items() if k != 'output_config'} == {k: v for k, v in nuovo.items() if k != 'output_config'}
    out = capsys.readouterr().out
    assert 'ACCETTATO (101' in out and 'ACCETTATO (102' in out
    assert 'NON dice se il nuovo schema passa' in out
    assert 'test-key-not-real' not in out


def test_rifiuto_dello_schema_con_la_causa_di_causa_py(monkeypatch, capsys):
    def handler(request):
        corpo = json.loads(request.content)
        if corpo['output_config'] == STORICO:
            return httpx2.Response(400, json={'type': 'error', 'error': {
                'type': 'invalid_request_error', 'message': 'The compiled grammar is too large'}})
        return httpx2.Response(200, json={'input_tokens': 7})
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    assert ps.main(['--modello', MODELLO], crea_client=lambda: sdk(handler)) == 0
    out = capsys.readouterr().out
    assert 'RIFIUTATO — Richiesta non valida per il fornitore (400): The compiled grammar is too large' in out
    assert 'distingue i due' in out


def test_nuovo_rifiutato_esce_con_2(monkeypatch, capsys):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    rifiuta = lambda request: httpx2.Response(400, json={'type': 'error', 'error': {
        'type': 'invalid_request_error', 'message': 'Schema is too complex for compilation.'}})
    assert ps.main(['--modello', MODELLO], crea_client=lambda: sdk(rifiuta)) == 2
    assert 'va semplificato ancora' in capsys.readouterr().out


def test_chiave_rifiutata_non_e_un_giudizio_sullo_schema(monkeypatch, capsys):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    nega = lambda request: httpx2.Response(401, json={'type': 'error', 'error': {
        'type': 'authentication_error', 'message': 'invalid x-api-key'}})
    assert ps.main(['--modello', MODELLO], crea_client=lambda: sdk(nega)) == 2
    out = capsys.readouterr().out
    assert 'Prova non riuscita, lo schema non c\'entra: Chiave API non valida (401)' in out


@pytest.mark.parametrize('nome', ['messages', 'create', 'parse', 'stream', 'batches', 'beta'])
def test_il_contatore_dello_script_espone_solo_count_tokens(nome):
    contatore = ps.SoloConteggio(sdk(lambda request: httpx2.Response(500)))
    with pytest.raises(ps.MetodoVietato):
        getattr(contatore, nome)


def test_lo_script_non_crea_un_client_senza_avvolgerlo(monkeypatch):
    """main passa il client creato a SoloConteggio prima di qualunque chiamata: con un client che ha solo
    create, la prova fallisce subito invece di generare."""
    creati = []

    class SoloCreate:
        class messages:
            @staticmethod
            def create(**kwargs):
                creati.append(kwargs)

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    with pytest.raises(AttributeError):
        ps.main(['--modello', MODELLO], crea_client=SoloCreate)
    assert creati == []


def test_lo_schema_storico_e_l_istantanea_al_tag():
    """La fixture è lo schema che Anthropic ha rifiutato: anyOf di sette varianti."""
    varianti = STORICO['format']['schema']['properties']['questions']['items']['anyOf']
    assert len(varianti) == 7
