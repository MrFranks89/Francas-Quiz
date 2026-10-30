"""Tetto di spesa della generazione dall'app (spesa_generazione.py, generation_routes.py).

Prima: la rotta generava senza preventivo e senza registro; l'unico limite erano 40 blocchi.
"""
import json
from decimal import Decimal

import pytest

from formazione_api import spesa_generazione as spesa
from formazione_api.measurement import preventivo as pv
from formazione_api.measurement.guardia import Registro
from formazione_api.measurement.prezzi import carica, prezzo
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_generation_http import Provider


class Contato(Provider):
    """Fornitore finto che conta le chiamate e dichiara i token come i fornitori reali."""

    def __init__(self):
        self.chiamate = 0
        self.last_usage = None

    def module(self, chunk):
        self.chiamate += 1
        self.last_usage = dict(model=self.model, inputTokens=100, outputTokens=50, cachedInputTokens=0)
        return super().module(chunk)


@pytest.fixture(autouse=True)
def senza_limiti_ambiente(monkeypatch):
    for nome in spesa.PREDEFINITI:
        monkeypatch.delenv(nome, raising=False)


def prepara(client, testo=b'Leggere il manuale prima di iniziare.', fornitore=None):
    fornitore = fornitore or Contato()
    client.app.state.generation_provider = fornitore
    doc = upload(client, 'appunti.txt', testo)
    estratta = extraction(client, doc, {'mode': 'all'}).json()
    return estratta, fornitore


def genera(client, estratta):
    return client.post(f"/extractions/{estratta['id']}/generate", json={'title': 'Corso'})


def preventivo(client, estratta):
    return client.get(f"/extractions/{estratta['id']}/generation-estimate").json()


def registro(client):
    return Registro(client.app.state.store.root / spesa.NOME_REGISTRO)


def test_il_preventivo_dell_app_e_quello_della_misura(client):
    estratta, fornitore = prepara(client)
    voce = preventivo(client, estratta)
    blocchi = client.app.state.store.read(estratta['id'], 'extraction.json')['blocks']
    atteso = pv.preventivo_corsa(pv.pianifica(blocchi), prezzo(carica(spesa.PREZZI), 'anthropic', 'claude-haiku-5-5'))
    assert voce['available'] is True and voce['allowed'] is True
    assert (voce['provider'], voce['model'], voce['chunks']) == ('anthropic', 'claude-haiku-5-5', 1)
    assert Decimal(voce['upperBoundUsd']) == atteso['limiteSuperioreUSD']
    # Arrotondato per eccesso al centesimo: resta un massimo.
    assert Decimal(voce['maxCostUsd']) >= atteso['limiteSuperioreUSD']
    assert Decimal(voce['maxCostUsd']) - atteso['limiteSuperioreUSD'] < Decimal('0.01')
    assert voce['limits'] == {'maxUsdPerCourse': '0.50', 'budgetUsd': '5.00', 'spentUsd': '0'}
    assert fornitore.chiamate == 0


def test_arrotondamento_per_eccesso():
    assert spesa.per_eccesso(Decimal('0.1201')) == Decimal('0.13')
    assert spesa.per_eccesso(Decimal('0.12')) == Decimal('0.12')


def test_predefiniti_nella_configurazione(client):
    spending = client.get('/generation/config').json()['spending']
    assert spending == {'defaults': {'GENERATION_MAX_USD_PER_COURSE': '0.50', 'GENERATION_BUDGET_USD': '5.00'},
                        'spentUsd': '0', 'reservedUsd': '0', 'maxUsdPerCourse': '0.50', 'budgetUsd': '5.00',
                        'remainingUsd': '5.00'}


def test_limiti_dalle_variabili_d_ambiente(client, monkeypatch):
    monkeypatch.setenv('GENERATION_MAX_USD_PER_COURSE', '0.2')
    monkeypatch.setenv('GENERATION_BUDGET_USD', '1')
    spending = client.get('/generation/config').json()['spending']
    assert (spending['maxUsdPerCourse'], spending['budgetUsd']) == ('0.2', '1')


@pytest.mark.parametrize('valore', ['abc', '-1', 'nan', 'inf'])
def test_limite_non_valido_rifiuta_senza_chiamare(client, monkeypatch, valore):
    monkeypatch.setenv('GENERATION_BUDGET_USD', valore)
    estratta, fornitore = prepara(client)
    assert client.get('/generation/config').json()['spending']['error']['code'] == 'invalid_spending_limit'
    risposta = genera(client, estratta)
    assert risposta.status_code == 422
    assert risposta.json()['detail']['code'] == 'invalid_spending_limit'
    assert fornitore.chiamate == 0


def test_generazione_registrata_con_limite_prenotato_e_costo_effettivo(client):
    estratta, fornitore = prepara(client)
    limite = Decimal(preventivo(client, estratta)['upperBoundUsd'])
    risposta = genera(client, estratta)
    assert risposta.status_code == 201, risposta.text
    assert fornitore.chiamate == 1
    (corsa,) = registro(client).leggi()['corse']
    assert corsa['id'] == risposta.json()['id']
    assert corsa['esito'] == 'completata'
    assert Decimal(str(corsa['addebitatoUSD'])) == limite
    # 100 token in ingresso a 0,10 e 50 in uscita a 0,50 USD per milione (prezzi.json, Haiku).
    assert Decimal(str(corsa['effettivoUSD'])) == Decimal('0.000035')
    # Chiamata completata con i contatori: pesa sul tetto per l'importo regolato, non per il prenotato.
    regolato = Decimal(str(corsa['regolatoUSD']))
    assert regolato < limite
    assert client.get('/generation/config').json()['spending']['spentUsd'] == str(regolato)


def test_registro_separato_da_quello_delle_misure(client):
    estratta, _ = prepara(client)
    genera(client, estratta)
    assert (client.app.state.store.root / 'registro-spesa-app.json').exists()
    assert spesa.NOME_REGISTRO != 'registro-spesa.json'


def test_oltre_il_limite_per_corso_rifiutata_prima_del_fornitore(client, monkeypatch):
    monkeypatch.setenv('GENERATION_MAX_USD_PER_COURSE', '0.0001')
    estratta, fornitore = prepara(client)
    voce = preventivo(client, estratta)
    assert voce['available'] is True and voce['allowed'] is False
    assert voce['refusal']['code'] == 'over_course_limit'
    risposta = genera(client, estratta)
    assert risposta.status_code == 422
    dettaglio = risposta.json()['detail']
    assert dettaglio['code'] == 'over_course_limit'
    assert 'GENERATION_MAX_USD_PER_COURSE' in dettaglio['message']
    assert fornitore.chiamate == 0
    assert registro(client).leggi()['corse'] == []


def test_oltre_il_tetto_cumulativo_rifiutata_prima_del_fornitore(client, monkeypatch):
    monkeypatch.setenv('GENERATION_BUDGET_USD', '1')
    estratta, fornitore = prepara(client)
    registro(client).aggiorna_corsa(dict(id='precedente', addebitatoUSD=Decimal('0.9999'), chiamate=[]))
    assert preventivo(client, estratta)['refusal']['code'] == 'over_budget'
    risposta = genera(client, estratta)
    assert risposta.status_code == 422
    assert risposta.json()['detail']['code'] == 'over_budget'
    assert 'GENERATION_BUDGET_USD' in risposta.json()['detail']['message']
    assert fornitore.chiamate == 0


def test_budget_zero_nessuna_generazione(client, monkeypatch):
    monkeypatch.setenv('GENERATION_BUDGET_USD', '0')
    estratta, fornitore = prepara(client)
    assert genera(client, estratta).json()['detail']['code'] == 'over_budget'
    assert fornitore.chiamate == 0


class SenzaPrezzo(Contato):
    model = 'modello-senza-prezzo'


class OpenAISenzaQuota(Contato):
    provider_name, model = 'openai', 'gpt-6-luna'


class SenzaNome(Contato):
    provider_name = model = None


@pytest.mark.parametrize('classe,frammento', [(SenzaPrezzo, 'Modello senza prezzo'),
                                              (OpenAISenzaQuota, 'quota per chiamata'),
                                              (SenzaNome, 'fornitore o modello')])
def test_preventivo_non_disponibile_rifiuta(client, classe, frammento):
    estratta, fornitore = prepara(client, fornitore=classe())
    voce = preventivo(client, estratta)
    assert voce['available'] is False and voce['allowed'] is False
    assert voce['refusal']['code'] == 'estimate_unavailable' and frammento in voce['refusal']['message']
    risposta = genera(client, estratta)
    assert risposta.status_code == 422
    assert risposta.json()['detail']['code'] == 'estimate_unavailable'
    assert fornitore.chiamate == 0


def test_generazione_fallita_registrata_con_il_suo_costo(client):
    from formazione_api.generation import GenerationError

    class Fallisce(Contato):
        def module(self, chunk):
            self.chiamate += 1
            raise GenerationError('provider_error', 'errore controllato')

    estratta, fornitore = prepara(client, fornitore=Fallisce())
    assert genera(client, estratta).status_code == 502
    (corsa,) = registro(client).leggi()['corse']
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'provider_error'
    assert Decimal(str(corsa['addebitatoUSD'])) > 0
    assert corsa['effettivoUSD'] is None   # contatori assenti: non zero


def test_arresto_a_meta_generazione_se_il_registro_cresce(client, monkeypatch):
    """Prima di ogni blocco il registro è riletto (FornitoreSorvegliato della misura)."""
    monkeypatch.setenv('GENERATION_BUDGET_USD', '0.40')

    class AltraSpesa(Contato):
        def module(self, chunk):
            esito = super().module(chunk)
            registro(client).aggiorna_corsa(dict(id='altra', addebitatoUSD=Decimal('0.39'), chiamate=[]))
            return esito

    paragrafi = '\n\n'.join(f'Paragrafo {i}: ' + 'leggere il manuale prima di iniziare. ' * 40 for i in range(20))
    estratta, fornitore = prepara(client, testo=paragrafi.encode(), fornitore=AltraSpesa())
    assert preventivo(client, estratta)['chunks'] >= 2
    risposta = genera(client, estratta)
    assert risposta.status_code == 422
    assert risposta.json()['detail']['code'] == 'budget_guard'
    assert fornitore.chiamate == 1
    corsa = next(c for c in registro(client).leggi()['corse'] if c['id'] != 'altra')
    assert corsa['esito'] == 'arrestata'


def test_una_generazione_alla_volta(client):
    estratta, fornitore = prepara(client)
    assert spesa.GENERAZIONE_IN_CORSO.acquire(blocking=False)
    try:
        risposta = genera(client, estratta)
    finally:
        spesa.GENERAZIONE_IN_CORSO.release()
    assert risposta.status_code == 409
    assert risposta.json()['detail']['code'] == 'generation_in_progress'
    assert fornitore.chiamate == 0


def test_registro_leggibile_come_json(client):
    estratta, _ = prepara(client)
    genera(client, estratta)
    dati = json.loads((client.app.state.store.root / spesa.NOME_REGISTRO).read_text(encoding='utf-8'))
    assert dati['valuta'] == 'USD'


# --- Importi regolati: la prenotazione di un blocco completato è sostituita da un maggiorante del costo reale.

def tre_blocchi():
    return '\n\n'.join(f'Paragrafo {i}: ' + 'leggere il manuale prima di iniziare. ' * 40 for i in range(18)).encode()


def listino_haiku():
    return prezzo(carica(spesa.PREZZI), 'anthropic', 'claude-haiku-5-5')


# 100 token in ingresso alla tariffa d'ingresso più alta di Haiku (0,20, scrittura cache 1h) e 50 in uscita
# a 0,50 USD per milione, per il moltiplicatore massimo 1,1 (prezzi.json): la stessa tariffa del preventivo.
ULTIMO_TENTATIVO = (Decimal(100) * Decimal('0.20') + Decimal(50) * Decimal('0.50')) / Decimal(10**6) * Decimal('1.1')


def test_tre_blocchi_con_usage_noto_lasciano_gli_importi_regolati(client):
    estratta, fornitore = prepara(client, testo=tre_blocchi())
    assert preventivo(client, estratta)['chunks'] == 3
    risposta = genera(client, estratta)
    assert risposta.status_code == 201, risposta.text
    assert fornitore.chiamate == 3
    (corsa,) = registro(client).leggi()['corse']
    regolati = []
    for chiamata in corsa['chiamate']:
        prenotato = Decimal(str(chiamata['addebitatoUSD']))
        regolato = Decimal(str(chiamata['regolatoUSD']))
        # Un tentativo precedente (MAX_RETRIES = 1) al suo limite: metà del prenotato, che copre due tentativi.
        assert regolato == ULTIMO_TENTATIVO + prenotato / 2
        assert Decimal(str(chiamata['effettivoUSD'])) == Decimal('0.000035')
        regolati.append(regolato)
    assert Decimal(str(corsa['regolatoUSD'])) == sum(regolati)
    assert Decimal(str(corsa['addebitatoUSD'])) == Decimal(preventivo(client, estratta)['upperBoundUsd'])
    assert spesa.registro(client.app.state.store).speso() == sum(regolati)
    assert client.get('/generation/config').json()['spending']['spentUsd'] == str(sum(regolati))


class Incompleta(Contato):
    """Risposta ricevuta con i contatori, ma la chiamata fallisce: il blocco resta prenotato per intero."""

    def module(self, chunk):
        from formazione_api.generation import GenerationError
        super().module(chunk)
        raise GenerationError('provider_incomplete', 'risposta troncata')


class SenzaUsage(Contato):
    def module(self, chunk):
        esito = super().module(chunk)
        self.last_usage = None
        return esito


@pytest.mark.parametrize('classe', [Incompleta, SenzaUsage])
def test_chiamata_fallita_o_senza_usage_mantiene_il_prenotato(client, classe):
    estratta, _ = prepara(client, fornitore=classe())
    genera(client, estratta)
    (corsa,) = registro(client).leggi()['corse']
    (chiamata,) = corsa['chiamate']
    assert chiamata.get('regolatoUSD') is None
    prenotato = Decimal(str(chiamata['addebitatoUSD']))
    assert Decimal(str(corsa['regolatoUSD'])) == prenotato
    assert spesa.registro(client.app.state.store).speso() == prenotato


def test_token_oltre_il_limite_per_tentativo_mantengono_il_prenotato(client):
    class Oltre(Contato):
        def module(self, chunk):
            esito = super().module(chunk)
            self.last_usage = dict(self.last_usage, outputTokens=10**9)
            return esito

    estratta, _ = prepara(client, fornitore=Oltre())
    genera(client, estratta)
    (corsa,) = registro(client).leggi()['corse']
    assert corsa['chiamate'][0].get('regolatoUSD') is None
    assert spesa.registro(client.app.state.store).speso() == Decimal(str(corsa['addebitatoUSD']))


def test_seconda_generazione_passa_grazie_agli_importi_regolati(client, monkeypatch):
    estratta, fornitore = prepara(client, testo=tre_blocchi())
    prenotato = Decimal(preventivo(client, estratta)['upperBoundUsd'])
    # Basterebbe per una sola generazione se si sommassero i prenotati (2 × prenotato > budget).
    monkeypatch.setenv('GENERATION_BUDGET_USD', str(prenotato * Decimal('1.9')))
    assert genera(client, estratta).status_code == 201
    assert spesa.registro(client.app.state.store).prenotato() == prenotato
    voce = preventivo(client, estratta)
    assert voce['allowed'] is True, voce
    assert genera(client, estratta).status_code == 201
    assert fornitore.chiamate == 6
    # Senza regolazione la stessa seconda generazione sarebbe stata rifiutata.
    with pytest.raises(spesa.GuardiaRifiuto):
        spesa.verifica_avvio(prenotato * Decimal('1.9'), prenotato, prenotato)


def test_nessun_regolato_supera_il_suo_prenotato():
    listino = listino_haiku()
    (limite,) = pv.preventivo_corsa(pv.pianifica([dict(id='b1', page=1, text='Leggere il manuale.')]), listino)['limiti']
    prenotato = pv.costo_limite_blocco(limite, listino)
    casi = [(0, 0), (100, 50), (limite.ingresso_massimo_per_tentativo, 0), (0, limite.uscita_massima),
            (limite.ingresso_massimo_per_tentativo, limite.uscita_massima)]
    for entrata, uscita in casi:
        regolato = spesa.importo_regolato(dict(inputTokens=entrata, outputTokens=uscita, cachedInputTokens=0),
                                          limite, listino)
        assert regolato is not None and regolato <= prenotato
    # Al limite di ogni contatore il regolato coincide con il prenotato: nessun margine perso.
    assert spesa.importo_regolato(dict(inputTokens=limite.ingresso_massimo_per_tentativo,
                                       outputTokens=limite.uscita_massima), limite, listino) == prenotato
    assert spesa.importo_regolato(None, limite, listino) is None
    assert spesa.importo_regolato(dict(inputTokens=None, outputTokens=5), limite, listino) is None
    assert spesa.importo_regolato(dict(inputTokens=1, outputTokens=limite.uscita_massima + 1), limite, listino) is None


def test_voci_senza_regolato_restano_conteggiate_per_il_prenotato(client):
    reg = spesa.registro(client.app.state.store)
    # Corse scritte prima della regolazione: nessun campo regolatoUSD, nessuna migrazione.
    reg.aggiorna_corsa(dict(id='vecchia', addebitatoUSD=Decimal('0.30'),
                            chiamate=[dict(chunkId='chunk-1', addebitatoUSD=Decimal('0.30'), effettivoUSD='0.01')]))
    reg.aggiorna_corsa(dict(id='senza-chiamate', addebitatoUSD=Decimal('0.20'), chiamate=[]))
    assert reg.speso() == Decimal('0.50')
    assert reg.prenotato() == Decimal('0.50')


def test_configurazione_mostra_speso_regolato_e_residuo(client, monkeypatch):
    monkeypatch.setenv('GENERATION_BUDGET_USD', '1')
    estratta, _ = prepara(client, testo=tre_blocchi())
    assert genera(client, estratta).status_code == 201
    reg = spesa.registro(client.app.state.store)
    spending = client.get('/generation/config').json()['spending']
    assert Decimal(spending['spentUsd']) == reg.speso() < reg.prenotato() == Decimal(spending['reservedUsd'])
    assert Decimal(spending['remainingUsd']) == Decimal('1') - reg.speso()


def test_residuo_mai_negativo(client, monkeypatch):
    monkeypatch.setenv('GENERATION_BUDGET_USD', '0.10')
    spesa.registro(client.app.state.store).aggiorna_corsa(dict(id='vecchia', addebitatoUSD=Decimal('0.30'), chiamate=[]))
    spending = client.get('/generation/config').json()['spending']
    assert (spending['spentUsd'], spending['remainingUsd']) == ('0.30', '0')
