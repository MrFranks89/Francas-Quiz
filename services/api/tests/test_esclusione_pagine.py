"""Esclusione esplicita delle pagine dalla generazione (esclusione_pagine.py, generation_routes.py).

Prima: un'estrazione con pagine non lette (copertine grafiche, una pagina rovinata in mezzo al
documento) rispondeva 422 `unread_pages` e l'unico rimedio era cambiare l'intervallo, che non
toglie una pagina in mezzo. Ora l'utente può escluderle dichiarandolo: le pagine escluse non
arrivano al fornitore e l'esclusione resta scritta nella bozza (avvisi, `excludedPages`, copertura).
"""
import pytest

from formazione_api.esclusione_pagine import avviso_esclusione
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_difetti_estrazione import pdf_misto
from test_generation_http import Provider


class ProviderCheRegistra(Provider):
    def __init__(self):
        self.fonti_ricevute = set()

    def module(self, chunk):
        self.fonti_ricevute.update(p.source_id for p in chunk.pieces)
        return super().module(chunk)


def prepara(client, selezione=None):
    fornitore = ProviderCheRegistra()
    client.app.state.generation_provider = fornitore
    doc = upload(client, 'misto.pdf', pdf_misto())
    estratta = extraction(client, doc, selezione or {'mode': 'all'}).json()
    return estratta, fornitore


def genera(client, estratta, escluse):
    return client.post(f"/extractions/{estratta['id']}/generate",
                       json={'acknowledgeWarnings': True, 'excludePages': escluse})


def preventivo(client, estratta, escluse=()):
    query = ''.join(f'&excludePages={p}' for p in escluse).replace('&', '?', 1)
    return client.get(f"/extractions/{estratta['id']}/generation-estimate{query}")


def test_testo_dell_avviso():
    assert avviso_esclusione([3]) == 'Escluse dal corso su richiesta: pagina 3'
    assert avviso_esclusione([1, 3]) == 'Escluse dal corso su richiesta: pagine 1 e 3'
    assert avviso_esclusione([5, 1, 3]) == 'Escluse dal corso su richiesta: pagine 1, 3 e 5'


def test_le_pagine_escluse_non_arrivano_al_fornitore_e_restano_scritte_nella_bozza(client):
    estratta, fornitore = prepara(client)
    escluse = {b['id'] for b in estratta['blocks'] if b['page'] in (1, 4)}
    assert escluse, 'il PDF di prova deve avere testo sulle pagine non lette'
    risposta = genera(client, estratta, [4, 1])
    assert risposta.status_code == 201, risposta.text
    bozza = risposta.json()
    # Nessun blocco delle pagine escluse è stato mandato al fornitore né citato come fonte.
    assert fornitore.fonti_ricevute and not fornitore.fonti_ricevute & escluse
    assert not {s['id'] for s in bozza['course']['sources']} & escluse
    assert bozza['excludedPages'] == [1, 4]
    assert 'Escluse dal corso su richiesta: pagine 1 e 4' in bozza['warnings']
    assert bozza['coverage']['excludedPages'] == [{'page': 1, 'reason': 'user_request'},
                                                  {'page': 4, 'reason': 'user_request'}]
    # La bozza salvata è quella che l'editor rilegge.
    assert client.get(f"/drafts/{bozza['id']}").json() == bozza


def test_l_estrazione_salvata_non_cambia(client):
    estratta, _ = prepara(client)
    assert genera(client, estratta, [1, 4]).status_code == 201
    assert client.get(f"/extractions/{estratta['id']}").json() == estratta


def test_senza_esclusione_il_risultato_lo_dichiara_vuoto(client):
    estratta, _ = prepara(client, {'mode': 'range', 'fromPage': 2, 'toPage': 2})
    bozza = genera(client, estratta, []).json()
    assert bozza['excludedPages'] == [] and bozza['coverage']['excludedPages'] == []
    assert not any(w.startswith('Escluse dal corso') for w in bozza['warnings'])


def test_le_altre_pagine_non_lette_continuano_a_bloccare(client):
    estratta, fornitore = prepara(client)
    risposta = genera(client, estratta, [1])
    assert risposta.status_code == 422, risposta.text
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'unread_pages' and dettaglio['pages'] == [4]
    assert not fornitore.fonti_ricevute


@pytest.mark.parametrize('selezione, escluse, frammento', [
    ({'mode': 'range', 'fromPage': 2, 'toPage': 3}, [1], 'fuori dalla selezione'),
    ({'mode': 'all'}, [99], 'fuori dalla selezione'),
    ({'mode': 'all'}, [1, 4, 1], 'più volte'),
    ({'mode': 'range', 'fromPage': 1, 'toPage': 1}, [1], 'nessun testo'),
])
def test_esclusioni_rifiutate(client, selezione, escluse, frammento):
    estratta, fornitore = prepara(client, selezione)
    for risposta in (genera(client, estratta, escluse), preventivo(client, estratta, escluse)):
        assert risposta.status_code == 422, risposta.text
        dettaglio = risposta.json()['detail']
        assert dettaglio['code'] == 'invalid_excluded_pages'
        assert frammento in dettaglio['message']
    assert not fornitore.fonti_ricevute


def test_documento_senza_pagine_non_accetta_esclusioni(client):
    client.app.state.generation_provider = Provider()
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    risposta = genera(client, estratta, [1])
    assert risposta.status_code == 422
    assert risposta.json()['detail']['code'] == 'invalid_excluded_pages'


def test_il_preventivo_segnala_le_pagine_non_lette_e_si_ricalcola_sulle_rimaste(client):
    estratta, _ = prepara(client)
    prima = preventivo(client, estratta).json()
    assert prima['unreadPages'] == [1, 4] and prima['excludedPages'] == []
    assert prima['allowed'] is False and prima['refusal']['code'] == 'unread_pages'
    dopo = preventivo(client, estratta, [1, 4]).json()
    assert dopo['unreadPages'] == [] and dopo['excludedPages'] == [1, 4]
    assert dopo['allowed'] is True, dopo
    assert float(dopo['upperBoundUsd']) < float(prima['upperBoundUsd'])
    parziale = preventivo(client, estratta, [1]).json()
    assert parziale['unreadPages'] == [4] and parziale['allowed'] is False
