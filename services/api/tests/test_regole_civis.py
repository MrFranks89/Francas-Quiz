"""Regole di singola domanda portate da Civis (C:\\Civica\\CivicaApp\\scripts\\verifica-contenuti.mjs).

Stesse regole e stessi messaggi in packages/contracts/src/tipi.ts (__tests__/regole-civis.test.ts);
i casi condivisi stanno in fixtures/invalid-course-cases.json, con la regola attesa in `rule`.
"""
import json
from copy import deepcopy
from pathlib import Path

from formazione_api.generation.models import violazioni_domanda
from formazione_api.generation.regole import normalizza_opzione, violazioni_tipo

FIXTURES = Path(__file__).parent / 'fixtures'


def codici(kind, opzioni, giusta='a', giuste=None, prompt='Domanda?'):
    ids = [chr(ord('a') + k) for k in range(len(opzioni))]
    return [c for _, c, _ in violazioni_tipo(kind, prompt, list(zip(ids, opzioni)), giusta, correct_ids=giuste)]


def test_opzioni_duplicate_a_meno_di_spazi_e_maiuscole_su_ogni_tipo():
    assert codici('single', ['Prima', '  prima  ']) == ['opzioni_duplicate']
    assert codici('single', ['Il  referente', 'il referente']) == ['opzioni_duplicate']
    assert codici('fillblank', ['secondo', 'Secondo'], prompt='Il ___ paragrafo.') == ['opzioni_duplicate']
    assert codici('oddOneOut', ['Uno', 'UNO', 'Tre'], giusta='c') == ['opzioni_duplicate']
    assert codici('multiple', ['Uno', 'Due', 'uno ', 'Tre'], giusta=None, giuste=['a', 'b']) == ['opzioni_duplicate']


def test_gli_accenti_distinguono_le_opzioni_ma_non_la_loro_scrittura():
    # papa/papà: parole diverse, distrattore legittimo.
    assert codici('fillblank', ['papa', 'papà'], prompt='Il ___ arriva.') == []
    # «è» in un carattere o «e» più accento combinante: identici a vedersi, quindi duplicati.
    assert normalizza_opzione('\u00e8') == normalizza_opzione('e\u0300')
    assert codici('fillblank', ['\u00e8', 'e\u0300'], prompt='Il cielo ___ blu.') == ['opzioni_duplicate']


def test_giusta_troppo_lunga_anche_sulla_scelta_singola():
    assert codici('single', ['giusta molto molto lunga', 'no']) == ['giusta_troppo_lunga']
    assert codici('single', ['aaaaaa', 'xxxx']) == []
    assert codici('single', ['aaaaaaa', 'xxxx']) == ['giusta_troppo_lunga']


def test_giusta_troppo_lunga_non_su_fillblank_ne_truefalse():
    assert codici('fillblank', ['amministrazione', 'ente'], prompt='La ___ decide.') == []
    assert codici('truefalse', ['Vero', 'Falso'], giusta='b') == []


def test_giusta_troppo_lunga_sulla_multipla_opzione_per_opzione():
    lunga = 'Testo di formazione con molti dettagli aggiuntivi'
    assert codici('multiple', [lunga, 'Secondo paragrafo', 'Una tabella', 'Un grafico'], giusta=None, giuste=['a', 'b']) == [
        'giusta_troppo_lunga']
    # Due giuste più lunghe delle sbagliate ma non di 1,5 volte la più lunga delle altre: la multipla
    # della pipeline di prova resta valida.
    assert codici('multiple', ['Testo di formazione', 'Secondo paragrafo', 'Una tabella', 'Un grafico'], giusta=None,
                  giuste=['a', 'b']) == []
    # Una sbagliata lunga non è un indizio.
    assert codici('multiple', ['Uno', 'Due', 'Una sbagliata molto più lunga', 'Tre'], giusta=None, giuste=['a', 'b']) == []


def _casi_con_regola():
    corso = json.loads((FIXTURES / 'generated-course.json').read_text(encoding='utf-8'))
    for caso in json.loads((FIXTURES / 'invalid-course-cases.json').read_text(encoding='utf-8')):
        if 'rule' not in caso:
            continue
        invalido = deepcopy(corso)
        for modifica in caso.get('changes', [caso]):
            target = invalido
            for chiave in modifica['path'][:-1]:
                target = target[chiave]
            target[modifica['path'][-1]] = modifica['value']
        yield caso, invalido


def test_i_casi_condivisi_sono_rifiutati_per_la_regola_dichiarata():
    # Esclude che un caso sia rifiutato per un motivo diverso da quello che vuole provare.
    casi = list(_casi_con_regola())
    assert {c['rule'] for c, _ in casi} >= {'opzioni_duplicate', 'giusta_troppo_lunga'}
    for caso, invalido in casi:
        trovate = [v for q in invalido['questions'] for v in violazioni_domanda(q)]
        assert (caso['rule'], caso['messaggio']) in trovate, caso
