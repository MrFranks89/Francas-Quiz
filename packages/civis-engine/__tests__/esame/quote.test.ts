/**
 * Modalità esame: dimensioni (numero e tempo), quote per modulo, pesca per
 * modulo con ridistribuzione (src/esame/esame.ts).
 */
import {
  DIMENSIONI_ESAME, DIMENSIONE_PREDEFINITA, NUM_DOMANDE_ESAME, DURATA_ESAME_MS,
  durataEsameMs, quoteEque, pescaDomandePerModulo, tempoScaduto, DomandaEsame,
} from '../../src/esame/esame';

const dom = (moduloId: number, n: number): DomandaEsame => ({
  id: `${moduloId}-1#0#d${n}`, lezioneId: `${moduloId}-1`, stepIdx: 0, moduloId,
  q: `m${moduloId} d${n}`, options: ['a', 'b', 'c'], correct: 0,
});
const banca = (moduloId: number, quante: number) => Array.from({ length: quante }, (_, i) => dom(moduloId, i));
const somma = (o: Record<number, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const perModulo = (lista: DomandaEsame[]) => lista.reduce((acc: Record<number, number>, d) => { acc[d.moduloId] = (acc[d.moduloId] || 0) + 1; return acc; }, {});

describe("dimensioni dell'esame", () => {
  it('per ogni voce i minuti corrispondono alle domande (un minuto a domanda)', () => {
    expect(DIMENSIONI_ESAME.map((d) => d.domande)).toEqual([10, 20, 30]);
    for (const d of DIMENSIONI_ESAME) {
      expect(d.minuti).toBe(d.domande);
      expect(durataEsameMs(d.domande)).toBe(d.minuti * 60000);
    }
  });
  it('le costanti esportate sono quelle della dimensione predefinita (20/20)', () => {
    expect(DIMENSIONE_PREDEFINITA).toEqual({ domande: 20, minuti: 20 });
    expect(NUM_DOMANDE_ESAME).toBe(20);
    expect(DURATA_ESAME_MS).toBe(20 * 60000);
  });
  it("l'esame da 10 dura 10 minuti: scaduto a 10:01, non a 9:59", () => {
    const d = durataEsameMs(10);
    expect(tempoScaduto(0, 9 * 60000 + 59000, d)).toBe(false);
    expect(tempoScaduto(0, 10 * 60000 + 1000, d)).toBe(true);
  });
});

describe('quoteEque', () => {
  it('20 su 3 moduli dà 7/7/6', () => {
    const q = quoteEque([1, 2, 3], 20);
    expect([q[1], q[2], q[3]]).toEqual([7, 7, 6]);
  });
  it('la somma fa sempre il totale', () => {
    for (const totale of [10, 20, 30]) {
      for (let n = 1; n <= 12; n++) {
        const ids = Array.from({ length: n }, (_, i) => i + 1);
        expect(somma(quoteEque(ids, totale))).toBe(totale);
      }
    }
  });
  it('nessun modulo: nessuna quota', () => { expect(quoteEque([], 20)).toEqual({}); });
});

describe('pescaDomandePerModulo', () => {
  it('rispetta le quote', () => {
    const p = pescaDomandePerModulo({ 1: banca(1, 30), 2: banca(2, 30), 3: banca(3, 30) }, { 1: 5, 2: 10, 3: 5 });
    expect(p).toHaveLength(20);
    expect(perModulo(p)).toEqual({ 1: 5, 2: 10, 3: 5 });
  });
  it('un modulo povero: prende quelle che ha e il resto va agli altri, il totale resta', () => {
    const p = pescaDomandePerModulo({ 1: banca(1, 2), 2: banca(2, 30), 3: banca(3, 30) }, { 1: 7, 2: 7, 3: 6 });
    expect(p).toHaveLength(20);
    const per = perModulo(p);
    expect(per[1]).toBe(2);
    expect(per[2] + per[3]).toBe(18);
  });
  it('un modulo vuoto e un altro con poche: ridistribuisce fino al limite di ciascuno', () => {
    const p = pescaDomandePerModulo({ 1: banca(1, 0), 2: banca(2, 8), 3: banca(3, 20) }, { 1: 10, 2: 5, 3: 5 });
    expect(p).toHaveLength(20);
    expect(perModulo(p)).toEqual({ 2: 8, 3: 12 });
  });
  it('se in totale non bastano, torna tutte quelle che ci sono', () => {
    const p = pescaDomandePerModulo({ 1: banca(1, 3), 2: banca(2, 4) }, { 1: 10, 2: 10 });
    expect(p).toHaveLength(7);
    expect(perModulo(p)).toEqual({ 1: 3, 2: 4 });
  });
  it('nessuna domanda duplicata, con rng iniettato', () => {
    let x = 0.3;
    const rng = () => { x = (x * 9301 + 49297) % 233280 / 233280; return x; };
    const p = pescaDomandePerModulo({ 1: banca(1, 6), 2: banca(2, 6) }, { 1: 6, 2: 9 }, rng);
    expect(p).toHaveLength(12);
    expect(new Set(p.map((d) => d.id)).size).toBe(p.length);
  });
});
