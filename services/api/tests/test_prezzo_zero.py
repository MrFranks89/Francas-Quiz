"""Modelli a prezzo 0 (piano gratuito di Gemini): listino, preventivo e tetto, dalla rotta vera.

Un prezzo 0 vale per qualunque numero di token, quindi il limite superiore è 0 anche senza la quota
per chiamata misurata; ma un prezzo 0 deve dichiarare il piano gratuito e la sua condizione, così un
errore di battitura non apre una porta a spese vere.
"""
import json
from decimal import Decimal

import httpx2
import openai
import pytest

from formazione_api import impostazioni, spesa_generazione as spesa
from formazione_api.measurement import preventivo as pv
from formazione_api.measurement.prezzi import PREZZI, PrezzoMancante, carica, modelli, prezzo
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_openai_compat_provider import OPENAI_VERO, completamento
from test_anthropic_provider import draft_json

MODELLI_GEMINI = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro']


def test_i_modelli_gemini_sono_a_prezzo_zero_dichiarato():
    listino = carica(PREZZI)
    assert [m for f, m in modelli(listino) if f == 'gemini'] == MODELLI_GEMINI
    for modello in MODELLI_GEMINI:
        p = prezzo(listino, 'gemini', modello)
        assert p.gratuito and p.sovraccarico_ingresso is None
        voce = listino['fornitori']['gemini']['modelli'][modello]
        assert voce['piano'] == 'gratuito' and voce['condizione'] and voce['prezzoAPagamento']['fonte']


def listino_con(voce_modello: dict) -> dict:
    return {'valuta': 'USD', 'fornitori': {'prova': {'modelli': {'m': {
        'ingresso': 0, 'uscita': 0, 'ingressoCache': 0, 'fonte': 'https://esempio.invalid', 'lettoIl': '2026-11-03',
        **voce_modello}}}}}


@pytest.mark.parametrize('voce', [{}, {'piano': 'gratuito'}, {'piano': 'altro', 'condizione': 'x'}])
def test_prezzo_zero_senza_piano_gratuito_dichiarato_e_rifiutato(voce):
    with pytest.raises(PrezzoMancante):
        prezzo(listino_con(voce), 'prova', 'm')


def test_piano_gratuito_con_un_prezzo_diverso_da_zero_e_rifiutato():
    with pytest.raises(PrezzoMancante):
        prezzo(listino_con({'piano': 'gratuito', 'condizione': 'x', 'uscita': 1}), 'prova', 'm')


def test_preventivo_a_prezzo_zero_completo_senza_quota_misurata():
    listino = prezzo(carica(PREZZI), 'gemini', 'gemini-3.8-flash')
    stima = pv.preventivo_corsa(pv.pianifica([dict(id='b1', page=1, text='Leggere il manuale.')]), listino)
    assert stima['limiteCompleto'] is True
    assert stima['limiteSuperioreUSD'] == 0
    (limite,) = stima['limiti']
    # Il limite in token resta calcolato: la guardia controlla ancora i contatori dichiarati.
    assert limite.ingresso_massimo_per_tentativo > 0 and limite.uscita_massima == 16000


def test_quota_non_misurata_resta_un_rifiuto_per_i_modelli_a_pagamento():
    listino = prezzo(carica(PREZZI), 'openai', 'gpt-6-luna')
    stima = pv.preventivo_corsa(pv.pianifica([dict(id='b1', page=1, text='Leggere il manuale.')]), listino)
    assert stima['limiteCompleto'] is False


@pytest.fixture
def gemini(client, monkeypatch):
    """La rotta vera senza fornitore iniettato: selection.create_provider() con GENERATION_PROVIDER=gemini,
    e il client openai sostituito da uno con trasporto finto."""
    for nome in spesa.PREDEFINITI:
        monkeypatch.delenv(nome, raising=False)
    monkeypatch.setenv('GENERATION_PROVIDER', 'gemini')
    monkeypatch.setenv('GEMINI_API_KEY', 'gemini-key-not-real')
    monkeypatch.setenv('GEMINI_MODEL', 'gemini-3.8-flash')
    richieste = []

    def handler(request):
        richieste.append(request)
        # La bozza cita la fonte davvero presente nel blocco inviato.
        fonte = json.loads(json.loads(request.content)['messages'][1]['content'])[0]['sourceId']
        return httpx2.Response(200, json=completamento(draft_json(fonte)))

    def openai_finto(**argomenti):
        return OPENAI_VERO(api_key=argomenti['api_key'], base_url=argomenti['base_url'], max_retries=0,
                           http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler)))
    monkeypatch.setattr(openai, 'OpenAI', openai_finto)
    client.app.state.generation_provider = None
    doc = upload(client, 'appunti.txt', b'Leggere il manuale prima di iniziare.')
    return client, extraction(client, doc, {'mode': 'all'}).json(), richieste


def test_rotta_vera_preventivo_e_generazione_con_prezzo_zero(gemini):
    client, estratta, richieste = gemini
    voce = client.get(f"/extractions/{estratta['id']}/generation-estimate").json()
    assert voce['available'] is True and voce['allowed'] is True, voce
    assert (voce['provider'], voce['model'], voce['maxCostUsd']) == ('gemini', 'gemini-3.8-flash', '0.00')
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})
    assert risposta.status_code == 201, risposta.text
    assert len(richieste) == 1
    assert json.loads(richieste[0].content)['model'] == 'gemini-3.8-flash'
    (corsa,) = spesa.registro(client.app.state.store).leggi()['corse']
    assert (corsa['fornitore'], corsa['esito']) == ('gemini', 'completata')
    assert spesa.registro(client.app.state.store).speso() == 0
    assert client.get('/generation/config').json()['spending']['spentUsd'] == '0'


def test_budget_zero_rifiuta_anche_il_prezzo_zero(gemini, monkeypatch):
    client, estratta, richieste = gemini
    monkeypatch.setenv('GENERATION_BUDGET_USD', '0')
    risposta = client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})
    assert risposta.status_code == 422 and risposta.json()['detail']['code'] == 'over_budget'
    assert richieste == []


def test_impostazioni_elencano_i_modelli_gemini_selezionabili():
    stato = impostazioni.stato()
    (voce,) = [f for f in stato['providers'] if f['id'] == 'gemini']
    assert voce['label'] == 'Gemini'
    assert [m['id'] for m in voce['models']] == MODELLI_GEMINI
    assert all(m['inputUsdPerMTok'] == '0' and m['outputUsdPerMTok'] == '0' for m in voce['models'])
    # Selezionabile e non rifiutata dal tetto: nessun avviso di quota non misurata.
    assert voce['notice'] is None
    # Avviso sui dati del piano gratuito, solo per i fornitori gratuiti.
    assert voce['dataNotice'] == impostazioni.AVVISI_DATI['gemini']
    assert 'materiale pubblico' in voce['dataNotice'] and 'revisori' in voce['dataNotice']
    assert 'fatturazione' in voce['dataNotice']
    for altro in stato['providers']:
        if altro['id'] != 'gemini':
            assert altro['dataNotice'] is None


def test_salvataggio_impostazioni_gemini(monkeypatch, tmp_path):
    # setenv registra lo stato precedente: alla fine del test l'ambiente torna com'era.
    for nome in ('GENERATION_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL'):
        monkeypatch.setenv(nome, '')
    file = tmp_path / '.env'
    stato = impostazioni.salva(file, {'provider': 'gemini', 'model': 'gemini-3.8-flash',
                                      'apiKey': 'gemini-key-not-real-0000'})
    assert stato['activeProvider'] == 'gemini' and stato['configured'] is True
    assert 'GEMINI_MODEL=gemini-3.8-flash' in file.read_text(encoding='utf-8')


def test_ogni_fornitore_con_modelli_gratuiti_ha_l_avviso_sui_dati():
    """Regola, non caso singolo: un modello a prezzo 0 aggiunto al listino senza avviso non passa."""
    for nome, voce in impostazioni.listino().items():
        if any(p.gratuito for p in voce['modelli'].values()):
            assert impostazioni.AVVISI_DATI.get(nome), nome
