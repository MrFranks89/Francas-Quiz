"""Test completi per il sottosistema Referral (ORDINE-12 Blocco B4, C3 e C6.5)."""
import concurrent.futures
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
import jwt
import pytest
from fastapi.testclient import TestClient

from formazione_api.account.db import inizializza_db, open_db
from formazione_api.account.limiti import CourseLimitReached, slot_corso
from formazione_api.account.referral_regole import (
    ALFABETO_REFERRAL,
    genera_codice_referral,
    normalizza_codice_referral,
)
from formazione_api.account.referral_repo import (
    assicura_codice_referral,
    ottieni_stato_referral,
)
from formazione_api.account.repo_utenti import get_or_create_utente
from formazione_api.main import create_app

JWT_SECRET = "super-secret-key-32-chars-exactly!!"


def _crea_jwt(sub: str, email: str | None = None, referral_code: str | None = None) -> str:
    payload = {
        "sub": sub,
        "email": email or "user@example.com",
        "aud": "authenticated",
        "iss": "https://auth.example.com/auth/v1",
        "role": "authenticated",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    if referral_code:
        payload["user_metadata"] = {"referral_code": referral_code}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _setup_app_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, auth: bool = True):
    monkeypatch.setenv("AUTH_REQUIRED", "true" if auth else "false")
    monkeypatch.setenv("SUPABASE_URL", "https://auth.example.com")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("FORMAZIONE_DATA_DIR", str(tmp_path))
    inizializza_db(tmp_path / "accounts.sqlite3")
    return TestClient(create_app(str(tmp_path))), tmp_path / "accounts.sqlite3"


def test_codice_referral_formato_e_alfabeto():
    c = genera_codice_referral()
    assert c.startswith("REF-") and len(c) == 12
    corpo = c[4:]
    assert all(ch in ALFABETO_REFERRAL for ch in corpo)
    for vietato in "0O1ILU":
        assert vietato not in corpo


def test_codice_referral_creato_una_sola_volta_e_idempotente(tmp_path):
    db_file = tmp_path / "acc.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    u = get_or_create_utente(conn, "00000000-0000-4000-8000-000000000001", "u1@example.com")
    c1 = assicura_codice_referral(conn, u.user_id)
    c2 = assicura_codice_referral(conn, u.user_id)
    assert c1 == c2 and c1.startswith("REF-")
    conn.close()


def test_codice_referral_collisione_rigenera(tmp_path):
    db_file = tmp_path / "acc.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    u1 = get_or_create_utente(conn, "00000000-0000-4000-8000-000000000002", "u2@example.com")
    c1 = assicura_codice_referral(conn, u1.user_id)
    u2 = get_or_create_utente(conn, "00000000-0000-4000-8000-000000000003", "u3@example.com")
    with patch("formazione_api.account.referral_repo.genera_codice_referral", side_effect=[c1, "REF-NEWCOD01"]):
        c2 = assicura_codice_referral(conn, u2.user_id)
    assert c2 == "REF-NEWCOD01"
    conn.close()


def test_codice_referral_normalizza_e_invalido():
    assert normalizza_codice_referral(" ref-23456789 ") == "REF-23456789"
    assert normalizza_codice_referral("23456789") == "REF-23456789"
    for err in ["REF-12345678", "CORTO", "REF-00000000", ""]:
        with pytest.raises(ValueError):
            normalizza_codice_referral(err)


def test_referral_automatico_primo_accesso_accredita_plus_uno(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000010", "00000000-0000-4000-8000-000000000011"
    conn = open_db(db_path)
    inv = get_or_create_utente(conn, inv_id, "inv1@example.com")
    cod = assicura_codice_referral(conn, inv.user_id)
    conn.close()

    tok = _crea_jwt(osp_id, "ospite@example.com", referral_code=cod)
    res = client.get("/me", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 200

    conn = open_db(db_path)
    assert get_or_create_utente(conn, inv_id, "inv1@example.com").corsi_extra_referral == 1
    conn.close()


def test_referral_riscatto_manuale_accredita_plus_uno(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000020", "00000000-0000-4000-8000-000000000021"
    conn = open_db(db_path)
    inv = get_or_create_utente(conn, inv_id, "invm@example.com")
    cod = assicura_codice_referral(conn, inv.user_id)
    get_or_create_utente(conn, osp_id, "ospitem@example.com")
    conn.close()

    tok = _crea_jwt(osp_id, "ospitem@example.com")
    res = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 200
    assert res.json()["accreditato"] is True and res.json()["esito"] == "ACCREDITATO" and res.json()["segnali"] == []

    conn = open_db(db_path)
    assert get_or_create_utente(conn, inv_id, "invm@example.com").corsi_extra_referral == 1
    conn.close()


def test_referral_doppia_chiamata_e_ripetuto_senza_errore(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000030", "00000000-0000-4000-8000-000000000031"
    conn = open_db(db_path)
    inv = get_or_create_utente(conn, inv_id, "invd@example.com")
    cod = assicura_codice_referral(conn, inv.user_id)
    get_or_create_utente(conn, osp_id, "ospited@example.com")
    conn.close()

    tok = _crea_jwt(osp_id, "ospited@example.com")
    r1 = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r1.status_code == 200 and r1.json()["accreditato"] is True
    r2 = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 200 and r2.json()["accreditato"] is False and r2.json()["esito"] == "GIA_ACCREDITATO"


def test_referral_secondo_codice_diverso_409_already_redeemed(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    i1_id, i2_id, osp_id = "00000000-0000-4000-8000-000000000040", "00000000-0000-4000-8000-000000000041", "00000000-0000-4000-8000-000000000042"
    conn = open_db(db_path)
    c1 = assicura_codice_referral(conn, get_or_create_utente(conn, i1_id, "i1@example.com").user_id)
    c2 = assicura_codice_referral(conn, get_or_create_utente(conn, i2_id, "i2@example.com").user_id)
    get_or_create_utente(conn, osp_id, "osp@example.com")
    conn.close()

    tok = _crea_jwt(osp_id, "osp@example.com")
    client.post("/referral/redeem", json={"codice": c1}, headers={"Authorization": f"Bearer {tok}"})
    r_alt = client.post("/referral/redeem", json={"codice": c2}, headers={"Authorization": f"Bearer {tok}"})
    assert r_alt.status_code == 409 and r_alt.json()["detail"]["code"] == "REFERRAL_ALREADY_REDEEMED"


def test_referral_chiamate_concorrenti_un_solo_accredito(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000050", "00000000-0000-4000-8000-000000000051"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invc@example.com").user_id)
    get_or_create_utente(conn, osp_id, "ospc@example.com")
    conn.close()

    tok = _crea_jwt(osp_id, "ospc@example.com")
    def _call():
        return client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = [f.result() for f in [pool.submit(_call) for _ in range(5)]]

    assert len([r for r in results if r.status_code == 200 and r.json()["accreditato"] is True]) == 1
    conn = open_db(db_path)
    assert get_or_create_utente(conn, inv_id, "invc@example.com").corsi_extra_referral == 1
    conn.close()


def test_referral_auto_invito_nessun_accredito(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    u_id = "00000000-0000-4000-8000-000000000060"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, u_id, "auto@example.com").user_id)
    conn.close()

    tok = _crea_jwt(u_id, "auto@example.com")
    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["accreditato"] is False and r.json()["esito"] == "AUTO_INVITO"


def test_referral_email_gia_registrata_e_alias(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, p1_id, p2_id = "00000000-0000-4000-8000-000000000070", "00000000-0000-4000-8000-000000000071", "00000000-0000-4000-8000-000000000072"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "inve@example.com").user_id)
    get_or_create_utente(conn, p1_id, "mario@example.com")
    get_or_create_utente(conn, p2_id, "mario+tag@example.com")
    conn.close()

    tok = _crea_jwt(p2_id, "mario+tag@example.com")
    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["accreditato"] is False and r.json()["esito"] == "EMAIL_GIA_REGISTRATA"


def test_referral_account_cancellato_e_ricreato_nessun_accredito(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, p1_id, p2_id = "00000000-0000-4000-8000-000000000075", "00000000-0000-4000-8000-000000000076", "00000000-0000-4000-8000-000000000077"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invcanc@example.com").user_id)
    get_or_create_utente(conn, p1_id, "cancella@example.com")
    # Cancella l'utente p1 da tabella utenti, ma email_viste conserva l'hash
    conn.execute("DELETE FROM utenti WHERE user_id = ?", (p1_id,))
    conn.commit()
    # Ricrea nuovo account con la stessa email
    get_or_create_utente(conn, p2_id, "cancella@example.com")
    conn.close()

    tok = _crea_jwt(p2_id, "cancella@example.com")
    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["accreditato"] is False and r.json()["esito"] == "EMAIL_GIA_REGISTRATA"


def test_referral_finestra_scaduta_solo_su_redeem(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, old_id = "00000000-0000-4000-8000-000000000080", "00000000-0000-4000-8000-000000000081"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invf@example.com").user_id)
    vecchio_dt = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    conn.execute("INSERT INTO utenti VALUES (?, 'old@ex.com', NULL, NULL, NULL, NULL, 0, NULL, ?, ?, ?)", (old_id, vecchio_dt, vecchio_dt, vecchio_dt))
    conn.commit()
    conn.close()

    tok = _crea_jwt(old_id, "old@ex.com")
    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200 and r.json()["accreditato"] is False and r.json()["esito"] == "FINESTRA_SCADUTA"


def test_referral_codice_sconosciuto_404_redeem_e_silenzioso_jwt(tmp_path, monkeypatch):
    client, _ = _setup_app_client(tmp_path, monkeypatch)
    u1, u2 = "00000000-0000-4000-8000-000000000090", "00000000-0000-4000-8000-000000000091"
    r404 = client.post("/referral/redeem", json={"codice": "REF-ABCDEFGH"}, headers={"Authorization": f"Bearer {_crea_jwt(u1)}"})
    assert r404.status_code == 404 and r404.json()["detail"]["code"] == "REFERRAL_CODE_UNKNOWN"

    r_ok = client.get("/me", headers={"Authorization": f"Bearer {_crea_jwt(u2, referral_code='REF-ABCDEFGH')}"})
    assert r_ok.status_code == 200


def test_referral_stesso_dispositivo_e_ip_segnala_senza_bloccare(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000100", "00000000-0000-4000-8000-000000000101"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invdev@example.com").user_id)
    get_or_create_utente(conn, osp_id, "ospdev@example.com")
    conn.close()

    client.get("/referral/me", headers={"Authorization": f"Bearer {_crea_jwt(inv_id, 'invdev@example.com')}", "x-device-id": "device-123"})
    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {_crea_jwt(osp_id, 'ospdev@example.com')}", "x-device-id": "device-123"})
    assert r.status_code == 200 and r.json()["accreditato"] is True

    conn = open_db(db_path)
    log_r = conn.execute("SELECT * FROM referral_log WHERE invitato_user_id = ?", (osp_id,)).fetchone()
    assert "STESSO_DISPOSITIVO" in log_r["segnali"] and "device-123" not in log_r["segnali"]
    conn.close()


def test_referral_privacy_stato_non_espone_email_e_conta_aggregati(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000110", "00000000-0000-4000-8000-000000000111"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invp@example.com").user_id)
    get_or_create_utente(conn, osp_id, "mario.rossi@segreto.com")
    conn.close()

    client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {_crea_jwt(osp_id, 'mario.rossi@segreto.com')}"})
    # Secondo tentativo scartato (GIA_ACCREDITATO)
    client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {_crea_jwt(osp_id, 'mario.rossi@segreto.com')}"})

    r_stato = client.get("/referral/me", headers={"Authorization": f"Bearer {_crea_jwt(inv_id)}"})
    assert r_stato.status_code == 200
    st = r_stato.json()
    assert st["registrazioni_accreditate"] == 1
    assert st["registrazioni_non_accreditate"] == 1
    assert len(st["ultime_registrazioni"]) == 1
    nome_vis = st["ultime_registrazioni"][0]["nome_o_iniziali"]
    assert "@" not in nome_vis and "segreto.com" not in nome_vis


def test_referral_tetto_extra_raggiunto(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    inv_id, osp_id = "00000000-0000-4000-8000-000000000120", "00000000-0000-4000-8000-000000000121"
    conn = open_db(db_path)
    cod = assicura_codice_referral(conn, get_or_create_utente(conn, inv_id, "invt@example.com").user_id)
    conn.execute("UPDATE utenti SET corsi_extra_referral = 5 WHERE user_id = ?", (inv_id,))
    conn.commit()
    get_or_create_utente(conn, osp_id, "ospt@example.com")
    conn.close()

    r = client.post("/referral/redeem", json={"codice": cod}, headers={"Authorization": f"Bearer {_crea_jwt(osp_id)}"})
    assert r.status_code == 200 and r.json()["accreditato"] is False and r.json()["esito"] == "TETTO_RAGGIUNTO"


def test_referral_integrazione_con_limiti_b3(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    u_id = "00000000-0000-4000-8000-000000000130"
    conn = open_db(db_path)
    u = get_or_create_utente(conn, u_id, "userb3@example.com")
    conn.execute("INSERT INTO corsi_utente VALUES ('c1',?,'attivo','',''),('c2',?,'attivo','',''),('c3',?,'attivo','','' )", (u_id, u_id, u_id))
    conn.commit()
    conn.close()

    with pytest.raises(CourseLimitReached):
        with slot_corso(u, "c4", db_path):
            pass

    conn = open_db(db_path)
    conn.execute("UPDATE utenti SET corsi_extra_referral = 1 WHERE user_id = ?", (u_id,))
    conn.commit()
    u_agg = get_or_create_utente(conn, u_id, "userb3@example.com")
    conn.close()

    with slot_corso(u_agg, "c4", db_path):
        pass


def test_referral_con_auth_disabilitata_409(tmp_path, monkeypatch):
    client, _ = _setup_app_client(tmp_path, monkeypatch, auth=False)
    assert client.get("/referral/me").status_code == 409
    assert client.get("/referral/me").json()["detail"]["code"] == "AUTH_REQUIRED_FOR_FEATURE"
    assert client.post("/referral/redeem", json={"codice": "REF-ABCDEFGH"}).status_code == 409
    assert client.post("/referral/redeem", json={"codice": "REF-ABCDEFGH"}).json()["detail"]["code"] == "AUTH_REQUIRED_FOR_FEATURE"
