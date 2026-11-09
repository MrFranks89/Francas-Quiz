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
    assert {c['rule'] for c, _ in casi} >= {'opzioni_duplicate', 'giusta_troppo_lunga', 'autoreferenziale',
                                            'contesto_non_viaggia', 'tempo_relativo'}
    for caso, invalido in casi:
        trovate = [v for q in invalido['questions'] for v in violazioni_domanda(q)]
        assert (caso['rule'], caso['messaggio']) in trovate, caso


# --- formulazioni che non reggono fuori dalla lezione (verifica-contenuti.mjs righe 94, 100, 106) ------------

def formule(kind='single', prompt='Quale ente decide?', opzioni=('Il comune', 'La regione'), spiegazione='Decide il comune.',
          motivazioni=None, situation=None, sentence=None, wrong=None):
    ids = [chr(ord('a') + k) for k in range(len(opzioni))]
    return [(campo, codice) for campo, codice, _ in violazioni_tipo(
        kind, prompt, list(zip(ids, opzioni)), 'a', situation, sentence, wrong, None, spiegazione, motivazioni)]


def test_autoreferenziale_in_ogni_campo_come_in_civis():
    # Civis la cerca in JSON.stringify della domanda intera (righe 280, 905, 959).
    assert formule(prompt='Come hai visto, quale ente decide?') == [('prompt', 'autoreferenziale')]
    assert formule(opzioni=('Il comune, come spiegato sopra', 'La regione, come in ogni caso simile')) == [('options', 'autoreferenziale')]
    assert formule(motivazioni=['', 'La lezione dice che non decide.']) == [('options', 'autoreferenziale')]
    assert formule(spiegazione='Il primo gruppo comprende 121 SLL, come indicato nel testo.') == [('explanation', 'autoreferenziale')]
    assert formule(kind='scenario', situation='Nel modulo precedente Marta ha letto il manuale.') == [
        ('situation', 'autoreferenziale')]


def test_contesto_e_tempo_solo_nel_testo_della_domanda():
    # Civis li cerca solo in q.q, il testo della domanda (righe 906 e 908); qui il testo della domanda
    # è prompt più situation e sentence, che lo spezzano per tipo.
    assert formule(prompt='Di quanto sono cresciuti gli occupati, secondo il testo?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Quale ente decide, nell’immagine?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Quale ente decide attualmente?') == [('prompt', 'tempo_relativo')]
    assert formule(kind='scenario', situation='Di recente Marta è stata assunta.') == [('situation', 'tempo_relativo')]
    assert formule(spiegazione='Secondo il testo, attualmente decide il comune.') == []
    assert formule(opzioni=('Il comune, attualmente', 'La regione qui sopra')) == []


def test_falsi_positivi_italiani_esclusi():
    # «al momento di/della…» è un complemento di tempo determinato, non un «adesso».
    assert formule(prompt='Che cosa si verifica al momento della firma?') == []
    assert formule(prompt='Che cosa si verifica al momento dell\'assunzione?') == []
    assert formule(prompt='Quale ente decide al momento?') == [('prompt', 'tempo_relativo')]
    # «come indicato dall'articolo 5» cita il contenuto, non la lezione; lo stesso per «come mostrato dai dati».
    assert formule(spiegazione='Decide il comune, come indicato dall\'articolo 5.') == []
    assert formule(prompt='Come mostrato dai dati Istat, quale ente decide?') == []
    assert formule(prompt='Come mostrato, quale ente decide?') == [('prompt', 'contesto_non_viaggia')]
    # In uno scenario la situazione viaggia con la domanda; in correggi l'errore la frase pure.
    assert formule(kind='scenario', prompt='Che cosa fa Marta in questa situazione?', situation='Marta arriva.') == []
    assert formule(prompt='Che cosa fa Marta in questa situazione?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(kind='correctStatement', prompt='Quale parola è sbagliata in questa frase?', sentence='Il comune decide.',
                 wrong='comune') == []
    # Parole che contengono i termini senza esserlo.
    assert formule(prompt='Quale ente decide oggi? Che cosa fa il modulista?') == []


def test_apostrofo_tipografico_come_quello_dritto():
    assert formule(prompt='Che cosa mostra l’esempio sopra?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Che cosa fa l’apparato?') == []
    assert formule(prompt='Che cosa ti suggerisce l’app consiglia?') == [('prompt', 'autoreferenziale')]


def test_il_messaggio_cita_la_formula_trovata():
    (campo, codice, messaggio), = violazioni_tipo('single', 'Quale ente decide attualmente?', [('a', 'Il comune'), ('b', 'La regione')], 'a')
    assert '«attualmente»' in messaggio


def test_la_pipeline_scarta_le_domande_con_le_formule_vietate():
    # Percorso vero: le regole non devono restare inerti fuori da violazioni_tipo.
    from test_generation import extraction
    from test_scarto_domande import COMUNI, Fornitore
    from formazione_api.generation import generate

    def domande(refs):
        comuni = dict(COMUNI, sourceRefs=refs)
        singola = lambda prompt, **altro: {**comuni, **dict(kind='single', prompt=prompt, options=['Prima', 'Seconda'],
                                                            correctIndex=0, rationales=['', '']), **altro}
        return [singola('Quale risposta?'), singola('Come hai visto, quale risposta?'),
                singola('Quale risposta, nell\'immagine?'), singola('Quale risposta vale attualmente?'),
                singola('Quale risposta segue?', explanation='La lezione dice che è la prima.')]
    result = generate(extraction(), Fornitore(domande))
    assert [q['prompt'] for q in result['course']['questions']] == ['Quale risposta?']
    assert [s['rule'] for s in result['scarti']] == ['autoreferenziale', 'contesto_non_viaggia', 'tempo_relativo', 'autoreferenziale']


def test_rimando_alla_slide_non_viaggia():
    # Non è in Civis (lì le sfide non hanno slide): qui le domande del test stanno staccate dalle slide.
    assert formule(prompt='Che cosa dice la slide sul comune?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Quale ente, nelle slide, decide?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Che cosa riporta questa slide?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Che cosa riporta quest’slide?') == [('prompt', 'contesto_non_viaggia')]
    assert formule(prompt='Quale ente decide sullo slideshow?') == []
