"""Test completi per il sottosistema Duello Asincrono Pro (ORDINE-12 Blocco B5, C4 e C6.6)."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import jwt
import pytest
from fastapi.testclient import TestClient

from formazione_api.account.db import inizializza_db, open_db
from formazione_api.account.duelli_modelli import DomandaDuelloSnapshot
from formazione_api.account.duelli_regole import (
    NotEnoughQuestionsError,
    calcola_esito,
    seleziona_domande,
    stato_effettivo,
    valuta_giocata,
)
from formazione_api.account.duelli_repo import accetta_duello, crea_duello, inizia_giocata
from formazione_api.account.repo_utenti import get_or_create_utente
from formazione_api.main import create_app
from formazione_api.storage import Store

JWT_SECRET = "super-secret-key-32-chars-exactly!!"


def _crea_jwt(sub: str, email: str = "user@example.com") -> str:
    payload = {
        "sub": sub,
        "email": email,
        "aud": "authenticated",
        "iss": "https://auth.example.com/auth/v1",
        "role": "authenticated",
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _setup_app_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, auth: bool = True):
    monkeypatch.setenv("AUTH_REQUIRED", "true" if auth else "false")
    monkeypatch.setenv("SUPABASE_URL", "https://auth.example.com")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("FORMAZIONE_DATA_DIR", str(tmp_path))
    inizializza_db(tmp_path / "accounts.sqlite3")
    return TestClient(create_app(str(tmp_path))), tmp_path / "accounts.sqlite3"


def _genera_pool_mock(n: int = 15):
    pool = []
    for i in range(n):
        pool.append({
            "id": f"q_{i}",
            "kind": "single",
            "prompt": f"Domanda numero {i}?",
            "options": [{"id": f"opt_{i}_0", "text": "A"}, {"id": f"opt_{i}_1", "text": "B"}, {"id": f"opt_{i}_2", "text": "C"}],
            "correctOptionId": f"opt_{i}_1",
            "explanation": f"Spiegazione domanda {i}",
        })
    return pool


def test_seleziona_domande_deterministica_e_filtro_eleggibili():
    pool = _genera_pool_mock(12)
    s1 = seleziona_domande(pool, n=10, seed="test-seed")
    s2 = seleziona_domande(pool, n=10, seed="test-seed")
    assert len(s1) == 10 and [d.domanda_id for d in s1] == [d.domanda_id for d in s2]

    # Pool insufficiente dopo filtro
    with pytest.raises(NotEnoughQuestionsError) as exc:
        seleziona_domande(_genera_pool_mock(4), n=10)
    assert exc.value.richieste == 10 and exc.value.eleggibili == 4


def test_valuta_giocata_e_calcolo_esito():
    domande = [
        DomandaDuelloSnapshot(domanda_id="q1", testo="T1", opzioni=["A", "B"], correctIndex=0, explanation="E1"),
        DomandaDuelloSnapshot(domanda_id="q2", testo="T2", opzioni=["A", "B"], correctIndex=1, explanation="E2"),
    ]
    # Risposte: q1 corretta (scelta=0), q2 errata (scelta=0)
    corrette, tempo = valuta_giocata(domande, [{"domanda_id": "q1", "scelta": 0, "ms": 1000}, {"domanda_id": "q2", "scelta": 0, "ms": 2000}])
    assert corrette == 1 and tempo == 3000

    # Calcolo esito: punteggio, tempo, parità, forfait
    g_c = {"consegnata_il": "2026-01-01", "corrette": 2, "tempo_totale_ms": 5000}
    g_a = {"consegnata_il": "2026-01-01", "corrette": 1, "tempo_totale_ms": 4000}
    assert calcola_esito(creatore_id="c", avversario_id="a", g_creatore=g_c, g_avversario=g_a, scaduto=False).motivo == "PUNTEGGIO"

    # Parità punteggio: decide tempo
    g_a["corrette"] = 2
    assert calcola_esito(creatore_id="c", avversario_id="a", g_creatore=g_c, g_avversario=g_a, scaduto=False).vincitore_id == "a"

    # Parità assoluta
    g_c["tempo_totale_ms"] = 4000
    assert calcola_esito(creatore_id="c", avversario_id="a", g_creatore=g_c, g_avversario=g_a, scaduto=False).motivo == "PAREGGIO"

    # Forfait su scadenza
    assert calcola_esito(creatore_id="c", avversario_id="a", g_creatore=g_c, g_avversario=None, scaduto=True).motivo == "FORFAIT"


def test_stato_effettivo_dipende_dall_orologio():
    adesso = datetime.now(timezone.utc)
    scadenza = adesso + timedelta(hours=1)
    assert stato_effettivo(stato_salvato="in_attesa", avversario_id=None, c_consegnata=False, a_consegnata=False, scade_il=scadenza, adesso=adesso) == "in_attesa"
    assert stato_effettivo(stato_salvato="aperto", avversario_id="u2", c_consegnata=False, a_consegnata=False, scade_il=scadenza, adesso=adesso) == "aperto"
    assert stato_effettivo(stato_salvato="aperto", avversario_id="u2", c_consegnata=True, a_consegnata=True, scade_il=scadenza, adesso=adesso) == "completato"
    # Orologio oltre scadenza
    assert stato_effettivo(stato_salvato="aperto", avversario_id="u2", c_consegnata=False, a_consegnata=False, scade_il=scadenza, adesso=adesso + timedelta(hours=2)) == "scaduto"


def test_duello_crea_pro_201_e_base_403(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id = "00000000-0000-4000-8000-000000000200"
    ext_id = "abcdef0123456789abcdef0123456789"

    # Mock corso
    store = Store(tmp_path, user_id=c_id)
    store.save(ext_id, "course.json", {"title": "Corso Duello", "questions": _genera_pool_mock(15)})

    # 1. Utente con piano base prova a creare duello -> 403 FEATURE_NOT_ENABLED
    conn = open_db(db_path)
    u_base = get_or_create_utente(conn, c_id, "base@ex.com")
    conn.close()
    tok_base = _crea_jwt(c_id, "base@ex.com")
    r_base = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok_base}"})
    assert r_base.status_code == 403
    assert r_base.json()["detail"]["code"] == "FEATURE_NOT_ENABLED"

    # 2. Promuovi utente a Pro
    conn = open_db(db_path)
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    conn.commit()
    conn.close()

    # 3. Creazione con successo
    r_pro = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok_base}"})
    assert r_pro.status_code == 201
    d_data = r_pro.json()
    assert d_data["codice_invito"].startswith("DUE-")


def test_duello_limite_sfide_aperte_409(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id = "00000000-0000-4000-8000-000000000210"
    ext_id = "abcdef0123456789abcdef0123456789"
    Store(tmp_path, user_id=c_id).save(ext_id, "course.json", {"title": "Corso", "questions": _genera_pool_mock(15)})

    conn = open_db(db_path)
    get_or_create_utente(conn, c_id, "pro@ex.com")
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    conn.commit()
    conn.close()

    tok = _crea_jwt(c_id, "pro@ex.com")
    # Crea 5 sfide
    for _ in range(5):
        r = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 201

    # La 6a sfida fallisce con 409 DUEL_ACTIVE_LIMIT_REACHED
    r6 = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok}"})
    assert r6.status_code == 409 and r6.json()["detail"]["code"] == "DUEL_ACTIVE_LIMIT_REACHED"


def test_duello_flusso_completo_accept_start_submit_result(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id, a_id = "00000000-0000-4000-8000-000000000220", "00000000-0000-4000-8000-000000000221"
    ext_id = "abcdef0123456789abcdef0123456789"
    Store(tmp_path, user_id=c_id).save(ext_id, "course.json", {"title": "Corso Duello", "questions": _genera_pool_mock(15)})

    conn = open_db(db_path)
    get_or_create_utente(conn, c_id, "c@ex.com")
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    get_or_create_utente(conn, a_id, "a@ex.com")  # avversario piano base
    conn.commit()
    conn.close()

    tok_c, tok_a = _crea_jwt(c_id, "c@ex.com"), _crea_jwt(a_id, "a@ex.com")

    # 1. Creatore crea sfida
    d_res = client.post("/duels", json={"extraction_id": ext_id, "n_domande": 10}, headers={"Authorization": f"Bearer {tok_c}"}).json()
    duello_id, codice = d_res["duello_id"], d_res["codice_invito"]

    # 2. Anteprima invito
    r_ant = client.get(f"/duels/invite/{codice}")
    assert r_ant.status_code == 200 and r_ant.json()["titolo_corso"] == "Corso Duello"

    # 3. Auto-accettazione fallisce 409
    assert client.post(f"/duels/{duello_id}/accept", headers={"Authorization": f"Bearer {tok_c}"}).status_code == 409

    # 4. Avversario base accetta sfida
    r_acc = client.post(f"/duels/{duello_id}/accept", headers={"Authorization": f"Bearer {tok_a}"})
    assert r_acc.status_code == 200 and r_acc.json()["stato"] == "aperto"

    # 5. Start giocata per creatore: verifica nessuna soluzione esposta
    r_start_c = client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_c}"})
    assert r_start_c.status_code == 200
    domande_c = r_start_c.json()["domande"]
    assert len(domande_c) == 10
    assert "correctIndex" not in domande_c[0] and "explanation" not in domande_c[0]

    # Start giocata per avversario
    r_start_a = client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_a}"})
    assert r_start_a.status_code == 200

    # 6. Consegna prima del termine per creatore (tutte opzione 1)
    risposte_c = [{"domanda_id": q["domanda_id"], "scelta": 1, "ms": 500} for q in domande_c]
    r_sub_c = client.post(f"/duels/{duello_id}/submit", json={"risposte": risposte_c}, headers={"Authorization": f"Bearer {tok_c}"})
    assert r_sub_c.status_code == 200 and r_sub_c.json()["corrette"] == 10 and r_sub_c.json()["duello_chiuso"] is False

    # Consegna duplicata -> 409
    assert client.post(f"/duels/{duello_id}/submit", json={"risposte": risposte_c}, headers={"Authorization": f"Bearer {tok_c}"}).status_code == 409

    # 7. Consegna per avversario (tutte opzione 0 errate)
    risposte_a = [{"domanda_id": q["domanda_id"], "scelta": 0, "ms": 1000} for q in domande_c]
    r_sub_a = client.post(f"/duels/{duello_id}/submit", json={"risposte": risposte_a}, headers={"Authorization": f"Bearer {tok_a}"})
    assert r_sub_a.status_code == 200 and r_sub_a.json()["duello_chiuso"] is True

    # 8. Risultato duello: creatore ha vinto, include soluzioni
    r_res = client.get(f"/duels/{duello_id}/result", headers={"Authorization": f"Bearer {tok_c}"})
    assert r_res.status_code == 200
    res_data = r_res.json()
    assert res_data["stato"] == "completato"
    assert res_data["esito"]["vincitore_id"] == c_id
    assert res_data["esito"]["motivo"] == "PUNTEGGIO"
    assert len(res_data["soluzioni"]) == 10


def test_duello_casi_errore_accept_e_start(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id, a_id, terzo_id = "00000000-0000-4000-8000-000000000240", "00000000-0000-4000-8000-000000000241", "00000000-0000-4000-8000-000000000242"
    ext_id = "abcdef0123456789abcdef0123456789"
    Store(tmp_path, user_id=c_id).save(ext_id, "course.json", {"title": "Corso", "questions": _genera_pool_mock(15)})

    conn = open_db(db_path)
    get_or_create_utente(conn, c_id, "c2@ex.com")
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    get_or_create_utente(conn, a_id, "a2@ex.com")
    get_or_create_utente(conn, terzo_id, "terzo@ex.com")
    conn.commit()
    conn.close()

    tok_c, tok_a, tok_3 = _crea_jwt(c_id, "c2@ex.com"), _crea_jwt(a_id, "a2@ex.com"), _crea_jwt(terzo_id, "terzo@ex.com")
    d_res = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok_c}"}).json()
    duello_id = d_res["duello_id"]

    # Start su duello non aperto (ancora in_attesa) -> 409 DUEL_NOT_OPEN
    assert client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_c}"}).status_code == 409

    # Avversario accetta
    client.post(f"/duels/{duello_id}/accept", headers={"Authorization": f"Bearer {tok_a}"})

    # Terzo prova ad accettare sfida già accettata -> 409 DUEL_ALREADY_ACCEPTED
    assert client.post(f"/duels/{duello_id}/accept", headers={"Authorization": f"Bearer {tok_3}"}).status_code == 409

    # Terzo non partecipante prova a leggere duello -> 404
    assert client.get(f"/duels/{duello_id}", headers={"Authorization": f"Bearer {tok_3}"}).status_code == 404

    # Start e ripetizione start non resetta timestamp
    r1 = client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_a}"})
    assert r1.status_code == 200
    t1 = r1.json()["iniziata_il"]
    r2 = client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_a}"})
    assert r2.status_code == 200
    assert r2.json()["iniziata_il"] == t1


def test_duello_submit_senza_start_e_tempo_scaduto(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id, a_id = "00000000-0000-4000-8000-000000000250", "00000000-0000-4000-8000-000000000251"
    ext_id = "abcdef0123456789abcdef0123456789"
    Store(tmp_path, user_id=c_id).save(ext_id, "course.json", {"title": "Corso", "questions": _genera_pool_mock(15)})

    conn = open_db(db_path)
    get_or_create_utente(conn, c_id, "c3@ex.com")
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    get_or_create_utente(conn, a_id, "a3@ex.com")
    conn.commit()
    conn.close()

    tok_c, tok_a = _crea_jwt(c_id, "c3@ex.com"), _crea_jwt(a_id, "a3@ex.com")
    d_res = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok_c}"}).json()
    duello_id = d_res["duello_id"]
    client.post(f"/duels/{duello_id}/accept", headers={"Authorization": f"Bearer {tok_a}"})

    # Submit senza aver fatto start -> 409 DUEL_NOT_STARTED
    r_no_start = client.post(f"/duels/{duello_id}/submit", json={"risposte": []}, headers={"Authorization": f"Bearer {tok_c}"})
    assert r_no_start.status_code == 409 and r_no_start.json()["detail"]["code"] == "DUEL_NOT_STARTED"

    # Start creatore
    client.post(f"/duels/{duello_id}/start", headers={"Authorization": f"Bearer {tok_c}"})

    # Modifica data inizio nel passato oltre 930 secondi
    vecchia_data = (datetime.now(timezone.utc) - timedelta(seconds=950)).isoformat()
    conn = open_db(db_path)
    conn.execute("UPDATE duelli_giocate SET iniziata_il = ? WHERE duello_id = ? AND user_id = ?", (vecchia_data, duello_id, c_id))
    conn.commit()
    conn.close()

    r_timeout = client.post(f"/duels/{duello_id}/submit", json={"risposte": []}, headers={"Authorization": f"Bearer {tok_c}"})
    assert r_timeout.status_code == 409 and r_timeout.json()["detail"]["code"] == "DUEL_TIME_LIMIT_EXCEEDED"


def test_duello_elenco_e_annulla_creatore(tmp_path, monkeypatch):
    client, db_path = _setup_app_client(tmp_path, monkeypatch)
    c_id = "00000000-0000-4000-8000-000000000230"
    ext_id = "abcdef0123456789abcdef0123456789"
    Store(tmp_path, user_id=c_id).save(ext_id, "course.json", {"title": "Corso", "questions": _genera_pool_mock(15)})

    conn = open_db(db_path)
    get_or_create_utente(conn, c_id, "pro@ex.com")
    conn.execute("UPDATE utenti SET piano = 'pro' WHERE user_id = ?", (c_id,))
    conn.commit()
    conn.close()

    tok = _crea_jwt(c_id, "pro@ex.com")
    d_res = client.post("/duels", json={"extraction_id": ext_id}, headers={"Authorization": f"Bearer {tok}"}).json()
    duello_id = d_res["duello_id"]

    # Elenco duelli
    r_list = client.get("/duels", headers={"Authorization": f"Bearer {tok}"})
    assert r_list.status_code == 200 and r_list.json()["totale"] == 1

    r_canc = client.post(f"/duels/{duello_id}/cancel", headers={"Authorization": f"Bearer {tok}"})
    assert r_canc.status_code == 200 and r_canc.json()["ok"] is True

    # Annulla duello già annullato -> 409 DUEL_NOT_CANCELLABLE
    assert client.post(f"/duels/{duello_id}/cancel", headers={"Authorization": f"Bearer {tok}"}).status_code == 409


def test_duello_con_auth_disabilitata_409(tmp_path, monkeypatch):
    client, _ = _setup_app_client(tmp_path, monkeypatch, auth=False)
    for metodo, path, body in [
        ("post", "/duels", {"extraction_id": "any"}),
        ("get", "/duels/any-id", None),
        ("post", "/duels/any-id/accept", {}),
        ("post", "/duels/any-id/start", None),
        ("get", "/duels", None),
    ]:
        fn = getattr(client, metodo)
        res = fn(path, json=body) if body is not None else fn(path)
        assert res.status_code == 409
        assert res.json()["detail"]["code"] == "AUTH_REQUIRED_FOR_FEATURE"
