"""Test di unità e integrazione per il Blocco B2: Identità utente e JWT (C6.0 e C6.1)."""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import jwt
import pytest
from fastapi.testclient import TestClient

from formazione_api.account.config import is_auth_required, valida_config_avvio
from formazione_api.account.db import open_db, resolve_db_path
from formazione_api.account.jwks import JWKSCache, reset_jwks_cache
from formazione_api.account.repo_utenti import get_or_create_utente, ottieni_utente
from formazione_api.funzioni import richiedi_funzione
from formazione_api.main import create_app

SEGRETO_TEST = "segreto_jwt_super_sicuro_per_i_test_12345"
SUPABASE_URL_TEST = "https://progetto-test.supabase.co"
UUID_TEST = "11111111-2222-3333-4444-555555555555"
UUID_TEST_B = "99999999-8888-7777-6666-555555555555"


def crea_jwt(sub=UUID_TEST, email="studente@example.com", role="authenticated", aud="authenticated",
             iss=f"{SUPABASE_URL_TEST}/auth/v1", exp_delta=3600, alg="HS256", key=SEGRETO_TEST,
             is_anonymous=False, user_metadata=None, headers=None):
    adesso = int(time.time())
    payload = {
        "sub": sub, "email": email, "role": role, "aud": aud, "iss": iss,
        "iat": adesso, "exp": adesso + exp_delta, "is_anonymous": is_anonymous,
    }
    if user_metadata is not None:
        payload["user_metadata"] = user_metadata
    if alg == "none":
        return jwt.encode(payload, key="", algorithm="none")
    return jwt.encode(payload, key, algorithm=alg, headers=headers)


@pytest.fixture
def env_auth_on(monkeypatch, tmp_path):
    dati = tmp_path / "dati"
    dati.mkdir()
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL_TEST)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SEGRETO_TEST)
    monkeypatch.setenv("FORMAZIONE_DATA_DIR", str(dati))
    return dati


# ---------------- C6.0 REGRESSIONE E AUTH=FALSE ----------------


def test_auth_required_default_false(monkeypatch):
    monkeypatch.delenv("AUTH_REQUIRED", raising=False)
    assert is_auth_required() is False


def test_auth_off_nessun_file_db_creato(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    app = create_app(str(tmp_path))
    client = TestClient(app)
    resp = client.get("/me")
    assert resp.status_code == 200
    db_file = tmp_path / "accounts.sqlite3"
    assert not db_file.exists()


def test_auth_off_header_authorization_ignorato(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    client = TestClient(create_app(str(tmp_path)))
    resp = client.get("/me", headers={"Authorization": "Bearer token_spazzatura_non_valido"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == "local"


def test_auth_off_get_me_restituisce_utente_locale(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    client = TestClient(create_app(str(tmp_path)))
    resp = client.get("/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "local"
    assert data["auth_required"] is False
    assert data["limite_effettivo"] is None


def test_auth_off_patch_me_409(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    client = TestClient(create_app(str(tmp_path)))
    resp = client.patch("/me", json={"nome_visualizzato": "Nuovo Nome"})
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "AUTH_REQUIRED_FOR_FEATURE"


def test_auth_off_richiedi_funzione_usa_piano_env_come_oggi(monkeypatch):
    monkeypatch.setenv("PIANO_FUNZIONI", "base")
    richiedi_funzione("gamification")
    with pytest.raises(Exception) as exc:
        richiedi_funzione("gioco_gruppo_sfida")
    assert exc.value.status_code == 403

    monkeypatch.setenv("PIANO_FUNZIONI", "pro")
    richiedi_funzione("gioco_gruppo_sfida")


# ---------------- C6.1 IDENTITA E JWT CON AUTH=TRUE ----------------


def test_jwt_valido_crea_utente_e_ritorna_200(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(email="studente@example.com")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == UUID_TEST
    assert data["email"] == "studente@example.com"
    assert data["auth_required"] is True

    db_path = env_auth_on / "accounts.sqlite3"
    assert db_path.exists()
    u = ottieni_utente(db_path, UUID_TEST)
    assert u is not None
    assert u.email == "studente@example.com"


def test_jwt_assente_401_auth_token_missing(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    resp = client.get("/me")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_MISSING"
    assert resp.headers.get("WWW-Authenticate") == "Bearer"


def test_jwt_schema_non_bearer_401_auth_token_missing(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    resp = client.get("/me", headers={"Authorization": f"Basic {crea_jwt()}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_MISSING"


def test_jwt_scaduto_401_auth_token_expired(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    # Scaduto da 60 secondi (oltre leeway di 10s)
    token = crea_jwt(exp_delta=-60)
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_EXPIRED"
    assert resp.headers.get("WWW-Authenticate") == "Bearer"


def test_jwt_firma_errata_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(key="chiave_sbagliata_non_autorizzata")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_malformato_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    resp = client.get("/me", headers={"Authorization": "Bearer stringa_non_jwt_a.b"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_alg_none_rifiutato_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(alg="none")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_audience_errata_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(aud="pubblico")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_issuer_errato_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(iss="https://altro-progetto.supabase.co/auth/v1")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_ruolo_anon_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(role="anon")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_utente_anonimo_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(is_anonymous=True)
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_sub_non_uuid_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(sub="local")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_jwt_senza_email_401_auth_token_invalid(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(email="")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_TOKEN_INVALID"


def test_401_ha_header_www_authenticate_bearer(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    resp = client.get("/me")
    assert resp.headers.get("WWW-Authenticate") == "Bearer"


def test_401_messaggio_non_rivela_dettagli_libreria(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    resp = client.get("/me", headers={"Authorization": "Bearer token.con.errore"})
    msg = resp.json()["detail"]["message"]
    assert "Traceback" not in msg
    assert "jwt" not in msg.lower()


def test_leeway_10s_token_appena_scaduto_accettato(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    # Scaduto solo da 5 secondi (dentro i 10s di tolleranza leeway)
    token = crea_jwt(exp_delta=-5)
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_avvio_auth_on_senza_segreto_fail_fast(monkeypatch, tmp_path):
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.delenv("SUPABASE_JWKS_URL", raising=False)
    with pytest.raises(RuntimeError) as exc:
        valida_config_avvio()
    assert "SUPABASE_URL mancante" in str(exc.value)

    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    with pytest.raises(RuntimeError) as exc2:
        valida_config_avvio()
    assert "SUPABASE_JWT_SECRET o SUPABASE_JWKS_URL" in str(exc2.value)


def test_jwks_kid_ignoto_forza_refresh_una_volta():
    from cryptography.hazmat.primitives.asymmetric import rsa

    chiave_priv = rsa.generate_private_key(65537, 2048)
    chiave_pub = chiave_priv.public_key()

    chiamate = 0

    def mock_fetcher(url):
        nonlocal chiamate
        chiamate += 1
        # Al secondo fetch ritorna la chiave cercata
        if chiamate > 1:
            return {"keys": []}
        return {"keys": []}

    cache = JWKSCache(jwks_url="https://mock.jwks", ttl_seconds=3600, fetcher=mock_fetcher)
    cache._keys = {"kid-1": chiave_pub}
    cache._last_fetch = time.time()

    with pytest.raises(KeyError):
        cache.get_key_for_kid("kid-inesistente")

    # Ha forzato il fetch esattamente una volta sul kid ignoto
    assert chiamate == 1


def test_get_or_create_utente_idempotente_con_chiamate_concorrenti(env_auth_on):
    db_path = env_auth_on / "accounts.sqlite3"
    from formazione_api.account.db import inizializza_db
    inizializza_db(db_path)

    def worker(i):
        return get_or_create_utente(db_path, UUID_TEST, f"user{i}@example.com")

    with ThreadPoolExecutor(max_workers=5) as executor:
        risultati = list(executor.map(worker, range(10)))

    assert all(r.user_id == UUID_TEST for r in risultati)
    conn = open_db(db_path)
    conteggio = conn.execute("SELECT COUNT(*) FROM utenti WHERE user_id = ?", (UUID_TEST,)).fetchone()[0]
    conn.close()
    assert conteggio == 1


def test_provisioning_piano_default_da_env(env_auth_on, monkeypatch):
    monkeypatch.setenv("PIANO_FUNZIONI", "pro")
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt(sub=UUID_TEST_B, email="pro@example.com")
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["piano_effettivo"] == "pro"


def test_provisioning_cambio_email_aggiorna_hash_e_conserva_storia(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    # Primo login con email 1
    t1 = crea_jwt(email="prima@example.com")
    client.get("/me", headers={"Authorization": f"Bearer {t1}"})

    # Secondo login dello stesso sub con email aggiornata
    t2 = crea_jwt(email="seconda@example.com")
    resp = client.get("/me", headers={"Authorization": f"Bearer {t2}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "seconda@example.com"

    db_path = env_auth_on / "accounts.sqlite3"
    conn = open_db(db_path)
    viste = conn.execute("SELECT email_norm_hash FROM email_viste").fetchall()
    conn.close()
    assert len(viste) >= 1


def test_get_me_corsi_usati_e_limite_effettivo(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt()
    resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    data = resp.json()
    assert data["limite_base"] == 3
    assert data["corsi_extra_referral"] == 0
    assert data["limite_effettivo"] == 3
    assert data["corsi_usati"] == 0


def test_patch_me_nome_valido_ok_e_422_se_vuoto_o_troppo_lungo(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    token = crea_jwt()
    # Nome valido
    resp = client.patch(
        "/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome_visualizzato": "   Marco Polo   "},
    )
    assert resp.status_code == 200
    assert resp.json()["nome_visualizzato"] == "Marco Polo"

    # Nome vuoto dopo il trim -> 422
    resp_vuoto = client.patch(
        "/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome_visualizzato": "     "},
    )
    assert resp_vuoto.status_code == 422

    # Nome > 40 caratteri -> 422
    resp_lungo = client.patch(
        "/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome_visualizzato": "A" * 41},
    )
    assert resp_lungo.status_code == 422


def test_dependency_auth_applicata_a_tutti_i_router_non_pubblici(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    # Endpoint protetti devono rispondere 401 se chiamati senza token
    assert client.post("/documents").status_code == 401
    assert client.get("/settings").status_code == 401
    assert client.get("/funzioni").status_code == 401
    assert client.get("/extractions/00000000000000000000000000000000/gamification").status_code == 401


def test_health_e_auth_config_pubblici_senza_token(env_auth_on):
    client = TestClient(create_app(str(env_auth_on)))
    # /health pubblico senza token
    r_health = client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "ok"

    # /auth/config pubblico senza token
    r_conf = client.get("/auth/config")
    assert r_conf.status_code == 200
    assert r_conf.json()["auth_required"] is True
    assert r_conf.json()["supabase_url"] == SUPABASE_URL_TEST
