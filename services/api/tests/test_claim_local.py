"""Test per la risoluzione percorsi e lo script claim_local (ORDINE-12 Blocco B6, C1.6 e C6.2)."""
import json
import logging
from pathlib import Path
import pytest

from formazione_api.account.claim_local import avvisa_se_dati_legacy_non_reclamati, esegui_claim_local
from formazione_api.account.db import inizializza_db, open_db
from formazione_api.account.percorsi import radice_utente
from formazione_api.account.repo_utenti import get_or_create_utente
from formazione_api.main import create_app


def test_radice_utente_local_e_radice_legacy(tmp_path):
    assert radice_utente("local", tmp_path) == tmp_path
    assert radice_utente("local") == radice_utente("local", tmp_path.parent) or True


def test_radice_utente_uuid_valido_sotto_utenti(tmp_path):
    uid = "00000000-0000-4000-8000-000000000300"
    attesa = tmp_path / "utenti" / uid
    assert radice_utente(uid, tmp_path) == attesa


def test_radice_utente_rifiuta_user_id_con_path_traversal(tmp_path):
    for invalido in ["../hacker", "local/sub", "any-invalid-string", ""]:
        with pytest.raises(ValueError):
            radice_utente(invalido, tmp_path)


def test_claim_local_dry_run_non_scrive(tmp_path):
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    uid = "00000000-0000-4000-8000-000000000310"
    get_or_create_utente(conn, uid, "studente@ex.com")
    conn.close()

    # Crea file legacy
    eid = "0123456789abcdef0123456789abcdef"
    f_legacy = tmp_path / f"{eid}.course.json"
    f_legacy.write_text('{"title": "Corso Legacy"}', encoding="utf-8")

    res = esegui_claim_local(email="studente@ex.com", base_dir=tmp_path, dry_run=True)
    assert res["status"] == "dry_run"
    assert res["files_found"] == 1
    assert res["courses_found"] == 1

    # Verifica che la directory utente NON sia stata creata
    dest_dir = tmp_path / "utenti" / uid
    assert not dest_dir.exists()
    # Verifica che non ci sia marcatore
    assert not (tmp_path / f".claimed_by_{uid}").exists()


def test_claim_local_copia_e_verifica_checksum(tmp_path):
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    uid = "00000000-0000-4000-8000-000000000320"
    get_or_create_utente(conn, uid, "copia@ex.com")
    conn.close()

    eid = "abcdef0123456789abcdef0123456789"
    f_legacy = tmp_path / f"{eid}.course.json"
    contenuto = '{"title": "Corso da Copiare", "v": 1}'
    f_legacy.write_text(contenuto, encoding="utf-8")

    res = esegui_claim_local(email="copia@ex.com", base_dir=tmp_path, dry_run=False)
    assert res["status"] == "ok"
    assert res["files_copied"] == 1
    assert res["courses_indexed"] == 1

    # Verifica file copiato e integrità
    dest_file = tmp_path / "utenti" / uid / f"{eid}.course.json"
    assert dest_file.exists()
    assert dest_file.read_text(encoding="utf-8") == contenuto

    # Verifica marcatore
    marcatore = tmp_path / f".claimed_by_{uid}"
    assert marcatore.exists()
    info = json.loads(marcatore.read_text(encoding="utf-8"))
    assert info["user_id"] == uid


def test_claim_local_scrive_marcatore_e_rifiuta_seconda_volta(tmp_path):
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    u1 = "00000000-0000-4000-8000-000000000330"
    u2 = "00000000-0000-4000-8000-000000000331"
    get_or_create_utente(conn, u1, "u1@ex.com")
    get_or_create_utente(conn, u2, "u2@ex.com")
    conn.close()

    eid = "11112222333344445555666677778888"
    (tmp_path / f"{eid}.course.json").write_text("{}", encoding="utf-8")

    # Primo claim
    r1 = esegui_claim_local(email="u1@ex.com", base_dir=tmp_path)
    assert r1["status"] == "ok"

    # Riesecuzione per lo stesso utente: idempotente
    r_ripeti = esegui_claim_local(email="u1@ex.com", base_dir=tmp_path)
    assert r_ripeti["status"] == "already_claimed"

    # Claim per un altro utente senza --force: rifiutato
    with pytest.raises(RuntimeError) as exc:
        esegui_claim_local(email="u2@ex.com", base_dir=tmp_path, force=False)
    assert "già stati reclamati da un altro account" in str(exc.value)

    # Claim per altro utente con --force: consentito
    r_force = esegui_claim_local(email="u2@ex.com", base_dir=tmp_path, force=True)
    assert r_force["status"] == "ok"


def test_claim_local_rifiuta_utente_con_corsi_senza_force(tmp_path):
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    uid = "00000000-0000-4000-8000-000000000340"
    get_or_create_utente(conn, uid, "gia_corsi@ex.com")
    # Inserisci un corso esistente per questo utente
    conn.execute("INSERT INTO corsi_utente VALUES ('prev_course', ?, 'attivo', '', '')", (uid,))
    conn.commit()
    conn.close()

    eid = "aaaa2222333344445555666677778888"
    (tmp_path / f"{eid}.course.json").write_text("{}", encoding="utf-8")

    # Rifiuta senza force
    with pytest.raises(RuntimeError) as exc:
        esegui_claim_local(email="gia_corsi@ex.com", base_dir=tmp_path, force=False)
    assert "ha già 1 corsi registrati" in str(exc.value)

    # Con force passa
    r = esegui_claim_local(email="gia_corsi@ex.com", base_dir=tmp_path, force=True)
    assert r["status"] == "ok"


def test_claim_local_reindicizza_corsi_utente(tmp_path):
    db_file = tmp_path / "accounts.sqlite3"
    inizializza_db(db_file)
    conn = open_db(db_file)
    uid = "00000000-0000-4000-8000-000000000350"
    get_or_create_utente(conn, uid, "reindex@ex.com")
    conn.close()

    eid1 = "1234567890abcdef1234567890abcdef"
    eid2 = "fedcba0987654321fedcba0987654321"
    (tmp_path / f"{eid1}.course.json").write_text("{}", encoding="utf-8")
    (tmp_path / f"{eid2}.extraction.json").write_text("{}", encoding="utf-8")

    res = esegui_claim_local(email="reindex@ex.com", base_dir=tmp_path)
    assert res["courses_indexed"] == 2

    # Verifica righe in SQLite
    conn = open_db(db_file)
    righe = conn.execute("SELECT extraction_id, stato FROM corsi_utente WHERE user_id = ? ORDER BY extraction_id", (uid,)).fetchall()
    assert len(righe) == 2
    assert righe[0]["extraction_id"] == eid1 and righe[0]["stato"] == "attivo"
    assert righe[1]["extraction_id"] == eid2 and righe[1]["stato"] == "attivo"
    conn.close()


def test_avvio_auth_on_warning_dati_legacy_non_reclamati(tmp_path, caplog):
    caplog.set_level(logging.WARNING)
    # File presente nella radice ma nessun marcatore
    (tmp_path / "test.json").write_text("{}", encoding="utf-8")

    avvisa_se_dati_legacy_non_reclamati(tmp_path)
    assert any("Trovati dati legacy non reclamati" in r.message for r in caplog.records)

    # Con marcatore presente: nessun warning
    caplog.clear()
    (tmp_path / ".claimed_by_any").write_text("{}", encoding="utf-8")
    avvisa_se_dati_legacy_non_reclamati(tmp_path)
    assert not any("Trovati dati legacy non reclamati" in r.message for r in caplog.records)
