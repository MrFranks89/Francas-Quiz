"""Un'eccezione imprevista con una chiave nel testo non deve finire nel registro della spesa.

I rami `except Exception` e `except GenerationError` di genera_con_tetto (spesa_generazione.py) e di esegui_selezione
(measurement/corsa.py) registravano str(error) senza filtro: ora passa da oscura di generation/causa.py.
"""
from decimal import Decimal

import pytest

from formazione_api.generation import GenerationError
from formazione_api.measurement import corsa as misura
from formazione_api.measurement.guardia import Registro
from test_api import client, extraction, upload  # noqa: F401  (fixture)
from test_measurement import FornitoreFinto, SELEZIONE, con_fornitore, estrazione, listino, senza_fornitori_reali  # noqa: F401
from test_spesa_generazione import Contato, genera, prepara, registro, senza_limiti_ambiente  # noqa: F401

CHIAVE = 'sk-ant-api03-ChiaveFintaDiProva1234567890'
CHIAVE_SENZA_PREFISSO = 'chiave-senza-prefisso-noto-98765'


def _messaggio():
    return f'connessione rifiutata con {CHIAVE} e x-api-key: {CHIAVE_SENZA_PREFISSO}'


def _senza_chiavi(testo):
    assert CHIAVE not in testo and CHIAVE_SENZA_PREFISSO not in testo
    assert '[oscurato]' in testo


def test_generazione_con_eccezione_imprevista_non_registra_la_chiave(client, monkeypatch):
    monkeypatch.setenv('FINTO_API_KEY', CHIAVE_SENZA_PREFISSO)

    class Esplode(Contato):
        def module(self, chunk):
            self.chiamate += 1
            raise RuntimeError(_messaggio())

    estratta, _ = prepara(client, fornitore=Esplode())
    with pytest.raises(RuntimeError):
        genera(client, estratta)
    (corsa,) = registro(client).leggi()['corse']
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'RuntimeError'
    _senza_chiavi(corsa['errore']['message'])
    _senza_chiavi(str(registro(client).leggi()))


def test_corsa_di_misura_con_eccezione_imprevista_non_registra_la_chiave(tmp_path, monkeypatch):
    monkeypatch.setenv('FINTO_API_KEY', CHIAVE_SENZA_PREFISSO)

    class Esplode(FornitoreFinto):
        def module(self, chunk):
            raise RuntimeError(_messaggio())
    con_fornitore(monkeypatch, Esplode())
    reg = Registro(tmp_path / 'r.json')
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), reg, tmp_path)
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'RuntimeError'
    _senza_chiavi(corsa['errore']['message'])
    _senza_chiavi((tmp_path / 'r.json').read_text(encoding='utf-8'))


# Ramo `except GenerationError`: anche il testo di un errore della generazione passa dal filtro. Un errore
# del fornitore oggi porta un messaggio fisso, ma il registro non deve dipendere da chi lo ha scritto.

def test_generazione_con_generation_error_non_registra_la_chiave(client, monkeypatch):
    monkeypatch.setenv('FINTO_API_KEY', CHIAVE_SENZA_PREFISSO)

    class Rifiuta(Contato):
        def module(self, chunk):
            self.chiamate += 1
            raise GenerationError('provider_error', _messaggio())

    estratta, _ = prepara(client, fornitore=Rifiuta())
    # La rotta trasforma l'errore in una risposta HTTP (generation_routes.py): qui conta il registro.
    assert genera(client, estratta).status_code >= 400
    (corsa,) = registro(client).leggi()['corse']
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'provider_error'
    _senza_chiavi(corsa['errore']['message'])
    _senza_chiavi(str(registro(client).leggi()))


def test_corsa_di_misura_con_generation_error_non_registra_la_chiave(tmp_path, monkeypatch):
    monkeypatch.setenv('FINTO_API_KEY', CHIAVE_SENZA_PREFISSO)

    class Rifiuta(FornitoreFinto):
        def module(self, chunk):
            raise GenerationError('provider_error', _messaggio())
    con_fornitore(monkeypatch, Rifiuta())
    reg = Registro(tmp_path / 'r.json')
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), reg, tmp_path)
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'provider_error'
    _senza_chiavi(corsa['errore']['message'])
    _senza_chiavi((tmp_path / 'r.json').read_text(encoding='utf-8'))


# Voce della singola chiamata: oltre al nome della classe (`errore`) conserva il testo dell'errore (`dettaglio`),
# filtrato e troncato. Il 18/11/2026 un corso è fallito al blocco 6 e il registro diceva solo «ValidationError».

def test_chiamata_fallita_registra_il_dettaglio_filtrato_e_troncato(client, monkeypatch):
    monkeypatch.setenv('FINTO_API_KEY', CHIAVE_SENZA_PREFISSO)

    class Esplode(Contato):
        def module(self, chunk):
            self.chiamate += 1
            raise RuntimeError(_messaggio() + ' coda' * 300)

    estratta, _ = prepara(client, fornitore=Esplode())
    with pytest.raises(RuntimeError):
        genera(client, estratta)
    (corsa,) = registro(client).leggi()['corse']
    (chiamata,) = corsa['chiamate']
    assert chiamata['errore'] == 'RuntimeError'
    assert chiamata['dettaglio'].startswith('connessione rifiutata con [oscurato]')
    _senza_chiavi(chiamata['dettaglio'])
    assert len(chiamata['dettaglio']) <= 500 and chiamata['dettaglio'].endswith('…')
    _senza_chiavi(str(registro(client).leggi()))


def test_bozza_non_valida_del_fornitore_registra_quale_campo(client):
    """Come AnthropicProvider (ModuleDraft.model_validate_json dentro module()): la ValidationError nasce nella
    chiamata sorvegliata. Il dettaglio dice quale campo; la pipeline ritenta una volta, due voci."""
    from formazione_api.generation.models import ModuleDraft

    class Malformata(Contato):
        def module(self, chunk):
            self.chiamate += 1
            return ModuleDraft.model_validate_json('{"title": "Modulo", "objectives": [], "slides": [], "questions": []}')

    estratta, _ = prepara(client, fornitore=Malformata())
    assert genera(client, estratta).status_code >= 400
    (corsa,) = registro(client).leggi()['corse']
    assert [c['errore'] for c in corsa['chiamate']] == ['ValidationError', 'ValidationError']
    for chiamata in corsa['chiamate']:
        assert 'ModuleDraft' in chiamata['dettaglio'] and 'objectives' in chiamata['dettaglio']
