from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from formazione_api.documents import KINDS, inspect_document
from formazione_api.generation.errors import GenerationError
from formazione_api.main import create_app
from formazione_api.spesa_generazione import SpesaRifiuto, registro
from formazione_api.spesa_trascrizione import trascrivi_con_tetto
from formazione_api.trascrizione import GroqTrascrizione, trascrivi
from test_api import upload


@pytest.fixture
def fake_mutagen():
    with patch('mutagen.File') as mock_mutagen:
        mock_mutagen.return_value = SimpleNamespace(info=SimpleNamespace(length=300.0))
        yield mock_mutagen


def test_magic_bytes_accettati_e_fake_mp3_rifiutato(tmp_path, fake_mutagen):
    campioni = {
        'audio.mp3': b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 50,
        'audio.m4a': b'\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00' + b'\x00' * 50,
        'audio.mp4': b'\x00\x00\x00\x18ftypisom\x00\x00\x00\x00' + b'\x00' * 50,
        'audio.wav': b'RIFF\x24\x00\x00\x00WAVEfmt \x00\x00\x00\x00' + b'\x00' * 50,
        'audio.ogg': b'OggS\x00\x02\x00\x00\x00\x00\x00\x00' + b'\x00' * 50,
        'audio.webm': b'\x1a\x45\xdf\xa3\x9f\x42\x86\x81' + b'\x00' * 50,
        'audio.flac': b'fLaC\x00\x00\x00\x22' + b'\x00' * 50,
    }
    for filename, content in campioni.items():
        p = tmp_path / filename
        p.write_bytes(content)
        kind, count = inspect_document(p, filename)
        assert kind == 'audio'
        assert count is None

    # File con estensione .mp3 ma contenuto testo semplice -> rifiutato
    falso_mp3 = tmp_path / 'non_audio.mp3'
    falso_mp3.write_bytes(b'Questo testo non e un file audio')
    with pytest.raises(ValueError, match='non corrisponde a un formato audio supportato'):
        inspect_document(falso_mp3, 'non_audio.mp3')


def test_aggregazione_segmenti_in_blocchi(tmp_path, fake_mutagen):
    fake_segments = [
        {'start': 0.0, 'end': 60.0, 'text': 'Primo segmento di spiegazione.'},
        {'start': 60.0, 'end': 120.0, 'text': 'Secondo segmento collegato.'},
        {'start': 120.0, 'end': 180.0, 'text': 'Terzo segmento avanzato.'},
        {'start': 180.0, 'end': 240.0, 'text': 'Quarto segmento dettagliato.'},
        {'start': 240.0, 'end': 300.0, 'text': 'Quinto segmento conclusivo.'},
    ]

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = {
        'text': 'Testo completo.',
        'segments': fake_segments,
    }

    audio_file = tmp_path / 'lezione.mp3'
    audio_file.write_bytes(b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 50)

    gt = GroqTrascrizione(client=mock_client)
    blocks, warnings, status, durata = gt.trascrivi(audio_file)

    assert durata == 300.0
    assert status == 'needs_review'
    assert len(blocks) == 3

    assert blocks[0]['id'] == 'b1'
    assert blocks[0]['label'] == '00:00–02:00'
    assert 'Primo segmento' in blocks[0]['text']
    assert 'Secondo segmento' in blocks[0]['text']

    assert blocks[1]['id'] == 'b2'
    assert blocks[1]['label'] == '02:00–04:00'
    assert 'Terzo segmento' in blocks[1]['text']
    assert 'Quarto segmento' in blocks[1]['text']

    assert blocks[2]['id'] == 'b3'
    assert blocks[2]['label'] == '04:00–05:00'
    assert 'Quinto segmento' in blocks[2]['text']

    assert any('Trascrizione automatica' in w for w in warnings)


def test_audio_senza_parlato(tmp_path, fake_mutagen):
    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = {'text': '', 'segments': []}

    audio_file = tmp_path / 'silenzio.mp3'
    audio_file.write_bytes(b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 50)

    gt = GroqTrascrizione(client=mock_client)
    blocks, warnings, status, _ = gt.trascrivi(audio_file)

    assert blocks == []
    assert status == 'needs_review'
    assert any('Nessun parlato rilevato' in w for w in warnings)


def test_durata_oltre_limite(tmp_path):
    mock_client = MagicMock()
    audio_file = tmp_path / 'lunghissimo.mp3'
    audio_file.write_bytes(b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 50)

    with patch('mutagen.File') as mock_mutagen:
        # 7201 secondi > 7200 secondi (2 ore)
        mock_mutagen.return_value = SimpleNamespace(info=SimpleNamespace(length=7201.0))
        gt = GroqTrascrizione(client=mock_client)
        with pytest.raises(GenerationError) as exc_info:
            gt.trascrivi(audio_file)
        assert exc_info.value.code == 'audio_troppo_lungo'

    mock_client.audio.transcriptions.create.assert_not_called()


def test_tariffa_mancante_in_prezzi_rifiuta(tmp_path):
    app = create_app(tmp_path)
    store = app.state.store
    chiamato = False

    def finto_chiama():
        nonlocal chiamato
        chiamato = True
        return []

    with pytest.raises(SpesaRifiuto) as exc_info:
        trascrivi_con_tetto(store, 100.0, finto_chiama, fornitore='groq', modello='modello-inesistente')

    assert exc_info.value.code == 'estimate_unavailable'
    assert not chiamato


def test_trascrizione_rotta_extract_con_tariffa_zero(tmp_path, fake_mutagen):
    app = create_app(tmp_path)
    mock_provider = MagicMock()
    mock_provider.trascrivi.return_value = (
        [{'id': 'b1', 'text': 'Testo trascritto dal microfono.', 'page': None, 'label': '00:00–02:00', 'kind': 'text'}],
        ['Trascrizione automatica: verificare nomi propri, numeri e termini tecnici prima di generare.'],
        'needs_review',
        120.0,
    )
    app.state.transcription_provider = mock_provider
    client = TestClient(app)

    audio_bytes = b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 100
    doc = upload(client, 'lezione.mp3', audio_bytes)
    assert doc['kind'] == 'audio'

    # Richiediamo 'native': deve essere ignorato e commutato in 'trascrizione'
    res = client.post(
        f"/documents/{doc['id']}/extract",
        json={'selection': {'mode': 'all'}, 'engine': 'native'},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data['engine'] == 'trascrizione'
    assert data['status'] == 'needs_review'
    assert len(data['blocks']) == 1
    assert data['blocks'][0]['text'] == 'Testo trascritto dal microfono.'

    # Verifica nel registro spesa: tariffa zero
    reg = registro(app.state.store)
    corse = reg.leggi()['corse']
    assert len(corse) >= 1
    ultima = corse[-1]
    assert ultima['esito'] == 'completata'
    assert Decimal(str(ultima['addebitatoUSD'])) == Decimal('0')
    assert ultima['chiamate'][0]['ruolo'] == 'trascrizione'
    assert ultima['chiamate'][0]['chunkId'] == 'audio-1'


def test_fallimento_provider_registra_errore(tmp_path, fake_mutagen):
    app = create_app(tmp_path)
    mock_provider = MagicMock()
    mock_provider.trascrivi.side_effect = RuntimeError('Groq API network down')
    app.state.transcription_provider = mock_provider
    client = TestClient(app)

    audio_bytes = b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 100
    doc = upload(client, 'lezione_err.mp3', audio_bytes)

    res = client.post(
        f"/documents/{doc['id']}/extract",
        json={'selection': {'mode': 'all'}},
    )
    assert res.status_code in (422, 502, 503)

    # Verifica che nel registro risulti la corsa fallita con la chiamata in errore
    reg = registro(app.state.store)
    corse = reg.leggi()['corse']
    assert len(corse) >= 1
    ultima = corse[-1]
    assert ultima['esito'] == 'fallita'
    assert ultima['chiamate'][0]['esito'] == 'errore'


def test_nome_senza_estensione_ricostruito_dai_magic_bytes(tmp_path, fake_mutagen):
    # Il file salvato nello storage si chiama «<id>.source»: l'API Groq rifiuta
    # nomi senza estensione, che va ricostruita dal contenuto (E5).
    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = {'text': 'Testo.', 'segments': []}

    audio_file = tmp_path / 'abc123.source'
    audio_file.write_bytes(b'RIFF\x24\x00\x00\x00WAVEfmt ' + b'\x00' * 50)

    gt = GroqTrascrizione(client=mock_client)
    gt.trascrivi(audio_file)

    nome_inviato = mock_client.audio.transcriptions.create.call_args.kwargs['file'][0]
    assert nome_inviato.endswith('.wav')


def test_nome_originale_con_estensione_preservato(tmp_path, fake_mutagen):
    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = {'text': 'Testo.', 'segments': []}

    audio_file = tmp_path / 'abc123.source'
    audio_file.write_bytes(b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 50)

    gt = GroqTrascrizione(client=mock_client)
    gt.trascrivi(audio_file, nome='registrazione lezione.ogg')

    nome_inviato = mock_client.audio.transcriptions.create.call_args.kwargs['file'][0]
    assert nome_inviato == 'registrazione lezione.ogg'


def test_rotta_passa_nome_originale_al_provider(tmp_path, fake_mutagen):
    app = create_app(tmp_path)
    mock_provider = MagicMock()
    mock_provider.trascrivi.return_value = (
        [{'id': 'b1', 'text': 'Testo trascritto.', 'page': None, 'label': '00:00–02:00', 'kind': 'text'}],
        [],
        'needs_review',
        120.0,
    )
    app.state.transcription_provider = mock_provider
    client = TestClient(app)

    audio_bytes = b'ID3\x03\x00\x00\x00\x00\x00\x00' + b'\x00' * 100
    doc = upload(client, 'lezione audio.mp3', audio_bytes)

    res = client.post(
        f"/documents/{doc['id']}/extract",
        json={'selection': {'mode': 'all'}},
    )
    assert res.status_code == 201, res.text
    assert mock_provider.trascrivi.call_args.kwargs['nome'] == 'lezione audio.mp3'
