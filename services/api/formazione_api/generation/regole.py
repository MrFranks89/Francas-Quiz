"""Regole di qualità per tipo di domanda e codici di scarto della generazione."""
from .comune import OPZIONI_VERO_FALSO, SPAZIO


_CAMPI_DEL_TIPO = {'situation': 'scenario', 'sentence': 'correctStatement', 'wrong': 'correctStatement'}


def errori_tipo(kind, prompt, options, correct_id, situation=None, sentence=None, wrong=None,
                correct_ids=None) -> list[tuple[str, str]]:
    """Regole per tipo, (campo, messaggio). `options`: elenco di (id, testo).

    Riscritte, non copiate, da C:\\Civica\\CivicaApp\\scripts\\verifica-contenuti.mjs (righe 281–331);
    stesso ordine e stessi messaggi di erroriTipo in packages/contracts/src/tipi.ts. Una sola giusta
    è garantita dalla forma (un correctOptionId); che sia fra le opzioni lo controlla il corso.
    """
    return [(campo, messaggio) for campo, _, messaggio in
            violazioni_tipo(kind, prompt, options, correct_id, situation, sentence, wrong, correct_ids)]


def violazioni_tipo(kind, prompt, options, correct_id, situation=None, sentence=None, wrong=None,
                    correct_ids=None) -> list[tuple[str, str, str]]:
    """Le regole di errori_tipo con il loro codice stabile: (campo, codice, messaggio).

    Il codice identifica la regola negli scarti della generazione e nel rapporto della misura, e non
    cambia se cambia il testo del messaggio. Codici solo lato Python: erroriTipo del contratto
    TypeScript espone campo e messaggio.
    """
    errori = []
    campi = dict(situation=situation, sentence=sentence, wrong=wrong)
    for campo, tipo in _CAMPI_DEL_TIPO.items():
        if kind != tipo and campi[campo] is not None:
            errori.append((campo, 'campo_di_altro_tipo', f'Il campo {campo} vale solo per il tipo {tipo}'))
    testi = [t.strip() for _, t in options]
    # Risposta multipla: più giuste in correctOptionIds (almeno 2, almeno una sbagliata), mai correctOptionId;
    # tutti gli altri tipi l'opposto. Decisione dell'utente del 28 ottobre 2026.
    if kind == 'multiple':
        giuste = correct_ids or []
        ids = {i for i, _ in options}
        if correct_id is not None:
            errori.append(('correctOptionId', 'multipla_giusta_singola', 'Risposta multipla: le giuste vanno in correctOptionIds'))
        if len(giuste) < 2:
            errori.append(('correctOptionIds', 'multipla_meno_di_due_giuste', 'Risposta multipla: servono almeno 2 risposte giuste'))
        elif len(set(giuste)) != len(giuste) or not set(giuste) <= ids:
            errori.append(('correctOptionIds', 'multipla_giuste_non_valide', 'Risposta multipla: le giuste devono essere opzioni diverse della domanda'))
        elif len(giuste) >= len(options):
            errori.append(('correctOptionIds', 'multipla_senza_sbagliate', 'Risposta multipla: serve almeno una risposta sbagliata'))
        if len(set(testi)) != len(testi):
            errori.append(('options', 'opzioni_duplicate', 'Opzioni duplicate'))
    else:
        if correct_ids is not None:
            errori.append(('correctOptionIds', 'giuste_multiple_fuori_tipo', 'Il campo correctOptionIds vale solo per il tipo multiple'))
        if not correct_id:
            errori.append(('correctOptionId', 'giusta_mancante', 'Manca la risposta giusta'))
    if kind == 'truefalse' and tuple(testi) != OPZIONI_VERO_FALSO:
        errori.append(('options', 'vero_falso_opzioni', 'Vero o falso: le opzioni sono esattamente «Vero» e «Falso», in quest\'ordine'))
    if kind == 'fillblank' and prompt.count(SPAZIO) != 1:
        errori.append(('prompt', 'spazio_non_unico', f'Completa la frase: il testo deve contenere esattamente uno spazio {SPAZIO}'))
    if kind == 'scenario' and not (situation or '').strip():
        errori.append(('situation', 'situazione_mancante', 'Scenario: la situazione è obbligatoria'))
    if kind == 'correctStatement':
        if not (sentence or '').strip():
            errori.append(('sentence', 'frase_mancante', 'Correggi l\'errore: la frase è obbligatoria'))
        if not (wrong or '').strip():
            errori.append(('wrong', 'parte_sbagliata_mancante', 'Correggi l\'errore: la parte sbagliata è obbligatoria'))
        elif (sentence or '').strip() and sentence.count(wrong) != 1:
            errori.append(('wrong', 'parte_sbagliata_non_unica', 'Correggi l\'errore: la parte sbagliata deve comparire esattamente una volta nella frase'))
    if kind in ('scenario', 'oddOneOut', 'correctStatement'):
        if len(set(testi)) != len(testi):
            errori.append(('options', 'opzioni_duplicate', 'Opzioni duplicate'))
        ids = [i for i, _ in options]
        if correct_id in ids and len(options) > 1:
            giusta = ids.index(correct_id)
            rivale = max(len(t) for k, t in enumerate(testi) if k != giusta)
            # len() conta punti di codice, come Array.from in TypeScript; 2·giusta > 3·rivale ⇔ giusta > 1,5·rivale.
            if 2 * len(testi[giusta]) > 3 * rivale:
                errori.append(('options', 'giusta_troppo_lunga', 'La risposta giusta è più lunga di 1,5 volte la più lunga delle altre: '
                                          'si riconosce senza conoscere la materia'))
    return errori


def violazioni_domanda(domanda: dict) -> list[tuple[str, str]]:
    """Regole di qualità di una domanda generata, già nella forma del contratto: (codice, messaggio).

    Sono le regole di errori_tipo, applicate alla stessa forma che Question valida nel corso (così
    una domanda che le supera non può far fallire Course né CourseSchema per queste regole), più la
    regola della generazione sulla risposta multipla. Elenco vuoto = domanda da tenere.
    """
    giuste = domanda.get('correctOptionIds')
    violazioni = [(codice, messaggio) for _, codice, messaggio in violazioni_tipo(
        domanda['kind'], domanda['prompt'], [(o['id'], o['text']) for o in domanda['options']],
        domanda.get('correctOptionId'), domanda.get('situation'), domanda.get('sentence'), domanda.get('wrong'), giuste)]
    # Regola della generazione, più stretta del contratto (che chiede solo almeno una sbagliata):
    # con più giuste che sbagliate la domanda si indovina scegliendo quasi tutto.
    if domanda['kind'] == 'multiple' and giuste is not None and 2 * len(giuste) > len(domanda['options']):
        violazioni.append(('multipla_oltre_meta_giuste', 'Risposta multipla: non più di metà delle opzioni può essere giusta'))
    return violazioni
