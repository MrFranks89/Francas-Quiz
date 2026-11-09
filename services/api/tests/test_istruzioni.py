"""Istruzioni didattiche al modello: regole portate da Civis (docs/GENERAZIONE.md).

Il testo delle istruzioni non è nello schema: le istantanee in istantanee/ restano identiche
(test_schema_fornitori.py, test_istantanee_models.py). Qui si controlla che le regole ci siano e che
gli esempi di formule vietate siano gli stessi che le regole di scarto riconoscono.
"""
from formazione_api.generation.instructions import ISTRUZIONI_DIDATTICHE
from formazione_api.generation.regole import AUTOREFERENZIALE, CONTESTO_NON_VIAGGIA, TEMPO_RELATIVO, formula_trovata


def test_domande_solo_su_fatti_delle_slide_del_modulo():
    assert 'presenti nelle slide di questo modulo' in ISTRUZIONI_DIDATTICHE


def test_distrattori_con_ruoli():
    for ruolo in ('plausibile', 'ingannevole', 'chiaramente errata'):
        assert ruolo in ISTRUZIONI_DIDATTICHE
    assert 'resta sbagliata per chi ha capito tutto' in ISTRUZIONI_DIDATTICHE


def test_motivazione_breve_sui_distrattori_plausibili():
    assert '140 caratteri' in ISTRUZIONI_DIDATTICHE


def test_gli_esempi_di_formule_vietate_sono_quelli_che_le_regole_scartano():
    # Se le istruzioni e le regole divergono, il modello evita formule che nessuno scarta, o viceversa.
    for regola in (AUTOREFERENZIALE, CONTESTO_NON_VIAGGIA, TEMPO_RELATIVO):
        assert formula_trovata(regola, ISTRUZIONI_DIDATTICHE), regola.pattern[:40]
