"""Misura del sovraccarico Anthropic: nessuna rete, nessuna chiave reale, nessuna chiamata che spende."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from formazione_api.generation import GenerationError
from formazione_api.generation.anthropic_provider import AnthropicProvider
from formazione_api.generation.chunks import Chunk, SourcePiece

_PERCORSO = Path(__file__).resolve().parents[1] / 'tools' / 'misura_sovraccarico_anthropic.py'
_spec = importlib.util.spec_from_file_location('misura_sovraccarico_anthropic', _PERCORSO)
ms = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ms)

MODELLO = 'modello-di-prova'


def blocchi():
    testo = 'Paragrafo di formazione con accenti: perché, è.\n\n'
    return [Chunk('chunk-1', (SourcePiece('page-1', 0, len(testo), testo),)),
            Chunk('chunk-2', (SourcePiece('page-2', 0, len(testo * 30), testo * 30),)),
            Chunk('chunk-3', (SourcePiece('page-3', 0, len(testo * 5), testo * 5),)),
            ms.blocco_minimo()]


class ClientFinto:
    """Registra ogni metodo chiamato; solo count_tokens risponde."""

    def __init__(self, contati=100):
        self.chiamate = []
        registra = self.chiamate.append

        def vietato(nome):
            def metodo(**kwargs):
                registra((nome, kwargs))
                raise AssertionError(f'{nome} non doveva essere chiamato')
            return metodo

        def count_tokens(**kwargs):
            registra(('count_tokens', kwargs))
            return SimpleNamespace(input_tokens=contati)
        self.messages = SimpleNamespace(count_tokens=count_tokens, create=vietato('create'), parse=vietato('parse'),
                                        stream=vietato('stream'),
                                        batches=SimpleNamespace(create=vietato('batches.create')))
        self.beta = SimpleNamespace(messages=self.messages)


def richiesta_del_provider(chunk):
    """Ciò che AnthropicProvider passerebbe davvero a messages.create, catturato su un client finto."""
    seen = {}

    def create(**kwargs):
        seen.update(kwargs)
        raise RuntimeError('stop')
    with pytest.raises(GenerationError):
        AnthropicProvider(client=SimpleNamespace(messages=SimpleNamespace(create=create)), model=MODELLO).module(chunk)
    return seen


def test_chiave_assente_esce_senza_creare_il_client(monkeypatch, capsys):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    creati = []
    assert ms.main([], crea_client=lambda: creati.append(1)) == 1
    assert creati == []
    assert 'ANTHROPIC_API_KEY non impostata' in capsys.readouterr().err


def test_chiave_vuota_conta_come_assente(monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', '   ')
    creati = []
    assert ms.main([], crea_client=lambda: creati.append(1)) == 1
    assert creati == []


@pytest.mark.parametrize('nome', ['messages', 'create', 'parse', 'stream', 'batches', 'beta', 'completions'])
def test_client_avvolto_rifiuta_ogni_metodo_diverso_da_count_tokens(nome):
    client = ClientFinto()
    contatore = ms.SoloConteggio(client)
    with pytest.raises(ms.MetodoVietato):
        getattr(contatore, nome)
    with pytest.raises(ms.MetodoVietato):
        setattr(contatore, nome, None)
    assert client.chiamate == []


def test_client_avvolto_su_sdk_vero_non_espone_create():
    client = anthropic.Anthropic(api_key='test-key-not-real', base_url='http://anthropic.invalid')
    contatore = ms.SoloConteggio(client)
    assert not hasattr(contatore, 'messages')
    assert not hasattr(contatore, 'create')


def test_conta_chiama_solo_count_tokens_con_la_richiesta_del_provider():
    client = ClientFinto()
    attese = []
    misure = ms.conta(ms.SoloConteggio(client), [MODELLO], [('sel', blocchi())],
                      intervallo=0, dormi=attese.append)
    assert {nome for nome, _ in client.chiamate} == {'count_tokens'}
    assert len(misure) == len(blocchi())
    for (_, contata), chunk in zip(client.chiamate, blocchi()):
        inviata = richiesta_del_provider(chunk)
        assert inviata.pop('max_tokens') == 16000
        # campo per campo: stesse chiavi e stessi valori, max_tokens escluso (non accettato da count_tokens)
        assert set(contata) == set(inviata)
        for campo in inviata:
            assert contata[campo] == inviata[campo], campo


def test_richiesta_contata_identica_sul_filo_a_quella_del_provider():
    """Con l'SDK vero e un trasporto finto: il corpo HTTP di /v1/messages/count_tokens coincide con
    quello di /v1/messages del provider, tranne max_tokens."""
    corpi = []

    def handler(request):
        corpo = json.loads(request.content)
        corpi.append((request.url.path, corpo))
        if request.url.path.endswith('/count_tokens'):
            return httpx2.Response(200, json={'input_tokens': 321})
        return httpx2.Response(500, json={'type': 'error', 'error': {'type': 'api_error', 'message': 'stop'}})

    def client():
        return anthropic.Anthropic(api_key='test-key-not-real', base_url='http://anthropic.invalid', max_retries=0,
                                   http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))
    chunk = blocchi()[1]
    with pytest.raises(GenerationError):
        AnthropicProvider(client=client(), model=MODELLO).module(chunk)
    misure = ms.conta(ms.SoloConteggio(client()), [MODELLO], [('sel', [chunk])], intervallo=0)
    (percorso_invio, inviato), (percorso_conto, contato) = corpi
    assert percorso_invio == '/v1/messages'
    assert percorso_conto == '/v1/messages/count_tokens'
    assert inviato.pop('max_tokens') == 16000
    assert contato == inviato
    assert misure[0]['contati'] == 321


def test_campo_non_accettato_da_count_tokens_rifiutato(monkeypatch):
    originale = ms.richiesta
    monkeypatch.setattr(ms, 'richiesta', lambda m, c: {**originale(m, c), 'campo_nuovo': 1})
    with pytest.raises(ValueError, match='campo_nuovo'):
        ms.richiesta_conteggio(MODELLO, blocchi()[0])


def test_ritmo_al_massimo_una_richiesta_al_secondo():
    tempo = [0.0]
    attese = []

    def dormi(s):
        attese.append(s)
        tempo[0] += s
    ms.conta(ms.SoloConteggio(ClientFinto()), [MODELLO, 'altro'], [('sel', blocchi()[:2])],
             orologio=lambda: tempo[0], dormi=dormi)
    assert attese == [1.0, 1.0, 1.0]


def test_misura_registra_maggiorante_differenza_e_rapporto():
    chunk = blocchi()[0]
    misura = ms.conta(ms.SoloConteggio(ClientFinto(contati=50)), [MODELLO], [('sel', [chunk])], intervallo=0)[0]
    assert misura['maggioranteByte'] == ms.maggiorante_byte(chunk)
    assert misura['maggioranteByte'] == misura['byteIstruzioni'] + misura['byteMateriale'] + misura['byteSchema']
    assert misura['differenza'] == 50 - misura['maggioranteByte']
    assert misura['rapporto'] == round(50 / misura['maggioranteByte'], 4)


def test_campione_corto_medio_lungo():
    scelti = ms.campione(blocchi()[:3])
    assert [c.id for c in scelti] == ['chunk-1', 'chunk-3', 'chunk-2']
    assert [c.id for c in ms.campione(blocchi()[:1])] == ['chunk-1']


def m(contati, maggiorante):
    return dict(contati=contati, maggioranteByte=maggiorante, differenza=contati - maggiorante,
                rapporto=round(contati / maggiorante, 4))


def test_quota_quando_i_conteggi_superano_il_maggiorante():
    q = ms.quota([m(1000, 900), m(500, 480), m(100, 300)])
    assert q['scartoMassimo'] == 100
    assert q['margine'] == 50                    # ⌈5% × 1000⌉
    assert q['quotaProposta'] == 150
    assert q['copertoDalMaggiorante'] is False
    assert 'NON copre' in q['giudizio']


def test_quota_quando_il_maggiorante_copre_con_largo_margine():
    q = ms.quota([m(3000, 9000), m(301, 1000)])
    assert q['scartoMassimo'] == -699
    assert q['margine'] == 150
    assert q['quotaProposta'] == 150             # max(0, scarto) + margine
    assert q['copertoDalMaggiorante'] is True
    assert 'copre già' in q['giudizio']


def test_quota_margine_arrotondato_per_eccesso_e_campione_vuoto():
    assert ms.quota([m(101, 1000)])['margine'] == 6
    with pytest.raises(ValueError):
        ms.quota([])


@pytest.mark.parametrize('stato,tipo,attesa', [
    (401, 'authentication_error', 'ANTHROPIC_API_KEY'),
    (403, 'permission_error', 'Permesso negato'),
    (402, 'billing_error', 'fatturazione'),
    (429, 'rate_limit_error', 'Limite di richieste'),
    (404, 'not_found_error', 'non trovata'),
])
def test_errori_dello_sdk_messaggio_leggibile_senza_traceback(stato, tipo, attesa, monkeypatch, tmp_path, capsys):
    def handler(request):
        return httpx2.Response(stato, json={'type': 'error', 'error': {'type': tipo, 'message': 'x'}})
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    monkeypatch.setattr(ms, 'ROOT', tmp_path)
    monkeypatch.setattr(ms, 'prepara_gruppi', lambda scelta: ([('sel', blocchi()[:1])], [], [MODELLO]))
    codice = ms.main([], crea_client=lambda: anthropic.Anthropic(
        api_key='test-key-not-real', base_url='http://anthropic.invalid', max_retries=0,
        http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler))))
    assert codice == 2
    err = capsys.readouterr().err
    assert attesa in err and 'Traceback' not in err
    rapporto = json.loads(next((tmp_path / 'var' / 'misure').glob('sovraccarico-anthropic-*.json')).read_text(encoding='utf-8'))
    assert attesa in rapporto['errore']


def test_corsa_completa_scrive_rapporto_e_non_tocca_prezzi(monkeypatch, tmp_path, capsys):
    from formazione_api.measurement.prezzi import PREZZI as prezzi
    prima = prezzi.read_bytes()
    client = ClientFinto(contati=10)
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'test-key-not-real')
    monkeypatch.setattr(ms, 'ROOT', tmp_path)
    monkeypatch.setattr(ms, 'INTERVALLO_SECONDI', 0)
    monkeypatch.setattr(ms, 'prepara_gruppi', lambda scelta: ([('sel', blocchi()[:2])], [], [MODELLO]))
    assert ms.main([], crea_client=lambda: client) == 0
    assert {nome for nome, _ in client.chiamate} == {'count_tokens'}
    out = capsys.readouterr().out
    assert 'copre già' in out and 'Valore proposto' in out
    rapporto = json.loads(next((tmp_path / 'var' / 'misure').glob('sovraccarico-anthropic-*.json')).read_text(encoding='utf-8'))
    assert len(rapporto['misure']) == 2
    assert rapporto['quota']['copertoDalMaggiorante'] is True
    assert prezzi.read_bytes() == prima
