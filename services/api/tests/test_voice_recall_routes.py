"""Test HTTP per le rotte di Coach Orale (Voice Recall - D.6)."""
import io
import json
import os
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from formazione_api.generation.validazione import ValutatoreOrale
from formazione_api.main import create_app
from formazione_api.measurement.guardia import adesso
from formazione_api.spesa_generazione import GENERAZIONE_IN_CORSO, registro
from formazione_api.voice_recall import ValutazioneOraleLLM
from test_api import extraction, upload


class FakeTranscriptionProvider:
    def __init__(self, blocks=None, durata=10.0, fallisci=False):
        self.provider_name = 'groq'
        self.model = 'whisper-large-v3-turbo'
        self.durata = durata
        self.fallisci = fallisci
        self.chiamato = False
        self.blocks = blocks or [{'id': 'b1', 'text': 'La scarsita comporta sempre un costo opportunita significativo per la societa.'}]

    def trascrivi(self, path, nome=None):
        self.chiamato = True
        if self.fallisci:
            raise RuntimeError("Errore fornitore trascrizione")
        return self.blocks, [], 'completed', self.durata


class FakeVoiceEvaluator:
    def __init__(self, score=85, covered=None, missing=None, advice="Spiegazione chiara.", fallisci=False):
        self.provider_name = 'anthropic'
        self.model = 'claude-haiku-5-5'
        self.score = score
        self.covered = covered or ['Scarsità']
        self.missing = missing or []
        self.advice = advice
        self.fallisci = fallisci
        self.ultimo_prompt = None
        self.last_usage = {'inputTokens': 120, 'outputTokens': 40, 'retriesTaken': 0}

    def valuta(self, prompt: str):
        self.ultimo_prompt = prompt
        if self.fallisci:
            raise RuntimeError("LLM evaluation error")
        return ValutazioneOraleLLM(
            score=self.score,
            covered=self.covered,
            missing=self.missing,
            advice=self.advice,
        )


def _prepara_corso(client, app, complete=True):
    doc = upload(client, "economia.txt", b"La scarsita di risorse implica che ogni scelta comporta un costo opportunita.")
    ext = extraction(client, doc, {"mode": "all"}).json()
    ext_id = ext["id"]

    tree_record = {
        "treeHash": "hash_valido",
        "complete": complete,
        "tree": {
            "rootTitle": "Corso Economia",
            "branches": [
                {
                    "id": "branch-1",
                    "title": "Basi Economiche",
                    "originBlocks": ["b1"],
                    "nodes": [
                        {
                            "id": "node-1-1",
                            "title": "Costo Opportunità",
                            "summary": "Il valore della migliore alternativa a cui si rinuncia per via della scarsita.",
                            "originBlocks": ["b1"],
                            "sourceRefs": ["p. 1"],
                            "keyTerms": ["Scarsità"],
                        }
                    ],
                }
            ],
        },
    }
    app.state.store.save(ext_id, "concept-tree.json", tree_record)
    return ext_id


def test_testo_solo_nessuna_trascrizione(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    fake_tr = FakeTranscriptionProvider()
    app.state.transcription_provider = fake_tr
    app.state.voice_evaluator = FakeVoiceEvaluator()

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "La scarsita genera necessariamente delle scelte e un costo opportunita.", "nodeId": "node-1-1"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert fake_tr.chiamato is False
    assert data["inputTipo"] == "testo"
    assert data["score"] >= 0
    assert "costUsd" in data
    assert isinstance(data["costUsd"], str)


def test_audio_trascritto_e_valutato(tmp_path, monkeypatch):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    fake_tr = FakeTranscriptionProvider(durata=5.0)
    fake_ev = FakeVoiceEvaluator()
    app.state.transcription_provider = fake_tr
    app.state.voice_evaluator = fake_ev

    # Mock mutagen per non richiedere file audio binario reale
    import mutagen
    monkeypatch.setattr(mutagen, 'File', lambda p: MagicMock(info=MagicMock(length=5.0)))

    audio_file = io.BytesIO(b"RIFFdummyWAVEdata")
    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"nodeId": "node-1-1"},
        files={"audio": ("speech.wav", audio_file, "audio/wav")},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert fake_tr.chiamato is True
    assert data["transcript"] != ""
    assert data["inputTipo"] == "audio"
    assert data["durataSecondi"] == 5.0
    # Verifica che nel registro ci siano trascrizione e valutazione
    reg = registro(app.state.store)
    corse = reg.leggi()["corse"]
    assert len(corse) == 2
    ruoli = [ch.get("ruolo") for c in corse for ch in c.get("chiamate", [])]
    assert "trascrizione" in ruoli
    assert "valutazione_orale" in ruoli


def test_audio_e_testo_insieme_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "Qualcosa", "nodeId": "node-1-1"},
        files={"audio": ("speech.wav", io.BytesIO(b"dummy"), "audio/wav")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INPUT_AMBIGUO"


def test_nessun_input_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(f"/extractions/{ext_id}/voice-recall", data={"nodeId": "node-1-1"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INPUT_MANCANTE"


def test_scope_mancante_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(f"/extractions/{ext_id}/voice-recall", data={"text": "Cinque parole di testo valido"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "SCOPE_MANCANTE"


def test_solo_node_id_ricava_ramo(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)
    app.state.voice_evaluator = FakeVoiceEvaluator()

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "La scarsita impone delle scelte di valore.", "nodeId": "node-1-1"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["scope"]["branchId"] == "branch-1"
    assert data["scope"]["nodeId"] == "node-1-1"


def test_nodo_fuori_ramo_404(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "Cinque parole di testo valido", "nodeId": "node-inesistente"},
    )
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "NODE_NOT_FOUND"


def test_mappa_assente_409(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    doc = upload(client, "test.txt", b"Documento senza mappa concettuale generata.")
    ext_id = extraction(client, doc, {"mode": "all"}).json()["id"]

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "Cinque parole di testo valido", "branchId": "branch-1"},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "TREE_NOT_READY"


def test_audio_troppo_lungo_422(tmp_path, monkeypatch):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    import mutagen
    monkeypatch.setattr(mutagen, 'File', lambda p: MagicMock(info=MagicMock(length=305.0)))

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"nodeId": "node-1-1"},
        files={"audio": ("speech.wav", io.BytesIO(b"RIFF"), "audio/wav")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "AUDIO_TOO_LONG"


def test_audio_troppo_grande_413(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    grande = b"0" * (26 * 1024 * 1024)
    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"nodeId": "node-1-1"},
        files={"audio": ("speech.wav", io.BytesIO(grande), "audio/wav")},
    )
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "AUDIO_TOO_LARGE"


def test_formato_non_ammesso_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"nodeId": "node-1-1"},
        files={"audio": ("file.exe", io.BytesIO(b"binary"), "application/octet-stream")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "AUDIO_FORMAT_NON_SUPPORTATO"


def test_audio_senza_parlato_422(tmp_path, monkeypatch):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    app.state.transcription_provider = FakeTranscriptionProvider(blocks=[{'id': 'b1', 'text': 'ciao'}])
    fake_ev = FakeVoiceEvaluator()
    app.state.voice_evaluator = fake_ev

    import mutagen
    monkeypatch.setattr(mutagen, 'File', lambda p: MagicMock(info=MagicMock(length=2.0)))

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"nodeId": "node-1-1"},
        files={"audio": ("speech.wav", io.BytesIO(b"RIFF"), "audio/wav")},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "NO_SPEECH_DETECTED"
    # LLM mai chiamato
    assert fake_ev.ultimo_prompt is None


def test_testo_troppo_corto_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(f"/extractions/{ext_id}/voice-recall", data={"text": "solo tre parole", "nodeId": "node-1-1"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "TEXT_TOO_SHORT"


def test_testo_lungo_tagliato_prima_del_prompt(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    fake_ev = FakeVoiceEvaluator()
    app.state.voice_evaluator = fake_ev

    testo_lungo = ("parola " * 3000)  # ~21.000 caratteri
    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": testo_lungo, "nodeId": "node-1-1"},
    )
    assert r.status_code == 200
    assert len(fake_ev.ultimo_prompt) < 20000


def test_valutatore_non_configurato_fallback(tmp_path, monkeypatch):
    monkeypatch.delenv("VOICE_EVAL_PROVIDER", raising=False)
    monkeypatch.delenv("VALIDATION_PROVIDER", raising=False)
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "La scarsita genera scelte e costo opportunita.", "nodeId": "node-1-1"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["valutazione"]["modalita"] == "solo_copertura"
    assert "LLM_NON_CONFIGURATO" in data["warnings"]


def test_valutatore_fallisce_fallback(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)
    app.state.voice_evaluator = FakeVoiceEvaluator(fallisci=True)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall",
        data={"text": "La scarsita genera scelte e costo opportunita.", "nodeId": "node-1-1"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["valutazione"]["modalita"] == "solo_copertura"
    assert "LLM_FALLITO" in data["warnings"]


def test_lock_occupato_409(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)
    app.state.voice_evaluator = FakeVoiceEvaluator()

    assert GENERAZIONE_IN_CORSO.acquire(blocking=False)
    try:
        r = client.post(
            f"/extractions/{ext_id}/voice-recall",
            data={"text": "La scarsita genera scelte e costo opportunita.", "nodeId": "node-1-1"},
        )
        assert r.status_code == 409
        assert r.json()["detail"]["code"] == "generation_in_progress"
    finally:
        GENERAZIONE_IN_CORSO.release()


def test_preview_non_scrive_registro(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_corso(client, app)

    r = client.post(
        f"/extractions/{ext_id}/voice-recall/preview",
        json={"nodeId": "node-1-1", "inputTipo": "testo"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "maxCostUsd" in data
    assert "fitsBudget" in data

    # Nessuna corsa registrata
    reg = registro(app.state.store)
    assert len(reg.leggi()["corse"]) == 0
