"""Validatore AI incrociato (generation/validazione.py): risposta cieca di un secondo fornitore,
scarto delle domande su cui non concorda e costo della validazione dentro il tetto di spesa."""
import json
from decimal import Decimal

import pytest

from formazione_api import spesa_generazione as spesa
from formazione_api.generation import GenerationError, generate
from formazione_api.generation.chunks import plan_chunks
from formazione_api.generation.validazione import (Validatore, concorda, create_validator,
                                                   prompt_validazione)
from test_generation import FakeProvider, extraction
from test_openai_compat_provider import client_finto, completamento

MODELLO_GROQ = 'openai/gpt-oss-120b'
MODELLO_GEMINI = 'gemini-3.8-flash'
VARIABILI = ('VALIDATION_PROVIDER', 'GENERATION_PROVIDER', 'GROQ_API_KEY', 'GROQ_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL')


@pytest.fixture(autouse=True)
def pulisci_ambiente(monkeypatch):
    for nome in VARIABILI:
        monkeypatch.delenv(nome, raising=False)


def domanda(kind='single', **campi):
    base = dict(kind=kind, prompt='Domanda?', options=[dict(id='option-0', text='Prima'),
                                                       dict(id='option-1', text='Seconda')],
                correctOptionId='option-0', explanation='Perché', sourceRefs=['page-201'])
    base.update(campi)
    return base


class TestConcorda:
    def test_singola_concorda_anche_con_spazi_e_maiuscole_diverse(self):
        assert concorda(domanda(), ['Prima'])
        assert concorda(domanda(), ['  PRIMA '])
        assert not concorda(domanda(), ['Seconda'])
        assert not concorda(domanda(), ['Prima', 'Seconda'])
        assert not concorda(domanda(), [])

    def test_multipla_concorda_sull_insieme_esatto(self):
        d = domanda('multiple', correctOptionId=None, correctOptionIds=['option-0', 'option-1'],
                    options=[dict(id=f'option-{k}', text=t) for k, t in enumerate(['A', 'B', 'C'])][:2]
                    + [dict(id='option-2', text='C')])
        d['correctOptionIds'] = ['option-0', 'option-1']
        assert concorda(d, ['B', 'A'])
        assert not concorda(d, ['A'])
        assert not concorda(d, ['A', 'B', 'C'])
        assert not concorda(d, ['A', 'A'])

    def test_matching_concorda_nell_ordine_dei_termini(self):
        d = domanda('matching', correctOptionId=None,
                    options=[dict(id=f'option-{k}', text=t) for k, t in enumerate(['Destra A', 'Destra B', 'Destra C'])],
                    pairs=[dict(id='pair-0', left='Termine A', rightOptionId='option-0'),
                           dict(id='pair-1', left='Termine B', rightOptionId='option-1'),
                           dict(id='pair-2', left='Termine C', rightOptionId='option-2')])
        assert concorda(d, ['Destra A', 'Destra B', 'Destra C'])
        assert not concorda(d, ['Destra B', 'Destra A', 'Destra C'])
        assert not concorda(d, ['Destra A', 'Destra B'])

    def test_senza_risposta_giusta_non_si_concorda_mai(self):
        d = domanda()
        d['correctOptionId'] = 'inventata'
        assert not concorda(d, ['Prima'])


class TestPrompt:
    def test_materiale_e_domande_senza_le_risposte(self):
        chunk = plan_chunks(extraction()['blocks'], 12000, 40)[0]
        d = domanda('matching', correctOptionId=None,
                    pairs=[dict(id='pair-0', left='Termine A', rightOptionId='option-0'),
                           dict(id='pair-1', left='Termine B', rightOptionId='option-1')])
        testo = prompt_validazione(chunk, [domanda(), d])
        assert 'Testo di formazione' in testo
        assert 'Termini da abbinare, in ordine: Termine A | Termine B' in testo
        assert 'Opzioni: Prima | Seconda' in testo
        assert 'correctOptionId' not in testo and 'option-0' not in testo


class TestCreateValidator:
    def test_assente_o_vuota_disattiva(self, monkeypatch):
        assert create_validator() is None
        monkeypatch.setenv('VALIDATION_PROVIDER', '  ')
        assert create_validator() is None

    def test_valore_non_ammesso(self, monkeypatch):
        monkeypatch.setenv('VALIDATION_PROVIDER', 'nvidia')
        with pytest.raises(GenerationError) as errore:
            create_validator()
        assert errore.value.code == 'not_configured'

    def test_uguale_al_generatore_non_e_indipendente(self, monkeypatch):
        monkeypatch.setenv('GENERATION_PROVIDER', 'groq')
        monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
        with pytest.raises(GenerationError) as errore:
            create_validator()
        assert 'diverso' in str(errore.value)

    def test_fornitore_diverso_configurato(self, monkeypatch):
        monkeypatch.setenv('GENERATION_PROVIDER', 'gemini')
        monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
        monkeypatch.setenv('GROQ_API_KEY', 'chiave-finta')
        monkeypatch.setenv('GROQ_MODEL', MODELLO_GROQ)
        validatore = create_validator()
        assert validatore.provider_name == 'groq'
        assert validatore.model == MODELLO_GROQ


def validatore_finto(risposte, richieste=None):
    """Validatore Groq con trasporto finto: nessuna rete, stessa forma della risposta reale."""
    corpo = json.dumps({'risposte': risposte}, ensure_ascii=False)
    return Validatore('groq', client=client_finto((200, completamento(corpo)), richieste=richieste),
                      model=MODELLO_GROQ)


class TestVerifica:
    def blocco_e_domande(self):
        risultato = generate(extraction(), FakeProvider())
        corso = risultato['course']
        chunk = plan_chunks(extraction()['blocks'], 12000, 40)[0]
        return chunk, corso['questions']

    def test_concorda_su_tutto_nessuno_scarto(self):
        chunk, domande = self.blocco_e_domande()
        risposte = []
        for d in domande:
            if d['kind'] == 'multiple':
                risposte.append([o['text'] for o in d['options'] if o['id'] in d['correctOptionIds']])
            elif d['kind'] == 'matching':
                per_id = {o['id']: o['text'] for o in d['options']}
                risposte.append([per_id[p['rightOptionId']] for p in d['pairs']])
            else:
                risposte.append([next(o['text'] for o in d['options'] if o['id'] == d['correctOptionId'])])
        richieste = []
        assert validatore_finto(risposte, richieste).verifica(chunk, domande) == []
        assert len(richieste) == 1  # una sola chiamata per tutte le domande del blocco

    def test_disaccordo_segnalato_per_indice(self):
        chunk, domande = self.blocco_e_domande()
        risposte = [['risposta inventata'] for _ in domande]
        assert validatore_finto(risposte).verifica(chunk, domande) == list(range(len(domande)))

    def test_numero_di_risposte_diverso_errore(self):
        chunk, domande = self.blocco_e_domande()
        with pytest.raises(GenerationError) as errore:
            validatore_finto([['Prima']]).verifica(chunk, domande)
        assert errore.value.code == 'validation_invalid'

    def test_uso_dichiarato_per_la_guardia_di_spesa(self):
        chunk, domande = self.blocco_e_domande()
        validatore = validatore_finto([['x'] for _ in domande])
        validatore.verifica(chunk, domande)
        assert validatore.last_usage['inputTokens'] == 120
        assert validatore.last_usage['outputTokens'] == 45


class FintoValidatore:
    """Validatore di comodo per la pipeline: scarta gli indici decisi dal test."""

    provider_name = 'finto'
    model = 'finto-1'
    last_usage = None

    def __init__(self, non_concordi):
        self.non_concordi = non_concordi
        self.chiamate = []

    def verifica(self, chunk, domande):
        self.chiamate.append((chunk.id, len(domande)))
        return self.non_concordi


class TestPipeline:
    def test_le_domande_non_concorde_sono_scartate(self):
        validatore = FintoValidatore([0, 7])
        risultato = generate(extraction(), FakeProvider(), validator=validatore)
        scarti = risultato['scarti']
        assert [s['rule'] for s in scarti] == ['validazione_incrociata'] * 2
        assert validatore.chiamate == [('chunk-1', 8)]
        corso = risultato['course']
        assert len(corso['questions']) == 6
        # La numerazione resta sequenziale e coerente con l'esame.
        assert corso['modules'][0]['exam']['questionIds'] == [q['id'] for q in corso['questions']]
        assert '2 domande scartate' in ' '.join(risultato['warnings'])

    def test_tutte_non_concorde_blocco_fallito(self):
        with pytest.raises(GenerationError) as errore:
            generate(extraction(), FakeProvider(), validator=FintoValidatore(list(range(8))))
        assert errore.value.code == 'invalid_generated_content'

    def test_senza_validatore_niente_scarti(self):
        risultato = generate(extraction(), FakeProvider())
        assert risultato['scarti'] == []

    def test_la_chiamata_del_validatore_entra_nell_uso(self):
        risultato = generate(extraction(), FakeProvider(), validator=FintoValidatore([]))
        fornitori = {c['provider'] for c in risultato['usage']['calls']}
        assert 'finto' in fornitori


class TestStimaCombinata:
    """Il preventivo somma la chiamata di validazione: il tetto per corso conta entrambe."""

    def store_finto(self, tmp_path):
        class Store:
            root = tmp_path
        return Store()

    def fornitore_finto(self):
        class F:
            provider_name = 'anthropic'
            model = 'claude-haiku-5-5'
        return F()

    def test_senza_validatore_il_preventivo_non_cambia(self, tmp_path, monkeypatch):
        stima = spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        assert 'validazione' not in stima

    def test_con_validatore_il_limite_somma_le_due_chiamate(self, tmp_path, monkeypatch):
        # Validatore gratuito (Gemini): aggiunge la sua chiamata per blocco alla stima senza
        # muovere il limite in USD; un fornitore a pagamento non misurato (OpenAI) è rifiutato.
        base = spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        monkeypatch.setenv('VALIDATION_PROVIDER', 'gemini')
        monkeypatch.setenv('GEMINI_MODEL', MODELLO_GEMINI)
        stima = spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        assert stima['validazione']['fornitore'] == 'gemini'
        atteso = base['limiteSuperioreUSD'] + stima['validazione']['limiteSuperioreUSD']
        assert stima['limiteSuperioreUSD'] == atteso
        assert stima['chiamateMassime'] == base['chiamateMassime'] * 2

    def test_validatore_a_pagamento_non_misurato_rifiutato(self, tmp_path, monkeypatch):
        monkeypatch.setenv('VALIDATION_PROVIDER', 'openai')
        monkeypatch.setenv('OPENAI_MODEL', 'gpt-5.4-mini')
        with pytest.raises(spesa.SpesaRifiuto) as errore:
            spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        assert errore.value.code == 'estimate_unavailable'

    def test_validatore_uguale_al_generatore_rifiutato(self, tmp_path, monkeypatch):
        monkeypatch.setenv('VALIDATION_PROVIDER', 'anthropic')
        with pytest.raises(spesa.SpesaRifiuto) as errore:
            spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        assert errore.value.code == 'invalid_validation_provider'

    def test_validatore_senza_modello_rifiutato(self, tmp_path, monkeypatch):
        monkeypatch.setenv('VALIDATION_PROVIDER', 'groq')
        with pytest.raises(spesa.SpesaRifiuto) as errore:
            spesa.valuta(extraction(), self.fornitore_finto(), self.store_finto(tmp_path))
        assert errore.value.code == 'estimate_unavailable'
