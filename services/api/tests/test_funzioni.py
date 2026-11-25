"""Test unitari e HTTP per il catalogo delle funzioni base/pro (D.4)."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from formazione_api.funzioni import (
    funzione_attiva,
    piano_corrente,
    richiedi_funzione,
)
from formazione_api.main import create_app


def test_piano_base_default(monkeypatch, tmp_path):
    monkeypatch.delenv("PIANO_FUNZIONI", raising=False)
    assert piano_corrente() == "base"
    assert funzione_attiva("gamification") is True
    assert funzione_attiva("giochi_singoli") is True
    assert funzione_attiva("coach_orale") is True
    assert funzione_attiva("gioco_gruppo_sfida") is False

    app = create_app(tmp_path)
    client = TestClient(app)
    resp = client.get("/funzioni")
    assert resp.status_code == 200
    data = resp.json()
    assert data["piano"] == "base"
    f_map = {f["chiave"]: f["attiva"] for f in data["funzioni"]}
    assert f_map["gamification"] is True
    assert f_map["gioco_gruppo_sfida"] is False


def test_piano_pro(monkeypatch, tmp_path):
    monkeypatch.setenv("PIANO_FUNZIONI", "pro")
    assert piano_corrente() == "pro"
    assert funzione_attiva("gamification") is True
    assert funzione_attiva("gioco_gruppo_sfida") is True

    app = create_app(tmp_path)
    client = TestClient(app)
    resp = client.get("/funzioni")
    assert resp.status_code == 200
    data = resp.json()
    assert data["piano"] == "pro"
    assert all(f["attiva"] for f in data["funzioni"])


def test_piano_sconosciuto_ricade_su_base(monkeypatch):
    monkeypatch.setenv("PIANO_FUNZIONI", "valore_invalido_xyz")
    assert piano_corrente() == "base"
    assert funzione_attiva("gioco_gruppo_sfida") is False


def test_richiedi_funzione_403(monkeypatch):
    monkeypatch.delenv("PIANO_FUNZIONI", raising=False)
    # Funzione base: consentita
    richiedi_funzione("gamification")

    # Funzione pro: solleva 403 FEATURE_NOT_ENABLED
    with pytest.raises(HTTPException) as exc_info:
        richiedi_funzione("gioco_gruppo_sfida")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "FEATURE_NOT_ENABLED"
