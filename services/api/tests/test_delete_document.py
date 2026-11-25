from fastapi.testclient import TestClient
from formazione_api.main import app
import pytest


@pytest.fixture
def client(tmp_path, monkeypatch):
    from formazione_api.storage import Store
    app.state.store = Store(tmp_path)
    return TestClient(app)


def test_delete_document_success(client, tmp_path):
    # Upload doc
    res = client.post(
        "/documents",
        files={"file": ("test.txt", b"contenuto di test", "text/plain")},
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Verifica presenza file
    store = app.state.store
    assert store.path(doc_id, "document.json").exists()
    assert store.path(doc_id, "source").exists()

    # Delete
    del_res = client.delete(f"/documents/{doc_id}")
    assert del_res.status_code == 204

    # Verifica cancellazione file
    assert not store.path(doc_id, "document.json").exists()
    assert not store.path(doc_id, "source").exists()


def test_delete_document_not_found_returns_404(client):
    fake_id = "0" * 32
    res = client.delete(f"/documents/{fake_id}")
    assert res.status_code == 404


def test_delete_document_cascade_extractions(client):
    # Upload doc
    res = client.post(
        "/documents",
        files={"file": ("test.txt", b"Prima riga di testo per estrazione\nSeconda riga", "text/plain")},
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Simula un'estrazione collegata salvata nello store
    store = app.state.store
    ext_id = store.new_id()
    store.save(ext_id, "extraction.json", {
        "id": ext_id,
        "documentId": doc_id,
        "blocks": [{"id": "b1", "text": "test"}],
    })
    store.save(ext_id, "concept-tree.json", {"root": "albero"})

    assert store.path(ext_id, "extraction.json").exists()
    assert store.path(ext_id, "concept-tree.json").exists()

    # Delete document
    del_res = client.delete(f"/documents/{doc_id}")
    assert del_res.status_code == 204

    # Verifica che le estrazioni e file correlati siano stati eliminati a cascata
    assert not store.path(doc_id, "document.json").exists()
    assert not store.path(ext_id, "extraction.json").exists()
    assert not store.path(ext_id, "concept-tree.json").exists()


def test_delete_document_blocked_by_published_course_returns_409(client):
    # Upload doc
    res = client.post(
        "/documents",
        files={"file": ("test.txt", b"Documento con corso pubblicato", "text/plain")},
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    store = app.state.store
    ext_id = store.new_id()
    store.save(ext_id, "extraction.json", {
        "id": ext_id,
        "documentId": doc_id,
    })

    # Simula un corso pubblicato associato
    course_id = store.new_id()
    store.save(course_id, "course.json", {
        "id": course_id,
        "status": "published",
        "documentId": doc_id,
        "course": {
            "id": "c1",
            "documentId": doc_id,
            "title": "Corso di Diritto",
        },
    })

    # Delete document deve fallire con 409 DOCUMENT_HAS_COURSE
    del_res = client.delete(f"/documents/{doc_id}")
    assert del_res.status_code == 409
    data = del_res.json()
    assert data["detail"]["code"] == "DOCUMENT_HAS_COURSE"

    # I file devono essere intatti
    assert store.path(doc_id, "document.json").exists()
    assert store.path(ext_id, "extraction.json").exists()
    assert store.path(course_id, "course.json").exists()
