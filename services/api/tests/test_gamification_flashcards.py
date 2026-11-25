"""Test HTTP e unitari per il mazzo flashcard e la derivazione da concept-tree.json (D.3)."""
import os
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from formazione_api.gamification import (
    CartaFlashcard,
    FlashcardValutata,
    GamificationState,
    carica_stato,
    salva_stato,
)
from formazione_api.main import create_app
from test_api import extraction, upload


def _prepara_ambiente_con_albero(client, store, complete=True):
    doc = upload(client, "flashcard_lezione.txt", b"Testo didattico per la generazione di flashcard e nodi concettuali.")
    ext = extraction(client, doc, {"mode": "all"}).json()
    ext_id = ext["id"]

    tree_record = {
        "treeHash": "hash_valido_fc",
        "complete": complete,
        "tree": {
            "rootTitle": "Corso Flashcard",
            "branches": [
                {
                    "id": "branch-1",
                    "title": "Ramo Economia",
                    "originBlocks": ["b1"],
                    "nodes": [
                        {
                            "id": "node-1-1",
                            "title": "Costo Opportunità",
                            "summary": "Il valore della migliore alternativa a cui si rinuncia.",
                            "originBlocks": ["b1"],
                            "sourceRefs": ["p. 1"],
                            "keyTerms": ["Scarsità"],
                        },
                        {
                            "id": "node-1-2",
                            "title": "Inflazione",
                            "summary": "Aumento prolungato del livello generale dei prezzi.",
                            "originBlocks": ["b1"],
                            "sourceRefs": ["p. 2"],
                            "keyTerms": [],
                        },
                    ],
                },
                {
                    "id": "branch-2",
                    "title": "Ramo Diritto",
                    "originBlocks": ["b2"],
                    "nodes": [
                        {
                            "id": "node-2-1",
                            "title": "Contratto",
                            "summary": "Accordo tra due o più parti per costituire un rapporto giuridico.",
                            "originBlocks": ["b2"],
                            "sourceRefs": [],
                            "keyTerms": ["Accordo"],
                        }
                    ],
                },
            ],
        },
        "warnings": [],
    }
    store.save(ext_id, "concept-tree.json", tree_record)
    return ext_id


def test_mazzo_carte_dai_nodi(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards")
    assert resp.status_code == 200
    data = resp.json()
    # branch-1 ha: 2 nodi + 1 keyTerm ('Scarsità') = 3 carte
    # branch-2 ha: 1 nodo + 1 keyTerm ('Accordo') = 2 carte
    # Totale = 5 carte
    assert len(data["carte"]) == 5
    ids_1 = [c["cardId"] for c in data["carte"]]

    # Id deterministici: seconda chiamata ritorna gli stessi identici ID
    resp2 = client.get(f"/extractions/{ext_id}/gamification/flashcards")
    ids_2 = [c["cardId"] for c in resp2.json()["carte"]]
    assert ids_1 == ids_2


def test_mazzo_filtra_next_due(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)
    store = app.state.store

    # Inseriamo nello stato una carta con scadenza futura e una con scadenza oggi
    stato = carica_stato(store.root, ext_id)
    stato.flashcards["card-node-1-1"] = CartaFlashcard(box=2, nextDue="2026-11-30")
    stato.flashcards["card-node-1-2"] = CartaFlashcard(box=1, nextDue="2026-11-24")
    salva_stato(store.root, stato)

    # Richiesta con oggi = 2026-11-24 senza nuove
    resp = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?oggi=2026-11-24&includeNuove=false"
    )
    assert resp.status_code == 200
    carte = resp.json()["carte"]
    # Solo card-node-1-2 deve essere inclusa (nextDue <= oggi)
    assert len(carte) == 1
    assert carte[0]["cardId"] == "card-node-1-2"
    assert carte[0]["nuova"] is False


def test_mazzo_nuove_dovute_oggi(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    oggi = "2026-11-24"
    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards?oggi={oggi}")
    data = resp.json()
    for c in data["carte"]:
        assert c["nuova"] is True
        assert c["box"] == 1
        assert c["nextDue"] == oggi


def test_mazzo_ordine(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)
    store = app.state.store

    # Prepariamo carte dovute con date e box diversi
    stato = carica_stato(store.root, ext_id)
    stato.flashcards["card-node-1-1"] = CartaFlashcard(box=2, nextDue="2026-11-23")
    stato.flashcards["card-node-1-2"] = CartaFlashcard(box=1, nextDue="2026-11-22")
    salva_stato(store.root, stato)

    resp = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?oggi=2026-11-24&includeNuove=true"
    )
    carte = resp.json()["carte"]
    # Prime due devono essere le dovute (ordinate per nextDue crescente)
    assert carte[0]["cardId"] == "card-node-1-2"  # 2026-11-22
    assert carte[1]["cardId"] == "card-node-1-1"  # 2026-11-23
    # A seguire le nuove
    assert all(c["nuova"] for c in carte[2:])


def test_mazzo_limit_e_totali(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards?limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["carte"]) == 2
    # I totali riflettono l'intero mazzo prima del limite
    assert data["totaleNuove"] == 5
    assert data["totaleDovute"] == 0


def test_mazzo_include_nuove_false(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    resp = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?includeNuove=false"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["carte"]) == 0
    assert data["totaleNuove"] == 5
    assert data["totaleDovute"] == 0


def test_mazzo_filtra_branch(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    # Ramo valido branch-2: 1 nodo + 1 keyterm = 2 carte
    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards?branchId=branch-2")
    assert resp.status_code == 200
    assert len(resp.json()["carte"]) == 2

    # Ramo inesistente -> 404 BRANCH_NOT_FOUND
    r_not_found = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?branchId=branch-non-esiste"
    )
    assert r_not_found.status_code == 404
    assert r_not_found.json()["detail"]["code"] == "BRANCH_NOT_FOUND"


def test_mazzo_mappa_assente_409(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    # Estrazione senza concept-tree.json
    doc = upload(client, "empty.txt", b"Testo senza mappa")
    ext_id = extraction(client, doc, {"mode": "all"}).json()["id"]

    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards")
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "TREE_NOT_READY"


def test_mazzo_carta_orfana_ignorata(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)
    store = app.state.store

    # Salva una carta orfana non presente nell'albero
    stato = carica_stato(store.root, ext_id)
    stato.flashcards["card-orfana-999"] = CartaFlashcard(box=3, nextDue="2026-11-20")
    salva_stato(store.root, stato)

    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards?oggi=2026-11-24")
    data = resp.json()
    assert not any(c["cardId"] == "card-orfana-999" for c in data["carte"])

    # La carta resta conservata nello stato
    ricaricato = carica_stato(store.root, ext_id)
    assert "card-orfana-999" in ricaricato.flashcards


def test_mazzo_retro_e_fonti(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    resp = client.get(f"/extractions/{ext_id}/gamification/flashcards")
    carte = resp.json()["carte"]
    nodo_1 = next(c for c in carte if c["cardId"] == "card-node-1-1")
    assert nodo_1["retro"] == "Il valore della migliore alternativa a cui si rinuncia."
    assert len(nodo_1["fonti"]) == 1
    assert nodo_1["fonti"][0]["blockId"] == "b1"
    assert nodo_1["fonti"][0]["ref"] == "p. 1"


def test_ciclo_flashcard_valutata_poi_mazzo(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    ext_id = _prepara_ambiente_con_albero(client, app.state.store)

    oggi = "2026-11-24"
    # Valuta la carta come 'facile' -> nuova in box 1 avanza a box 2 (+3 giorni -> 2026-11-27)
    ev = {
        "tipo": "flashcard_valutata",
        "eventId": "ev-fc-ciclo-1",
        "clientDate": oggi,
        "cardId": "card-node-1-1",
        "valutazione": "facile",
    }
    r_post = client.post(f"/extractions/{ext_id}/gamification/events", json=ev)
    assert r_post.status_code == 200

    # Nel mazzo di oggi (2026-11-24), la carta non è più dovuta
    r_get_oggi = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?oggi={oggi}&includeNuove=false"
    )
    assert not any(c["cardId"] == "card-node-1-1" for c in r_get_oggi.json()["carte"])

    # Nel mazzo del 2026-11-27, la carta riappare come dovuta
    r_get_due = client.get(
        f"/extractions/{ext_id}/gamification/flashcards?oggi=2026-11-27&includeNuove=false"
    )
    assert any(c["cardId"] == "card-node-1-1" for c in r_get_due.json()["carte"])
