"""Test HTTP per le rotte di gamification: stato, eventi, idempotenza e concorrenza (D.2)."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from formazione_api.gamification import percorso_gamification
from formazione_api.main import create_app
from test_api import extraction, upload


def _crea_estrazione(client) -> str:
    doc = upload(client, "test.txt", b"Contenuto didattico di test per gamification.")
    ext = extraction(client, doc, {"mode": "all"}).json()
    return ext["id"]


def test_get_stato_iniziale_non_scrive(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    path_file = percorso_gamification(str(tmp_path), ext_id)
    assert not os.path.exists(path_file)

    resp = client.get(f"/extractions/{ext_id}/gamification")
    assert resp.status_code == 200
    data = resp.json()
    assert data["extractionId"] == ext_id
    assert data["xp"] == 0
    assert data["livello"] == 1
    assert data["esito"] is None
    # Il file NON deve essere stato creato
    assert not os.path.exists(path_file)


def test_get_estrazione_inesistente_404(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    assert client.get("/extractions/non-esiste-proprio/gamification").status_code == 404
    assert client.get("/extractions/ID_MALFORMATO!/gamification").status_code == 404


def test_post_evento_ritorna_stato_aggiornato(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    path_file = percorso_gamification(str(tmp_path), ext_id)
    assert not os.path.exists(path_file)

    oggi = datetime.now(timezone.utc).date().isoformat()
    ev = {
        "tipo": "sfida_completata",
        "eventId": "ev-post-test-1",
        "clientDate": oggi,
        "sfidaId": "sf-1",
    }
    resp = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
    assert resp.status_code == 200
    data = resp.json()
    assert data["xp"] == 50
    assert data["esito"] is not None
    assert data["esito"]["applicato"] is True
    assert data["esito"]["duplicato"] is False
    assert data["esito"]["xpAccreditati"] == 50
    # Ora il file esiste
    assert os.path.exists(path_file)


def test_retry_evento_200_duplicato(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    oggi = datetime.now(timezone.utc).date().isoformat()
    ev = {
        "tipo": "sfida_completata",
        "eventId": "ev-retry-dup-1",
        "clientDate": oggi,
        "sfidaId": "sf-dup",
    }
    r1 = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
    assert r1.status_code == 200
    assert r1.json()["xp"] == 50

    # Secondo invio dello stesso evento
    r2 = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["xp"] == 50  # Nessun doppio accredito
    assert d2["esito"]["applicato"] is False
    assert d2["esito"]["duplicato"] is True
    assert d2["esito"]["xpAccreditati"] == 0


def test_evento_malformato_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    # Tipo sconosciuto
    r1 = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "tipo_inesistente",
        "eventId": "ev-bad-1234",
        "clientDate": "2026-11-24",
    })
    assert r1.status_code == 422

    # Campo extra non ammesso (extra='forbid')
    r2 = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "ev-bad-extra",
        "clientDate": "2026-11-24",
        "sfidaId": "sf1",
        "campoInatteso": 123,
    })
    assert r2.status_code == 422

    # eventId troppo corto (< 8 caratteri)
    r3 = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "short",
        "clientDate": "2026-11-24",
        "sfidaId": "sf1",
    })
    assert r3.status_code == 422

    # Quiz completato con risultati vuoti (min_length=1)
    r4 = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "quiz_completato",
        "eventId": "ev-quiz-empty",
        "clientDate": "2026-11-24",
        "risultati": [],
    })
    assert r4.status_code == 422


def test_client_date_futura_422(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    oggi_utc = datetime.now(timezone.utc).date()
    # Domani: consentito (+1 per assorbire i fusi orari)
    data_domani = (oggi_utc + timedelta(days=1)).isoformat()
    r_ok = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "ev-date-domani",
        "clientDate": data_domani,
        "sfidaId": "sf-domani",
    })
    assert r_ok.status_code == 200

    # Dopodomani: rifiutato (INVALID_CLIENT_DATE)
    data_dopodomani = (oggi_utc + timedelta(days=2)).isoformat()
    r_bad = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "ev-date-futura",
        "clientDate": data_dopodomani,
        "sfidaId": "sf-futura",
    })
    assert r_bad.status_code == 422
    assert r_bad.json()["detail"]["code"] == "INVALID_CLIENT_DATE"


def test_concorrenza_xp_esatto(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    oggi = datetime.now(timezone.utc).date().isoformat()
    num_eventi = 40

    def invia(idx: int):
        ev = {
            "tipo": "sfida_completata",
            "eventId": f"ev-conc-{idx:04d}",
            "clientDate": oggi,
            "sfidaId": f"sf-{idx}",
        }
        res = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
        assert res.status_code == 200

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(invia, range(num_eventi)))

    # Verifica finale: ogni sfida vale 50 XP
    resp = client.get(f"/extractions/{ext_id}/gamification")
    assert resp.status_code == 200
    assert resp.json()["xp"] == num_eventi * 50


def test_file_corrotto_rinominato(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    path_file = percorso_gamification(str(tmp_path), ext_id)
    with open(path_file, "w", encoding="utf-8") as f:
        f.write("{ json non valido ...")

    oggi = datetime.now(timezone.utc).date().isoformat()
    ev = {
        "tipo": "sfida_completata",
        "eventId": "ev-recovery-corrupt",
        "clientDate": oggi,
        "sfidaId": "sf-corr",
    }
    resp = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
    assert resp.status_code == 200
    assert resp.json()["xp"] == 50
    # Verifica che il file .corrotto esista
    assert os.path.exists(f"{path_file}.corrotto")


def test_nessuna_chiamata_llm(tmp_path, monkeypatch):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    def blow_up(*args, **kwargs):
        raise RuntimeError("LLM chiamato impropriamente!")

    # Qualsiasi tentativo di chiamare validatore o generazione esplode
    app.state.generation_provider = blow_up
    monkeypatch.setattr("formazione_api.generation.validazione.Validatore", blow_up)

    # GET stato
    assert client.get(f"/extractions/{ext_id}/gamification").status_code == 200

    # POST evento
    oggi = datetime.now(timezone.utc).date().isoformat()
    r = client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "ev-no-llm-1",
        "clientDate": oggi,
        "sfidaId": "sf1",
    })
    assert r.status_code == 200


def test_stato_non_espone_eventi_elaborati(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _crea_estrazione(client)

    oggi = datetime.now(timezone.utc).date().isoformat()
    client.post(f"/extractions/{ext_id}/gamification/events", json={
        "tipo": "sfida_completata",
        "eventId": "ev-secret-fifo",
        "clientDate": oggi,
        "sfidaId": "sf1",
    })

    resp = client.get(f"/extractions/{ext_id}/gamification")
    data = resp.json()
    assert "eventiElaborati" not in data
