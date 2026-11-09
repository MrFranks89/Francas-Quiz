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


def _esempi(dopo: str) -> list[str]:
    """Gli esempi fra parentesi che seguono `dopo` nelle istruzioni."""
    inizio = ISTRUZIONI_DIDATTICHE.index(dopo + ' (') + len(dopo) + 2
    return ISTRUZIONI_DIDATTICHE[inizio:ISTRUZIONI_DIDATTICHE.index(')', inizio)].split(', ')


def test_ogni_esempio_delle_istruzioni_e_riconosciuto_dalla_sua_regola():
    # Più stretto del test sopra: ogni esempio, preso da solo, cade nella regola del suo elenco. Senza,
    # un esempio spostato fra regole (come «secondo il testo», ora autoreferenziale) passerebbe inosservato,
    # perché le istruzioni contengono altrove frasi che le regole riconoscono.
    elenchi = [(AUTOREFERENZIALE, 'niente rimandi alla lezione, al corso o al materiale'),
               (CONTESTO_NON_VIAGGIA, 'niente rimandi a un contesto che non c\'è'),
               (TEMPO_RELATIVO, 'niente riferimenti temporali che invecchiano')]
    for regola, dopo in elenchi:
        esempi = _esempi(dopo)
        assert len(esempi) >= 3, dopo
        for esempio in esempi:
            assert formula_trovata(regola, esempio), esempio
    assert {'il testo indica', 'secondo il materiale', 'secondo il testo'} <= set(_esempi(elenchi[0][1]))
