"""Ripresa di una generazione interrotta dal percorso vero: POST /extractions/{id}/generate ->
genera_con_tetto -> generate(ripresa=...), con preventivo, registro della spesa e risposta d'errore.

Prima: un blocco fallito buttava i moduli già pagati e la nuova richiesta ripagava tutti i blocchi.
"""
from decimal import Decimal

import pytest

from formazione_api import ripresa_generazione as rg
from formazione_api import spesa_generazione as spesa
from formazione_api.generation import GenerationError
from formazione_api.measurement import preventivo as pv
from formazione_api.measurement.guardia import Registro
from formazione_api.measurement.prezzi import carica, prezzo
from test_api import client  # noqa: F401  (fixture)
from test_generation_http import Provider
from test_ripresa_generazione import TESTO


@pytest.fixture(autouse=True)
def senza_limiti_ambiente(monkeypatch):
    for nome in spesa.PREDEFINITI:
        monkeypatch.delenv(nome, raising=False)
    monkeypatch.delenv('VALIDATION_PROVIDER', raising=False)


class FornitoreRotta(Provider):
    """Fornitore finto della rotta: dichiara i token come i fornitori reali; fallisce al blocco `fallisce`."""

    def __init__(self, fallisce=None):
        self.fallisce, self.chiamate, self.last_usage = fallisce, [], None

    def module(self, chunk):
        self.chiamate.append(chunk.id)
        self.last_usage = dict(model=self.model, inputTokens=100, outputTokens=50, cachedInputTokens=0)
        if chunk.id == self.fallisce:
            raise GenerationError('provider_error', 'Errore AI controllato')
        return super().module(chunk)


def salva_estrazione(client, pagine=4, documento='b' * 32):
    """Estrazione salvata nello store come la scrive routes.extract: una pagina = un blocco."""
    store = client.app.state.store
    # Il preventivo legge fornitore e modello da quello iniettato: senza, non è disponibile.
    client.app.state.generation_provider = FornitoreRotta()
    ident = store.new_id()
    store.save(ident, 'extraction.json', dict(
        id=ident, documentId=documento, selection={'mode': 'all'}, pageCount=pagine, warnings=[], status='ready',
        engine='native', blocks=[dict(id=f'p{p}', page=p, label=f'Pagina {p}', text=TESTO) for p in range(1, pagine + 1)]))
    return ident


def genera(client, ident, fornitore, **corpo):
    client.app.state.generation_provider = fornitore
    # Stesso corpo che manda l'app (apps/learner/src/state/generazione.ts, corpoGenerazione).
    return client.post(f'/extractions/{ident}/generate',
                       json={'title': 'Corso', 'acknowledgeWarnings': False, 'excludePages': [], **corpo})


def stima(client, ident, escluse=()):
    query = '&'.join(f'excludePages={p}' for p in escluse)
    return client.get(f'/extractions/{ident}/generation-estimate' + (f'?{query}' if query else '')).json()


def corse(client):
    return Registro(client.app.state.store.root / spesa.NOME_REGISTRO).leggi()['corse']


def file_ripresa(client, ident):
    return client.app.state.store.root / f'{ident}.{rg.SUFFISSO}'


def test_rotta_fallimento_ripresa_e_bozza_salvata(client):
    ident = salva_estrazione(client)
    prima = stima(client, ident)
    assert (prima['chunks'], prima['savedChunks'], prima['totalChunks']) == (4, 0, 4)

    risposta = genera(client, ident, FornitoreRotta('chunk-3'))
    assert risposta.status_code == 502
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'provider_error'
    assert (dettaglio['savedChunks'], dettaglio['totalChunks']) == (2, 4)
    assert file_ripresa(client, ident).exists()

    # Il preventivo conta solo i 2 blocchi da generare.
    voce = stima(client, ident)
    assert (voce['chunks'], voce['savedChunks'], voce['totalChunks']) == (2, 2, 4)
    blocchi = client.app.state.store.read(ident, 'extraction.json')['blocks']
    atteso = pv.preventivo_corsa(pv.pianifica(blocchi)[2:], prezzo(carica(spesa.PREZZI), 'anthropic', 'claude-haiku-5-5'))
    assert Decimal(voce['upperBoundUsd']) == atteso['limiteSuperioreUSD']
    assert Decimal(voce['upperBoundUsd']) < Decimal(prima['upperBoundUsd'])

    # Seconda richiesta dell'app: titolo diverso, stesse pagine. Il titolo non entra nell'impronta.
    secondo = FornitoreRotta()
    ripresa_ok = genera(client, ident, secondo, title='Corso ripreso')
    assert ripresa_ok.status_code == 201, ripresa_ok.text
    assert secondo.chiamate == ['chunk-3', 'chunk-4']
    bozza = ripresa_ok.json()
    assert client.app.state.store.read(bozza['id'], 'draft.json') == bozza
    assert not file_ripresa(client, ident).exists()
    assert bozza['coverage']['processedChunks'] == bozza['coverage']['totalChunks'] == 4

    fallita, completata = corse(client)
    assert (fallita['esito'], fallita['blocchi'], fallita['blocchiRiusati'], fallita['blocchiTotali']) == ('fallita', 4, 0, 4)
    assert fallita['errore']['code'] == 'provider_error'
    assert len(fallita['chiamate']) == 3
    assert (completata['esito'], completata['blocchi'], completata['blocchiRiusati'], completata['blocchiTotali']) == \
        ('completata', 2, 2, 4)
    assert [c['chunkId'] for c in completata['chiamate']] == ['chunk-3', 'chunk-4']
    assert Decimal(str(completata['limiteSuperioreUSD'])) == Decimal(voce['upperBoundUsd'])

    # Corso identico a una generazione unica con le stesse risposte del modello.
    altra = salva_estrazione(client)
    unica = genera(client, altra, FornitoreRotta(), title='Corso ripreso').json()
    for corso in (bozza['course'], unica['course']):
        corso.pop('id')
    assert bozza['course'] == unica['course']
    assert bozza['coverage'] == unica['coverage']


def test_rotta_ricomincia_da_capo_rigenera_tutto(client):
    ident = salva_estrazione(client)
    genera(client, ident, FornitoreRotta('chunk-3'))
    fornitore = FornitoreRotta()
    risposta = genera(client, ident, fornitore, restart=True)
    assert risposta.status_code == 201, risposta.text
    assert fornitore.chiamate == ['chunk-1', 'chunk-2', 'chunk-3', 'chunk-4']
    assert corse(client)[-1]['blocchiRiusati'] == 0
    assert not file_ripresa(client, ident).exists()


def test_rotta_restart_deve_essere_booleano(client):
    ident = salva_estrazione(client)
    assert genera(client, ident, FornitoreRotta(), restart='true').status_code == 422


def test_rotta_pagine_escluse_diverse_nessun_riuso(client):
    ident = salva_estrazione(client, pagine=5)
    risposta = genera(client, ident, FornitoreRotta('chunk-3'), excludePages=[5])
    assert risposta.json()['detail']['savedChunks'] == 2
    assert stima(client, ident, [5])['savedChunks'] == 2
    assert stima(client, ident)['savedChunks'] == 0
    fornitore = FornitoreRotta()
    assert genera(client, ident, fornitore).status_code == 201
    assert len(fornitore.chiamate) == 5


def test_rotta_modello_diverso_nessun_riuso(client):
    ident = salva_estrazione(client)
    genera(client, ident, FornitoreRotta('chunk-3'))

    class Sonnet(FornitoreRotta):
        model = 'claude-sonnet-5-5'

    client.app.state.generation_provider = Sonnet()
    assert stima(client, ident)['savedChunks'] == 0


def test_limite_per_corso_conta_solo_i_blocchi_da_generare(client, monkeypatch):
    ident = salva_estrazione(client)
    tutti = Decimal(stima(client, ident)['upperBoundUsd'])
    genera(client, ident, FornitoreRotta('chunk-3'))
    mancanti = Decimal(stima(client, ident)['upperBoundUsd'])
    assert mancanti < tutti
    # Limite fra il costo dei blocchi mancanti e quello di tutti: la ripresa passa, ricominciare no.
    monkeypatch.setenv('GENERATION_MAX_USD_PER_COURSE', str((mancanti + tutti) / 2))
    rifiutata = genera(client, ident, FornitoreRotta(), restart=True)
    assert rifiutata.status_code == 422 and rifiutata.json()['detail']['code'] == 'over_course_limit'
    assert file_ripresa(client, ident).exists()
    assert genera(client, ident, FornitoreRotta()).status_code == 201


def test_errore_prima_dei_blocchi_dalla_rotta_senza_conteggio(client):
    ident = salva_estrazione(client)
    store = client.app.state.store
    store.save(ident, 'extraction.json', {**store.read(ident, 'extraction.json'), 'status': 'needs_review'})
    dettaglio = genera(client, ident, FornitoreRotta()).json()['detail']
    assert dettaglio['code'] == 'needs_review' and 'savedChunks' not in dettaglio
