"""Strumento di misura: nessuna rete, nessun fornitore reale (docs/MISURE.md)."""
import json
from decimal import Decimal
from zipfile import ZipFile

import pytest

from formazione_api import generation
from formazione_api.generation import selection
from formazione_api.generation.chunks import plan_chunks
from formazione_api.generation.instructions import ISTRUZIONI_DIDATTICHE, MAX_OUTPUT_TOKENS, MAX_RETRIES, materiale
from formazione_api.generation.models import ModuleDraft
from formazione_api.measurement import corsa as misura
from formazione_api.measurement import preventivo as pv
from formazione_api.measurement.guardia import GuardiaRifiuto, Registro, costo_effettivo, verifica_avvio
from formazione_api.measurement.integrita import FileNonConforme, sha256_file, verifica_file, verifica_membro_zip
from formazione_api.measurement.prezzi import PrezzoMancante, prezzo


def listino(sovraccarico=100, modello='modello-prova'):
    return {'valuta': 'USD', 'fornitori': {'anthropic': {
        'moltiplicatoreMassimo': {'valore': Decimal('1.1')},
        'sovraccaricoIngressoPerChiamata': {'token': sovraccarico},
        'modelli': {modello: {'ingresso': Decimal('3'), 'ingressoCache': Decimal('0.3'), 'uscita': Decimal('15'),
                              'altriIngressi': {'scritturaCache1h': Decimal('6')}, 'sogliaContestoLungo': None,
                              'fonte': 'https://esempio.invalid/prezzi', 'lettoIl': '2026-10-19'}}}}}


def estrazione(pagine=3, testo='Paragrafo di formazione con accenti: perché, è.\n\n' * 400):
    blocks = [dict(id=f'b{p}', page=p, label=f'Pagina {p}', text=testo) for p in range(1, pagine + 1)]
    return dict(documentId='doc-prova', selezione='sel', kind='pdf', inizio=1, fine=pagine, engine='native',
                blocks=blocks, warnings=['Estrazione nativa'], status='needs_review')


SELEZIONE = {'id': 'sel', 'documento': 'doc-prova'}


class FornitoreFinto:
    """Restituisce un modulo valido e dichiara il massimo dei token ammessi per tentativo."""
    provider_name = 'anthropic'
    model = 'modello-prova'

    def __init__(self, ingresso=None, uscita=MAX_OUTPUT_TOKENS, al_modulo=None):
        self.ingresso, self.uscita, self.al_modulo = ingresso, uscita, al_modulo
        self.last_usage, self.chiamate = None, []

    def module(self, chunk):
        self.chiamate.append(chunk.id)
        if self.al_modulo:
            self.al_modulo(len(self.chiamate))
        limite = pv.limite_blocco(chunk, 'anthropic', 100)
        self.last_usage = dict(model=self.model, inputTokens=self.ingresso or limite.ingresso_massimo_per_tentativo,
                               outputTokens=self.uscita, cachedInputTokens=0)
        refs = list(dict.fromkeys(p.source_id for p in chunk.pieces))
        return ModuleDraft(title='Modulo', objectives=['Obiettivo'],
                           slides=[dict(heading='Titolo', body='Testo', highlight='', sourceRefs=refs)],
                           questions=[dict(prompt='Domanda?', options=['A', 'B'], correctIndex=0,
                                           explanation='Perché', sourceRefs=refs)])


@pytest.fixture
def senza_fornitori_reali(monkeypatch):
    """Ogni tentativo di creare un fornitore reale fa fallire il test."""
    def vietato():
        raise AssertionError('create_provider chiamato')
    monkeypatch.setattr(selection, 'create_provider', vietato)
    monkeypatch.setattr(misura, 'create_provider', vietato)
    monkeypatch.setattr(generation.pipeline, 'create_provider', vietato)


def con_fornitore(monkeypatch, fornitore):
    monkeypatch.setattr(misura, 'create_provider', lambda: fornitore)


# --- integrità -----------------------------------------------------------------------------------

def test_hash_errato_rifiutato(tmp_path):
    file = tmp_path / 'doc.pdf'
    file.write_bytes(b'%PDF-contenuto')
    assert verifica_file(file, sha256_file(file)) == sha256_file(file)
    with pytest.raises(FileNonConforme):
        verifica_file(file, '0' * 64)
    with pytest.raises(FileNonConforme):
        verifica_file(tmp_path / 'assente.pdf', '0' * 64)


def test_file_estratto_diverso_dal_membro_zip_rifiutato(tmp_path):
    archivio = tmp_path / 'D.zip'
    with ZipFile(archivio, 'w') as zip_file:
        zip_file.writestr('D/T.xlsx', b'originale')
    estratto = tmp_path / 'T.xlsx'
    estratto.write_bytes(b'originale')
    verifica_membro_zip(archivio, sha256_file(archivio), 'D/T.xlsx', estratto)
    estratto.write_bytes(b'modificato')
    with pytest.raises(FileNonConforme):
        verifica_membro_zip(archivio, sha256_file(archivio), 'D/T.xlsx', estratto)
    with pytest.raises(FileNonConforme):
        verifica_membro_zip(archivio, '0' * 64, 'D/T.xlsx', estratto)


# --- preventivo ----------------------------------------------------------------------------------

def test_limite_conta_byte_di_istruzioni_materiale_e_schema_come_inviati():
    chunk = pv.pianifica(estrazione()['blocks'])[0]
    limite = pv.limite_blocco(chunk, 'anthropic', 100)
    assert limite.byte_istruzioni == len(ISTRUZIONI_DIDATTICHE.encode('utf-8'))
    assert limite.byte_materiale == len(materiale(chunk).encode('utf-8'))
    assert limite.byte_materiale > len(materiale(chunk))      # accenti: i byte superano i caratteri
    assert limite.byte_schema > 0 and limite.uscita_massima == MAX_OUTPUT_TOKENS
    assert limite.tentativi == 1 + MAX_RETRIES
    assert pv.limite_blocco(chunk, 'openai', 100).byte_schema > 0


def test_pianificazione_identica_alla_pipeline():
    blocks = estrazione(20)['blocks']
    assert pv.pianifica(blocks) == plan_chunks(blocks)     # stessi parametri predefiniti di generate()


def test_limite_superiore_maggiora_il_costo_reale_con_tutti_i_tentativi_al_massimo():
    tariffa = prezzo(listino(), 'anthropic', 'modello-prova')
    for chunk in pv.pianifica(estrazione(5)['blocks']):
        limite = pv.limite_blocco(chunk, 'anthropic', tariffa.sovraccarico_ingresso)
        massimo = dict(inputTokens=limite.ingresso_massimo_per_tentativo, outputTokens=limite.uscita_massima,
                       cachedInputTokens=0)
        fatturato = costo_effettivo(massimo, tariffa) * limite.tentativi
        assert pv.costo_limite_blocco(limite, tariffa) >= fatturato


def test_pagine_con_poco_testo_segnalate_come_probabile_scansione():
    blocks = [dict(id='b1', page=1, text='x' * 500), dict(id='b2', page=2, text='GURITEL ' * 18)]
    assert pv.pagine_poco_testo(blocks, 1, 3) == [2, 3]


# --- guardia -------------------------------------------------------------------------------------

def test_guardia_budget_zero_rifiuta():
    with pytest.raises(GuardiaRifiuto):
        verifica_avvio(Decimal(0), Decimal(0), Decimal('0.01'))
    with pytest.raises(GuardiaRifiuto):
        verifica_avvio(Decimal(5), Decimal(0), Decimal(1), limite_completo=False)
    verifica_avvio(Decimal(5), Decimal(4), Decimal(1))


def test_modello_senza_prezzo_rifiutato(tmp_path, senza_fornitori_reali):
    with pytest.raises(PrezzoMancante):
        prezzo(listino(), 'anthropic', 'modello-senza-prezzo')
    with pytest.raises(PrezzoMancante):
        misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-senza-prezzo',
                                Decimal(100), Registro(tmp_path / 'r.json'), tmp_path)


def test_budget_zero_nessun_fornitore_creato_e_preventivo_funziona(tmp_path, senza_fornitori_reali):
    voce = misura.preventivo_selezione(SELEZIONE, estrazione(), listino())
    assert voce['modelli'][0]['limiteSuperioreUSD'] > 0
    registro = Registro(tmp_path / 'r.json')
    with pytest.raises(GuardiaRifiuto):
        misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                Decimal(0), registro, tmp_path)
    assert registro.leggi()['corse'] == []


def test_limite_incompleto_blocca_la_corsa_reale(tmp_path, senza_fornitori_reali):
    with pytest.raises(GuardiaRifiuto):
        misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(sovraccarico=None), 'anthropic',
                                'modello-prova', Decimal(1000), Registro(tmp_path / 'r.json'), tmp_path)


def test_corsa_reale_passa_da_generate(tmp_path, monkeypatch):
    chiamate = []
    vero = misura.generate

    def spia(*args, **kwargs):
        chiamate.append((args, kwargs))
        return vero(*args, **kwargs)
    monkeypatch.setattr(misura, 'generate', spia)
    fornitore = FornitoreFinto()
    con_fornitore(monkeypatch, fornitore)
    registro = Registro(tmp_path / 'r.json')
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), registro, tmp_path / 'corse')
    assert len(chiamate) == 1 and chiamate[0][1]['acknowledge_warnings'] is True
    assert corsa['esito'] == 'completata' and len(fornitore.chiamate) == corsa['blocchi']
    bozza = json.loads((tmp_path / 'corse' / corsa['id'] / 'bozza.json').read_text(encoding='utf-8'))
    assert bozza['usage']['callCount'] == corsa['blocchi'] and bozza['usage']['provider'] == 'anthropic'
    scheda = json.loads((tmp_path / 'corse' / corsa['id'] / 'revisione.json').read_text(encoding='utf-8'))
    assert scheda['approvato'] is None and 'minutiRevisione' in scheda
    assert Decimal(str(corsa['effettivoUSD'])) <= Decimal(str(corsa['addebitatoUSD'])) == corsa['limiteSuperioreUSD']
    assert registro.speso() == corsa['limiteSuperioreUSD']


def test_guardia_rispetta_il_registro_fra_due_corse(tmp_path, monkeypatch):
    fornitore = FornitoreFinto()
    con_fornitore(monkeypatch, fornitore)
    registro = Registro(tmp_path / 'r.json')
    limite = pv.preventivo_corsa(pv.pianifica(estrazione()['blocks']), prezzo(listino(), 'anthropic', 'modello-prova'))
    budget = limite['limiteSuperioreUSD'] * Decimal('1.5')
    prima = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    budget, registro, tmp_path)
    assert prima['esito'] == 'completata'
    chiamate = len(fornitore.chiamate)
    with pytest.raises(GuardiaRifiuto):
        misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                budget, registro, tmp_path)
    assert len(fornitore.chiamate) == chiamate and len(registro.leggi()['corse']) == 1


def test_arresto_a_meta_corsa_se_il_registro_cresce(tmp_path, monkeypatch):
    registro = Registro(tmp_path / 'r.json')
    limite = pv.preventivo_corsa(pv.pianifica(estrazione()['blocks']), prezzo(listino(), 'anthropic', 'modello-prova'))
    assert limite['blocchi'] >= 2

    def altra_corsa(n):   # un'altra corsa registra spesa mentre questa è al primo blocco
        if n == 1:
            registro.aggiorna_corsa(dict(id='altra', selezione='x', fornitore='anthropic', modello='m', esito='completata',
                                         addebitatoUSD=limite['limiteSuperioreUSD'], chiamate=[], cartella=str(tmp_path)))
    fornitore = FornitoreFinto(al_modulo=altra_corsa)
    con_fornitore(monkeypatch, fornitore)
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    limite['limiteSuperioreUSD'] * Decimal('1.2'), registro, tmp_path)
    assert corsa['esito'] == 'arrestata' and corsa['errore']['code'] == 'budget_guard'
    assert len(fornitore.chiamate) == 1 and 'chunk-2' in corsa['arresto']
    salvata = next(c for c in registro.leggi()['corse'] if c['id'] == corsa['id'])
    assert salvata['esito'] == 'arrestata' and len(salvata['chiamate']) == 1
    # Questa corsa ha riservato solo il primo blocco; l'altra corsa non è passata dalla guardia.
    assert Decimal(str(salvata['addebitatoUSD'])) < limite['limiteSuperioreUSD']


def test_token_oltre_il_limite_fermano_il_blocco_successivo(tmp_path, monkeypatch):
    fornitore = FornitoreFinto(ingresso=10**7)
    con_fornitore(monkeypatch, fornitore)
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), Registro(tmp_path / 'r.json'), tmp_path)
    assert corsa['esito'] == 'arrestata' and len(fornitore.chiamate) == 1
    assert corsa['chiamate'][0]['violazioneLimite'] is True


def test_corsa_fallita_registrata_con_il_suo_costo(tmp_path, monkeypatch):
    class Rotto(FornitoreFinto):
        def module(self, chunk):
            self.last_usage = dict(model='m', inputTokens=1000, outputTokens=6000, cachedInputTokens=0)
            raise generation.GenerationError('provider_incomplete', 'troncata')
    con_fornitore(monkeypatch, Rotto())
    registro = Registro(tmp_path / 'r.json')
    corsa = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), registro, tmp_path)
    assert corsa['esito'] == 'fallita' and corsa['errore']['code'] == 'provider_incomplete'
    assert Decimal(str(corsa['effettivoUSD'])) > 0 and registro.speso() > 0
    riepilogo = misura.riepilogo(registro)[0]
    assert riepilogo['fallite'] == 1 and riepilogo['costoPerCorsoApprovatoUSD'] is None


def test_costo_per_corso_approvato_somma_anche_le_corse_fallite(tmp_path, monkeypatch):
    registro = Registro(tmp_path / 'r.json')
    con_fornitore(monkeypatch, FornitoreFinto())
    buona = misura.esegui_selezione(SELEZIONE, estrazione(), 'sha', listino(), 'anthropic', 'modello-prova',
                                    Decimal(1000), registro, tmp_path)
    scheda = tmp_path / buona['id'] / 'revisione.json'
    dati = json.loads(scheda.read_text(encoding='utf-8'))
    scheda.write_text(json.dumps({**dati, 'approvato': True}), encoding='utf-8')
    registro.aggiorna_corsa(dict(id='fallita', selezione='sel', fornitore='anthropic', modello='modello-prova',
                                 esito='fallita', addebitatoUSD=Decimal(1), effettivoUSD=Decimal('0.5'), chiamate=[],
                                 cartella=str(tmp_path)))
    riga = misura.riepilogo(registro)[0]
    assert riga['approvati'] == 1 and riga['corse'] == 2
    assert riga['costoPerCorsoApprovatoUSD'] == Decimal(str(buona['effettivoUSD'])) + Decimal('0.5')


def test_prezzi_registrati_hanno_fonte_data_e_sono_leggibili():
    from pathlib import Path
    from formazione_api.measurement.prezzi import carica, modelli
    prezzi = carica(Path(__file__).resolve().parents[3] / 'tests' / 'corpus' / 'prezzi.json')
    coppie = list(modelli(prezzi))
    assert {f for f, _ in coppie} == {'openai', 'anthropic'}
    for fornitore, modello in coppie:
        tariffa = prezzo(prezzi, fornitore, modello)
        assert tariffa.uscita > 0 and tariffa.moltiplicatore_massimo >= 1
