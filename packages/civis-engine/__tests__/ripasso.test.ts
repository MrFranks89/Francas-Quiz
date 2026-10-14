/**
 * Test per src/ripasso.ts: il motore del ripasso (specifica in
 * C:\Civica\Civis_Ripasso_Specifica.md). Qui la parte che può sbagliare in
 * silenzio è la scelta delle domande — composizione 2+1, uscita dal livello 1
 * dopo una risposta giusta, scalata quando un livello è vuoto — più la
 * normalizzazione che decide quali step sono davvero riproponibili.
 */
import {
  DomandaSbagliata, creaDomandaSbagliata, aggiungiDomandaSbagliata, rimuoviDomandaSbagliata,
  normalizzaPerRipasso, scegliDomandeRipasso, ordinaPerRipassoCompleto, fondiDomandeSbagliate, giornoLocale,
} from '../src/ripasso';

describe('creaDomandaSbagliata / aggiungiDomandaSbagliata / rimuoviDomandaSbagliata', () => {
  const nuova = () => creaDomandaSbagliata({
    lezioneId: '3-2', stepIdx: 1, moduloId: 3,
    domanda: 'La Costituzione è rigida o flessibile?',
    opzioni: ['Rigida', 'Flessibile'], correctIndex: 0,
    spiegazione: 'Si cambia solo con un procedimento aggravato.',
  });

  it('la stessa domanda (stessa lezione+step+testo) sbagliata due volte resta una voce sola', () => {
    let lista: DomandaSbagliata[] = [];
    lista = aggiungiDomandaSbagliata(lista, nuova());
    lista = aggiungiDomandaSbagliata(lista, nuova());
    expect(lista).toHaveLength(1);
  });

  it('sbaglio una domanda: compare nella lista (livello 1)', () => {
    const lista = aggiungiDomandaSbagliata([], nuova());
    expect(lista.map((d) => d.domanda)).toContain('La Costituzione è rigida o flessibile?');
  });

  it('la indovino: esce dalla lista, una volta sola', () => {
    let lista = aggiungiDomandaSbagliata([], nuova());
    const chiave = lista[0].chiave;
    lista = rimuoviDomandaSbagliata(lista, chiave);
    expect(lista).toHaveLength(0);
  });

  it('domande diverse (testo diverso, stessa lezione+step) restano voci distinte', () => {
    const a = creaDomandaSbagliata({ lezioneId: '3-2', stepIdx: 1, moduloId: 3, domanda: 'Domanda A', opzioni: ['x', 'y'], correctIndex: 0 });
    const b = creaDomandaSbagliata({ lezioneId: '3-2', stepIdx: 1, moduloId: 3, domanda: 'Domanda B', opzioni: ['x', 'y'], correctIndex: 1 });
    let lista: DomandaSbagliata[] = [];
    lista = aggiungiDomandaSbagliata(lista, a);
    lista = aggiungiDomandaSbagliata(lista, b);
    expect(lista).toHaveLength(2);
  });
});

describe('normalizzaPerRipasso', () => {
  it('truefalse: Vero/Falso come opzioni, indice giusto secondo step.correct', () => {
    const n = normalizzaPerRipasso({ type: 'truefalse', question: 'Il Presidente è eletto dal popolo?', correct: false, explanation: 'Lo elegge il Parlamento in seduta comune.' });
    expect(n).toEqual(expect.objectContaining({ q: 'Il Presidente è eletto dal popolo?', options: ['Vero', 'Falso'], correct: 1 }));
  });

  it('scenario: opzioni dallo step, indice di quella corretta', () => {
    const n = normalizzaPerRipasso({
      type: 'scenario', situation: 'Sei in comune.', question: 'Cosa fai?',
      options: [{ id: 1, text: 'A', correct: false }, { id: 2, text: 'B', correct: true }],
      explanation: 'B perché...',
    });
    expect(n?.options).toEqual(['A', 'B']);
    expect(n?.correct).toBe(1);
  });

  it('quiz_single: passthrough di un indice già valido', () => {
    const n = normalizzaPerRipasso({ type: 'quiz_single', q: 'Quanti articoli?', options: ['100', '139', '200'], correct: 1 });
    expect(n).toEqual(expect.objectContaining({ q: 'Quanti articoli?', options: ['100', '139', '200'], correct: 1 }));
  });

  it('fillblank: la frase con lo spazio resta la domanda, opzioni e indice dallo step', () => {
    const n = normalizzaPerRipasso({ type: 'fillblank', text: 'La Costituzione ha ___ articoli', options: ['100', '139'], correct: 1, explanation: 'Sono 139.' });
    expect(n?.q).toBe('La Costituzione ha ___ articoli');
    expect(n?.correct).toBe(1);
  });

  it('senza una risposta corretta marcata: non riproponibile, torna null (si salta, non si mostra identica)', () => {
    const n = normalizzaPerRipasso({
      type: 'scenario', question: 'Cosa fai?',
      options: [{ id: 1, text: 'A', correct: false }, { id: 2, text: 'B', correct: false }],
    });
    expect(n).toBeNull();
  });

  it('tipi a più passaggi (match/sort/order) non si riducono a domanda singola: null', () => {
    expect(normalizzaPerRipasso({ type: 'match', pairs: [] })).toBeNull();
    expect(normalizzaPerRipasso({ type: 'sort' })).toBeNull();
    expect(normalizzaPerRipasso({ type: 'order' })).toBeNull();
  });

  it('perché dell\'errore (punto 3): scenario/intruso/correct lo leggono dall\'oggetto-opzione, allineato per indice', () => {
    const n = normalizzaPerRipasso({
      type: 'scenario', situation: 'Sei in comune.', question: 'Cosa fai?',
      options: [{ id: 1, text: 'A', correct: false, perche: 'Sembra plausibile ma...' }, { id: 2, text: 'B', correct: true }],
      explanation: 'B perché...',
    });
    expect(n?.perche).toEqual(['Sembra plausibile ma...', null]);
  });

  it('perché dell\'errore (punto 3): quiz_single e fillblank passano l\'array step.perche allineato alle options', () => {
    const nQ = normalizzaPerRipasso({ type: 'quiz_single', q: 'Quanti articoli?', options: ['100', '139', '200'], correct: 1, perche: [null, null, 'È un numero rotondo, ma sbagliato.'] });
    expect(nQ?.perche).toEqual([null, null, 'È un numero rotondo, ma sbagliato.']);

    const nF = normalizzaPerRipasso({ type: 'fillblank', text: 'La Costituzione ha ___ articoli', options: ['100', '139'], correct: 1, perche: ['Troppo tondo per essere vero.', null] });
    expect(nF?.perche).toEqual(['Troppo tondo per essere vero.', null]);
  });

  it('senza perché: il campo resta assente/vuoto, niente cambia', () => {
    const n = normalizzaPerRipasso({ type: 'quiz_single', q: 'Quanti articoli?', options: ['100', '139', '200'], correct: 1 });
    expect(n?.perche).toBeUndefined();
  });
});

describe('scegliDomandeRipasso — composizione 2+1 e scalata', () => {
  const t1 = (n: number) => Array.from({ length: n }, (_, i) => `sbagliata-${i}`);
  const t2 = (n: number) => Array.from({ length: n }, (_, i) => `fatico-${i}`);
  const t3 = (n: number) => Array.from({ length: n }, (_, i) => `gia-fatta-${i}`);

  it('con tutti i livelli pieni: due domande dal primo livello, una dal terzo — non tre dal primo', () => {
    const scelte = scegliDomandeRipasso({ tier1: t1(10), tier2: t2(10), tier3: t3(10) }, 3);
    expect(scelte).toHaveLength(3);
    const tiers = scelte.map((s) => s.tier).sort();
    expect(tiers).toEqual([1, 1, 3]);
  });

  it('livello 1 vuoto: si pesca dal secondo, poi dal terzo', () => {
    const scelte = scegliDomandeRipasso({ tier1: [], tier2: t2(10), tier3: t3(10) }, 3);
    expect(scelte).toHaveLength(3);
    expect(scelte.every((s) => s.tier !== 1)).toBe(true);
    // La ricetta chiede due "posti difficili" (normalmente livello 1) + un
    // posto "facile" (normalmente livello 3): scalando, i due difficili
    // vanno al livello 2 (il prossimo disponibile), il facile resta livello 3.
    expect(scelte.map((s) => s.tier).sort()).toEqual([2, 2, 3]);
  });

  it('livello 1 e 2 vuoti: tutte e tre dal terzo', () => {
    const scelte = scegliDomandeRipasso({ tier1: [], tier2: [], tier3: t3(10) }, 3);
    expect(scelte.map((s) => s.tier)).toEqual([3, 3, 3]);
  });

  it('livello 1 con una sola domanda disponibile: usa quella, il resto scala', () => {
    const scelte = scegliDomandeRipasso({ tier1: t1(1), tier2: t2(10), tier3: t3(10) }, 3);
    const tiers = scelte.map((s) => s.tier).sort();
    expect(tiers.filter((t) => t === 1)).toHaveLength(1);
    expect(scelte).toHaveLength(3);
  });

  it('nessun dato in nessun livello: nessuna domanda scelta (il chiamante gestisce il fallback)', () => {
    const scelte = scegliDomandeRipasso({ tier1: [], tier2: [], tier3: [] }, 3);
    expect(scelte).toHaveLength(0);
  });

  it('non ripropone la stessa domanda due volte nello stesso giro', () => {
    const scelte = scegliDomandeRipasso({ tier1: t1(2), tier2: [], tier3: t3(1) }, 3);
    const testi = scelte.map((s) => s.domanda);
    expect(new Set(testi).size).toBe(testi.length);
  });
});

describe('ordinaPerRipassoCompleto — la sessione Pro con TUTTE le domande sbagliate', () => {
  const domanda = (testo: string, quando: string): DomandaSbagliata => ({
    chiave: `k#${testo}`, lezioneId: '1-1', moduloId: 1,
    domanda: testo, opzioni: ['x', 'y'], correctIndex: 0, quando,
  });

  it('elenco vuoto: torna vuoto', () => {
    expect(ordinaPerRipassoCompleto([])).toEqual([]);
  });

  it('una sola domanda: torna quella, invariata', () => {
    const d = domanda('unica', '2024-01-01T00:00:00.000Z');
    expect(ordinaPerRipassoCompleto([d])).toEqual([d]);
  });

  it('ordina per quando crescente: la più vecchia per prima', () => {
    const vecchia = domanda('vecchia', '2024-01-01T00:00:00.000Z');
    const recente = domanda('recente', '2024-06-01T00:00:00.000Z');
    const mediaTra = domanda('media', '2024-03-01T00:00:00.000Z');
    const out = ordinaPerRipassoCompleto([recente, vecchia, mediaTra]);
    expect(out.map((d) => d.domanda)).toEqual(['vecchia', 'media', 'recente']);
  });

  it('elenco lungo: nessun troncamento, tutte le domande restano', () => {
    const lista = Array.from({ length: 40 }, (_, i) => domanda(`d${i}`, `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`));
    const out = ordinaPerRipassoCompleto(lista);
    expect(out).toHaveLength(40);
    expect(new Set(out.map((d) => d.domanda)).size).toBe(40);
  });
});

describe('fondiDomandeSbagliate — scarico iniziale: locale + server, mai una perdita', () => {
  const domanda = (chiave: string, quando: string): DomandaSbagliata => ({
    chiave, lezioneId: '1-1', moduloId: 1,
    domanda: chiave, opzioni: ['x', 'y'], correctIndex: 0, quando,
  });

  it('locale vuoto, server pieno: torna tutto il server (telefono appena reinstallato)', () => {
    const remote = [domanda('a', '2024-01-01T00:00:00.000Z'), domanda('b', '2024-01-02T00:00:00.000Z')];
    const out = fondiDomandeSbagliate([], remote);
    expect(out.map((d) => d.chiave).sort()).toEqual(['a', 'b']);
  });

  it('locale pieno, server vuoto: torna tutto il locale (mai perso)', () => {
    const locali = [domanda('a', '2024-01-01T00:00:00.000Z'), domanda('b', '2024-01-02T00:00:00.000Z')];
    const out = fondiDomandeSbagliate(locali, []);
    expect(out.map((d) => d.chiave).sort()).toEqual(['a', 'b']);
  });

  it('sovrapposizione con quando diverse: vince la più vecchia', () => {
    const locali = [domanda('a', '2024-06-01T00:00:00.000Z')];
    const remote = [domanda('a', '2024-01-01T00:00:00.000Z')];
    const out = fondiDomandeSbagliate(locali, remote);
    expect(out).toHaveLength(1);
    expect(out[0].quando).toBe('2024-01-01T00:00:00.000Z');
  });

  it('sovrapposizione, locale più vecchio del server: resta il locale', () => {
    const locali = [domanda('a', '2024-01-01T00:00:00.000Z')];
    const remote = [domanda('a', '2024-06-01T00:00:00.000Z')];
    const out = fondiDomandeSbagliate(locali, remote);
    expect(out).toHaveLength(1);
    expect(out[0].quando).toBe('2024-01-01T00:00:00.000Z');
  });

  it('liste identiche: nessun duplicato', () => {
    const d = domanda('a', '2024-01-01T00:00:00.000Z');
    const out = fondiDomandeSbagliate([d], [{ ...d }]);
    expect(out).toHaveLength(1);
  });

  it('entrambe vuote: torna vuoto', () => {
    expect(fondiDomandeSbagliate([], [])).toEqual([]);
  });

  it('livello e scadenza: se la domanda e sul telefono valgono quelli del telefono', () => {
    const locali = [{ ...domanda('a', '2024-06-01T00:00:00.000Z'), livello: 4, prossimaIl: '2026-10-20' }];
    const remote = [{ ...domanda('a', '2024-01-01T00:00:00.000Z'), livello: 2, prossimaIl: '2026-10-05' }];
    const out = fondiDomandeSbagliate(locali, remote);
    expect(out[0].quando).toBe('2024-01-01T00:00:00.000Z'); // la regola di sempre
    expect(out[0].livello).toBe(4);
    expect(out[0].prossimaIl).toBe('2026-10-20');
  });

  it('livello e scadenza: telefono nuovo, domanda solo sul server: valgono quelli del server', () => {
    const remote = [{ ...domanda('a', '2024-01-01T00:00:00.000Z'), livello: 3, prossimaIl: '2026-10-08' }];
    const out = fondiDomandeSbagliate([], remote);
    expect(out[0].livello).toBe(3);
    expect(out[0].prossimaIl).toBe('2026-10-08');
  });

  it('livello e scadenza: telefono senza (salvataggio vecchio), server con: valgono quelli del server', () => {
    const locali = [domanda('a', '2024-01-01T00:00:00.000Z')];
    const remote = [{ ...domanda('a', '2024-06-01T00:00:00.000Z'), livello: 5, prossimaIl: '2026-11-01' }];
    const out = fondiDomandeSbagliate(locali, remote);
    expect(out[0].livello).toBe(5);
    expect(out[0].prossimaIl).toBe('2026-11-01');
  });

  it('livello e scadenza: il server non li ha: livello 1 scaduto oggi', () => {
    const out = fondiDomandeSbagliate([], [domanda('a', '2024-01-01T00:00:00.000Z')]);
    expect(out[0].livello).toBe(1);
    expect(out[0].prossimaIl).toBe(giornoLocale());
  });

  it('nessuna sovrapposizione: unione delle due, nessuna persa', () => {
    const locali = [domanda('a', '2024-01-01T00:00:00.000Z')];
    const remote = [domanda('b', '2024-02-01T00:00:00.000Z')];
    const out = fondiDomandeSbagliate(locali, remote);
    expect(out.map((d) => d.chiave).sort()).toEqual(['a', 'b']);
  });
});
