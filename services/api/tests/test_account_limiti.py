"""Test per il Blocco B3: Limiti corsi e spesa per utente (C6.4 e C6.3)."""
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
import jwt
import pytest
from fastapi.testclient import TestClient

from formazione_api.account.config import is_auth_required
from formazione_api.account.db import open_db, resolve_db_path
from formazione_api.account.limiti import CourseLimitReached, libera_slot_corso, slot_corso, valuta_limite
from formazione_api.account.modelli import Utente
from formazione_api.account.percorsi import radice_utente
from formazione_api.account.repo_utenti import conta_corsi_utente, get_or_create_utente
from formazione_api.account.spesa_scope import scope_spesa
from formazione_api.main import create_app
from formazione_api.spesa_generazione import SpesaRifiuto, decidi, registro

SEGRETO = "segreto_jwt_test_super_lungo_32_bytes_minimo!"
SUPABASE_URL = "https://progetto.supabase.co"
UUID_A = "aaaaaaaa-1111-2222-3333-444444444444"
UUID_B = "bbbbbbbb-1111-2222-3333-444444444444"


def token_per(uid, email="user@test.it", piano=None):
    payload = {
        "sub": uid, "email": email, "role": "authenticated", "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1", "iat": int(time.time()), "exp": int(time.time()) + 3600,
    }
    if piano:
        payload["piano"] = piano
    return jwt.encode(payload, SEGRETO, algorithm="HS256")


def _utente(uid=UUID_A, piano=None, limite=None, extra=0):
    adesso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return Utente(
        user_id=uid, email="test@test.it", piano=piano, limite_corsi=limite,
        corsi_extra_referral=extra, creato_il=adesso, aggiornato_il=adesso, ultimo_accesso_il=adesso,
    )


@pytest.fixture
def env_b3(monkeypatch, tmp_path):
    dati = tmp_path / "dati"
    dati.mkdir()
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SEGRETO)
    monkeypatch.setenv("FORMAZIONE_DATA_DIR", str(dati))
    return dati


# ---------------- REGOLE PURE valuta_limite (C6.4) ----------------


def test_valuta_limite_sotto_il_limite_consentito():
    u = _utente(limite=3, extra=0)
    esito = valuta_limite(u, corsi_usati=2)
    assert esito.consentito is True
    assert esito.limite_effettivo == 3


def test_valuta_limite_esattamente_al_limite_bloccato():
    u = _utente(limite=3, extra=0)
    esito = valuta_limite(u, corsi_usati=3)
    assert esito.consentito is False
    assert esito.limite_effettivo == 3


def test_valuta_limite_dopo_accredito_extra_plus_uno_consentito():
    u = _utente(limite=3, extra=1)
    esito = valuta_limite(u, corsi_usati=3)
    assert esito.consentito is True
    assert esito.limite_effettivo == 4


def test_valuta_limite_oltre_con_extra_bloccato():
    u = _utente(limite=3, extra=1)
    esito = valuta_limite(u, corsi_usati=4)
    assert esito.consentito is False


def test_valuta_limite_pro_illimitato_sempre_consentito():
    u = _utente(piano="pro")
    esito = valuta_limite(u, corsi_usati=99)
    assert esito.consentito is True
    assert esito.limite_base is None
    assert esito.limite_effettivo is None
    assert esito.referral_disponibile is False


def test_valuta_limite_override_admin_vince_sul_default():
    u = _utente(limite=5)
    esito = valuta_limite(u, corsi_usati=4)
    assert esito.consentito is True
    assert esito.limite_base == 5
    assert esito.limite_effettivo == 5


def test_valuta_limite_grandfathering_usati_maggiore_del_limite():
    u = _utente(limite=3)
    esito = valuta_limite(u, corsi_usati=5)
    assert esito.consentito is False
    assert esito.corsi_usati == 5


def test_course_limit_referral_disponibile_false_a_tetto_o_pro():
    u_tetto = _utente(limite=3, extra=5)
    assert valuta_limite(u_tetto, 3).referral_disponibile is False

    u_libero = _utente(limite=3, extra=4)
    assert valuta_limite(u_libero, 3).referral_disponibile is True


# ---------------- CONTEXT MANAGER slot_corso (C6.4) ----------------


def test_import_fallito_rilascia_slot(env_b3):
    db_path = env_b3 / "accounts.sqlite3"
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    client.get("/me", headers={"Authorization": f"Bearer {t}"})

    u = _utente(uid=UUID_A)
    with pytest.raises(RuntimeError):
        with slot_corso(u, "ext_fallita_1", db_path=db_path):
            raise RuntimeError("Estrazione interrotta")

    assert conta_corsi_utente(db_path, UUID_A) == 0
    conn = open_db(db_path)
    r = conn.execute("SELECT stato FROM corsi_utente WHERE extraction_id = 'ext_fallita_1'").fetchone()
    conn.close()
    assert r["stato"] == "fallito"


def test_import_eliminato_libera_slot(env_b3):
    db_path = env_b3 / "accounts.sqlite3"
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    client.get("/me", headers={"Authorization": f"Bearer {t}"})

    u = _utente(uid=UUID_A)
    with slot_corso(u, "ext_attiva_1", db_path=db_path):
        pass

    assert conta_corsi_utente(db_path, UUID_A) == 1
    libera_slot_corso("ext_attiva_1", db_path=db_path)
    assert conta_corsi_utente(db_path, UUID_A) == 0


def test_import_concorrente_con_un_solo_slot_libero_uno_solo_passa(env_b3):
    db_path = env_b3 / "accounts.sqlite3"
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    client.get("/me", headers={"Authorization": f"Bearer {t}"})

    conn = open_db(db_path)
    conn.execute("UPDATE utenti SET limite_corsi = 1 WHERE user_id = ?", (UUID_A,))
    conn.close()

    u = _utente(uid=UUID_A, limite=1)
    successi = 0
    blocchi = 0

    def tenta(i):
        nonlocal successi, blocchi
        try:
            with slot_corso(u, f"ext_conc_{i}", db_path=db_path):
                time.sleep(0.02)
                return True
        except CourseLimitReached:
            return False

    with ThreadPoolExecutor(max_workers=2) as ex:
        ris = list(ex.map(tenta, range(2)))

    assert ris.count(True) == 1
    assert ris.count(False) == 1


# ---------------- INTEGRAZIONE HTTP /extract E 403 (C6.4) ----------------


def test_import_terzo_corso_ok_quarto_403_con_limite_3(env_b3):
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    headers = {"Authorization": f"Bearer {t}"}

    # Carica documento TXT
    r_up = client.post("/documents", files={"file": ("lezione.txt", b"Contenuto didattico valido.")}, headers=headers)
    assert r_up.status_code == 201
    doc_id = r_up.json()["id"]

    # 1° corso -> 201
    r1 = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    assert r1.status_code == 201

    # 2° corso (dallo stesso documento, conta 1 in più E14-3) -> 201
    r2 = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    assert r2.status_code == 201

    # 3° corso -> 201 (esattamente al limite di 3)
    r3 = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    assert r3.status_code == 201

    # 4° corso -> 403 COURSE_LIMIT_REACHED
    r4 = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    assert r4.status_code == 403
    det = r4.json()["detail"]
    assert det["code"] == "COURSE_LIMIT_REACHED"
    assert det["limite_base"] == 3
    assert det["corsi_extra_referral"] == 0
    assert det["limite_effettivo"] == 3
    assert det["corsi_usati"] == 3
    assert det["piano"] == "base"
    assert det["referral_disponibile"] is True


def test_controllo_limite_avviene_prima_di_ogni_chiamata_llm(env_b3):
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    headers = {"Authorization": f"Bearer {t}"}

    db_path = env_b3 / "accounts.sqlite3"
    client.get("/me", headers=headers)
    conn = open_db(db_path)
    conn.execute("UPDATE utenti SET limite_corsi = 0 WHERE user_id = ?", (UUID_A,))
    conn.close()

    r_up = client.post("/documents", files={"file": ("nota.txt", b"Testo")}, headers=headers)
    doc_id = r_up.json()["id"]

    resp = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "COURSE_LIMIT_REACHED"


def test_rami_quiz_e_concept_non_consumano_slot(env_b3):
    client = TestClient(create_app(str(env_b3)))
    t = token_per(UUID_A)
    headers = {"Authorization": f"Bearer {t}"}
    client.get("/me", headers=headers)

    r_up = client.post("/documents", files={"file": ("nota.txt", b"Testo per quiz")}, headers=headers)
    doc_id = r_up.json()["id"]
    r_ext = client.post(f"/documents/{doc_id}/extract", json={"selection": {"mode": "all"}}, headers=headers)
    ext_id = r_ext.json()["id"]

    db_path = env_b3 / "accounts.sqlite3"
    assert conta_corsi_utente(db_path, UUID_A) == 1

    # Creazione concept-tree non deve consumare slot
    client.post(f"/extractions/{ext_id}/concept-tree", json={}, headers=headers)
    assert conta_corsi_utente(db_path, UUID_A) == 1


# ---------------- SPESA E SCOPE UTENTE / GLOBALE (C2.4, C6.3) ----------------


def test_scope_spesa_local_vs_user(monkeypatch):
    monkeypatch.setenv("AUTH_REQUIRED", "false")
    assert scope_spesa(_utente(uid="local")) == "local"
    assert scope_spesa(_utente(uid=UUID_A)) == "local"

    monkeypatch.setenv("AUTH_REQUIRED", "true")
    assert scope_spesa(_utente(uid="local")) == "local"
    assert scope_spesa(_utente(uid=UUID_A)) == f"user:{UUID_A}"


def test_spesa_utente_a_a_tetto_non_blocca_utente_b(tmp_path):
    store = type("MockStore", (), {"root": tmp_path, "base_root": tmp_path})()
    stima = {"limiteSuperioreUSD": Decimal("0.10"), "limiteCompleto": True}

    # Simula esaurimento budget per utente A
    reg_a = registro(store, scope=f"user:{UUID_A}")
    corsa = dict(
        id="c1",
        inizio="now",
        addebitatoUSD=Decimal("50.00"),
        chiamate=[{"addebitatoUSD": Decimal("50.00"), "regolatoUSD": Decimal("50.00")}],
    )
    reg_a.aggiorna_corsa(corsa)

    with pytest.raises(SpesaRifiuto) as exc:
        decidi(stima, store, scope=f"user:{UUID_A}")
    assert exc.value.code == "over_budget"
    assert exc.value.scope == "user"

    # Utente B non deve essere bloccato
    res_b = decidi(stima, store, scope=f"user:{UUID_B}")
    assert res_b["spentUsd"] == Decimal("0.00")


def test_spesa_tetto_globale_blocca_tutti_con_scope_global(tmp_path):
    store = type("MockStore", (), {"root": tmp_path, "base_root": tmp_path})()
    stima = {"limiteSuperioreUSD": Decimal("0.10"), "limiteCompleto": True}

    # Simula esaurimento budget globale
    reg_glob = registro(store, scope="global")
    corsa = dict(
        id="cg",
        inizio="now",
        addebitatoUSD=Decimal("50.00"),
        chiamate=[{"addebitatoUSD": Decimal("50.00"), "regolatoUSD": Decimal("50.00")}],
    )
    reg_glob.aggiorna_corsa(corsa)

    # Utente B ha speso 0 ma il tetto globale blocca con scope="global"
    with pytest.raises(SpesaRifiuto) as exc:
        decidi(stima, store, scope=f"user:{UUID_B}")
    assert exc.value.code == "over_budget"
    assert exc.value.scope == "global"


def test_contatori_spesa_separati_per_utente(tmp_path):
    store = type("MockStore", (), {"root": tmp_path, "base_root": tmp_path})()
    reg_a = registro(store, scope=f"user:{UUID_A}")
    reg_b = registro(store, scope=f"user:{UUID_B}")

    assert reg_a.path != reg_b.path
    assert str(UUID_A) in str(reg_a.path)
    assert str(UUID_B) in str(reg_b.path)
