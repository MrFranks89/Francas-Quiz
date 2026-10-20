"""Controllo sulle risposte giuste dei corsi generati: posizione prevedibile, risposta più lunga."""
from formazione_api.measurement.risposte import analizza_risposte


def corso(domande):
    """`domande`: elenco di (opzioni, indice della giusta)."""
    return dict(questions=[dict(id=f'q{n}', options=[dict(id=f'option-{k}', text=t) for k, t in enumerate(opzioni)],
                                correctOptionId=f'option-{giusta}') for n, (opzioni, giusta) in enumerate(domande)])


UGUALI = ['aaaa', 'bbbb', 'cccc', 'dddd']


def per_posizione(conteggi, opzioni=UGUALI):
    return corso([(opzioni, i) for i, n in enumerate(conteggi) for _ in range(n)])


def test_sbilanciamento_della_prima_corsa_reale_segnalato():
    # 40 domande di claude-haiku-5-5 (var/misure/corse/20261020-095746-20c276a6): 11/17/8/4.
    esito = analizza_risposte(per_posizione([11, 17, 8, 4]))
    assert esito['posizioni'] == [11, 17, 8, 4] and esito['domande'] == 40
    assert round(esito['chiQuadro'], 2) == 9.0
    assert any('posizione' in a for a in esito['avvisi'])


def test_distribuzione_equilibrata_nessun_avviso():
    esito = analizza_risposte(per_posizione([10, 10, 11, 9]))
    assert esito['avvisi'] == []


def test_campione_troppo_piccolo_non_giudicato():
    esito = analizza_risposte(per_posizione([4], ['a', 'b']))
    assert esito['posizioniValutabili'] is False and esito['avvisi'] == []


def test_opzioni_di_numero_diverso_attese_per_posizione():
    # 20 domande da 2 opzioni e 20 da 4, giusta sempre in posizione 0 o 1 in proporzione attesa.
    domande = [(['a', 'b'], i % 2) for i in range(20)] + [(UGUALI, i % 4) for i in range(20)]
    esito = analizza_risposte(corso(domande))
    assert esito['posizioni'] == [15, 15, 5, 5] and esito['avvisi'] == []


def test_risposta_giusta_sistematicamente_la_piu_lunga_segnalata():
    lunga = ['risposta giusta e articolata', 'breve', 'corta', 'poco']
    domande = [(lunga, 0)] * 12 + [(UGUALI, i % 4) for i in range(8)]
    esito = analizza_risposte(corso(domande))
    assert esito['piuLunga'] == 12
    assert any('più lunga' in a for a in esito['avvisi'])


def test_pari_merito_non_conta_come_piu_lunga():
    esito = analizza_risposte(per_posizione([10, 10, 10, 10]))
    assert esito['piuLunga'] == 0


def test_risposta_piu_lunga_al_caso_nessun_avviso():
    lunga = ['risposta giusta e articolata', 'breve', 'corta', 'poco']
    domande = [(lunga, 0)] * 5 + [(['ab', 'risposta sbagliata più lunga', 'cd', 'ef'], i % 4) for i in range(35)]
    esito = analizza_risposte(corso(domande))
    assert not any('più lunga' in a for a in esito['avvisi'])
