/**
 * Modalità esame, logica pura (src/esame/esame.ts): pesca delle domande dai
 * quiz, voto in decimi, tempo come funzione del tempo trascorso, errori nel
 * ripasso a livelli.
 */
import {
  raccogliDomandeQuiz, pescaDomande, votoInDecimi, formattaVoto, valutaEsame,
  tempoRimasto, tempoScaduto, formattaTempo, aggiungiErroriEsameAlRipasso,
  DURATA_ESAME_MS, NUM_DOMANDE_ESAME, DomandaEsame,
} from '../../src/esame/esame';

const quizQ = (testo: string) => ({ q: testo, options: [`${testo} giusta`, `${testo} x`, `${testo} y`], correct: 0, perche: [null, `Perché ${testo}`, null], difficulty: 'base' });
const quiz = (qs: string[], pool: string[] = []) => ({ type: 'quiz', heading: 'Quiz', pick: 3, questions: qs.map(quizQ), pool: pool.map(quizQ) });
const slide = { type: 'slide', heading: 'Slide', body: 'Testo' };
const scenario = { type: 'scenario', situation: 'S', question: 'Domanda scenario NON QUIZ', options: [{ id: 'a', text: 'a', correct: true }, { id: 'b', text: 'b', correct: false }] };

const MODULI: any[] = [
  { id: 1, title: 'Uno', lessons: [{ id: '1-1', steps: [slide, scenario, quiz(['u1', 'u2', 'u3'], ['u4', 'u5'])] }, { id: '1-2', steps: [quiz(['v1'], ['v2'])] }] },
  { id: 2, title: 'Due', lessons: [{ id: '2-1', steps: [quiz(['d1', 'd2'])] }] },
  { id: 3, title: 'Tre', lessons: [{ id: '3-1', steps: [slide, scenario] }] },
];
const grande = (n: number): any[] => [{ id: 9, title: 'Grande', lessons: [{ id: '9-1', steps: [quiz(Array.from({ length: n }, (_, i) => `g${i}`))] }] }];

describe('raccogliDomandeQuiz', () => {
  it('prende solo i quiz (questions + pool) dei moduli scelti, non gli altri tipi di step', () => {
    const r = raccogliDomandeQuiz(MODULI, [1]);
    expect(r.map((d) => d.q).sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'v1', 'v2']);
    expect(r.every((d) => d.moduloId === 1)).toBe(true);
    expect(r.find((d) => d.q === 'u4')).toMatchObject({ lezioneId: '1-1', stepIdx: 2, correct: 0 });
  });
  it('più moduli: l\'unione; modulo senza quiz: niente', () => {
    expect(raccogliDomandeQuiz(MODULI, [1, 2])).toHaveLength(9);
    expect(raccogliDomandeQuiz(MODULI, [3])).toEqual([]);
    expect(raccogliDomandeQuiz(MODULI, [])).toEqual([]);
  });
  it('lo stesso testo di domanda non compare due volte', () => {
    const dup: any[] = [{ id: 1, lessons: [{ id: 'a', steps: [quiz(['x', 'x'])] }, { id: 'b', steps: [quiz(['x', 'y'])] }] }];
    expect(raccogliDomandeQuiz(dup, [1]).map((d) => d.q).sort()).toEqual(['x', 'y']);
  });
  it('porta con sé il perché e scarta le domande malformate', () => {
    const rotto: any[] = [{ id: 1, lessons: [{ id: 'a', steps: [{ type: 'quiz', questions: [{ q: 'senza opzioni' }, quizQ('ok')] }] }] }];
    const r = raccogliDomandeQuiz(rotto, [1]);
    expect(r.map((d) => d.q)).toEqual(['ok']);
    expect(r[0].perche).toEqual([null, 'Perché ok', null]);
  });
});

describe('pescaDomande', () => {
  it('20 domande, tutte diverse, solo dai moduli scelti', () => {
    const banca = raccogliDomandeQuiz(grande(50), [9]);
    const p = pescaDomande(banca, NUM_DOMANDE_ESAME);
    expect(p).toHaveLength(20);
    expect(new Set(p.map((d) => d.id)).size).toBe(20);
    expect(p.every((d) => d.moduloId === 9)).toBe(true);
  });
  it('meno di 20 disponibili: si usano tutte, una volta sola', () => {
    const banca = raccogliDomandeQuiz(MODULI, [2]);
    const p = pescaDomande(banca);
    expect(p).toHaveLength(2);
    expect(p.map((d) => d.q).sort()).toEqual(['d1', 'd2']);
  });
  it('banca vuota: nessuna domanda', () => {
    expect(pescaDomande([])).toEqual([]);
  });
  it('le opzioni si rimescolano ma risposta giusta e perché restano allineati', () => {
    const banca = raccogliDomandeQuiz(grande(30), [9]);
    for (let k = 0; k < 20; k++) {
      for (const d of pescaDomande(banca)) {
        const base = d.q;
        expect(d.options[d.correct]).toBe(`${base} giusta`);
        d.options.forEach((o, i) => { if (o === `${base} x`) expect(d.perche?.[i]).toBe(`Perché ${base}`); });
      }
    }
  });
  it('con un rng fisso la pesca è deterministica; non modifica la banca', () => {
    const banca = raccogliDomandeQuiz(grande(30), [9]);
    const copia = JSON.stringify(banca);
    const rng = () => 0.3;
    expect(pescaDomande(banca, 20, rng).map((d) => d.id)).toEqual(pescaDomande(banca, 20, rng).map((d) => d.id));
    expect(JSON.stringify(banca)).toBe(copia);
  });
});

describe('voto in decimi', () => {
  it('una cifra decimale: 15/20 → 7,5; 20/20 → 10,0; 0/20 → 0,0', () => {
    expect(votoInDecimi(15, 20)).toBe(7.5);
    expect(votoInDecimi(20, 20)).toBe(10);
    expect(votoInDecimi(0, 20)).toBe(0);
    expect(formattaVoto(7.5)).toBe('7,5/10');
    expect(formattaVoto(10)).toBe('10,0/10');
    expect(formattaVoto(0)).toBe('0,0/10');
  });
  it('arrotonda a una cifra: 13/20 → 6,5; 7/9 → 7,8; 1/3 → 3,3', () => {
    expect(votoInDecimi(13, 20)).toBe(6.5);
    expect(votoInDecimi(7, 9)).toBe(7.8);
    expect(votoInDecimi(1, 3)).toBe(3.3);
  });
  it('con meno di 20 domande il voto è sul totale reale; totale 0 → 0', () => {
    expect(votoInDecimi(1, 2)).toBe(5);
    expect(votoInDecimi(0, 0)).toBe(0);
  });
});

const dom = (i: number, correct = 0): DomandaEsame => ({ id: `1-1#2#q${i}`, lezioneId: '1-1', stepIdx: 2, moduloId: 1, q: `q${i}`, options: ['a', 'b', 'c'], correct, explanation: `spiega ${i}` });

describe('valutaEsame', () => {
  it('giuste, sbagliate e senza risposta (queste contano come sbagliate)', () => {
    const e = valutaEsame([dom(1), dom(2), dom(3), dom(4)], [0, 1, null]);
    expect(e.corrette).toBe(1);
    expect(e.sbagliate).toBe(3);
    expect(e.senzaRisposta).toBe(2); // la terza null, la quarta mai data
    expect(e.totale).toBe(4);
    expect(e.voto).toBe(2.5);
    expect(e.righe.map((r) => r.scelta)).toEqual([0, 1, null, null]);
  });
});

describe('tempo: funzione del tempo trascorso', () => {
  it('20 minuti di durata predefinita', () => { expect(DURATA_ESAME_MS).toBe(1200000); });
  it('rimasto = durata - trascorso, mai negativo', () => {
    expect(tempoRimasto(1000, 1000)).toBe(DURATA_ESAME_MS);
    expect(tempoRimasto(1000, 1000 + 60000)).toBe(DURATA_ESAME_MS - 60000);
    expect(tempoRimasto(1000, 1000 + DURATA_ESAME_MS)).toBe(0);
    expect(tempoRimasto(1000, 1000 + DURATA_ESAME_MS + 5000)).toBe(0);
    expect(tempoRimasto(5000, 1000)).toBe(DURATA_ESAME_MS); // orologio indietro: non si allunga
  });
  it('scaduto esattamente a 20 minuti, non un millisecondo prima', () => {
    expect(tempoScaduto(0, DURATA_ESAME_MS - 1)).toBe(false);
    expect(tempoScaduto(0, DURATA_ESAME_MS)).toBe(true);
  });
  it('formattaTempo mm:ss, per eccesso', () => {
    expect(formattaTempo(DURATA_ESAME_MS)).toBe('20:00');
    expect(formattaTempo(DURATA_ESAME_MS - 1)).toBe('20:00');
    expect(formattaTempo(59001)).toBe('01:00');
    expect(formattaTempo(0)).toBe('00:00');
  });
});

describe('errori dell\'esame nel ripasso a livelli', () => {
  it('sbagliate e senza risposta entrano al livello 1 disponibili oggi; le giuste no', () => {
    const e = valutaEsame([dom(1), dom(2), dom(3)], [0, 2]);
    const lista = aggiungiErroriEsameAlRipasso([], e, new Date(2026, 9, 1, 12));
    expect(lista.map((d) => d.domanda).sort()).toEqual(['q2', 'q3']);
    expect(lista.every((d) => d.livello === 1 && d.prossimaIl === '2026-10-01')).toBe(true);
    expect(lista[0]).toMatchObject({ lezioneId: '1-1', moduloId: 1, correctIndex: 0 });
  });
  it('una domanda già nel ripasso a un livello alto, sbagliata all\'esame, torna al livello 1 senza doppioni', () => {
    const e = valutaEsame([dom(1)], [1]);
    const prima = aggiungiErroriEsameAlRipasso([], e, new Date(2026, 9, 1));
    const alta = prima.map((d) => ({ ...d, livello: 4, prossimaIl: '2026-10-20' }));
    const dopo = aggiungiErroriEsameAlRipasso(alta, e, new Date(2026, 9, 5));
    expect(dopo).toHaveLength(1);
    expect(dopo[0].livello).toBe(1);
  });
});
