import type { Question } from '@formazione/contracts';
import {
  gestoriAccoppiamento,
  impostaScelta,
  type CoppieAttive,
  type RisposteInCorso,
} from './risposte';

const domanda = (kind: string, extra: object = {}) =>
  ({ id: 'q1', kind, ...extra }) as unknown as Question;

it('impostaScelta cambia solo la domanda toccata e conserva i riferimenti delle altre', () => {
  const prima: RisposteInCorso = { q1: ['a'], q2: ['x'] };
  const dopo = impostaScelta(prima, domanda('single'), 'b');
  expect(dopo.q1).toEqual(['b']);
  expect(dopo.q2).toBe(prima.q2);
  expect(prima.q1).toEqual(['a']);
});

it('nella risposta multipla ogni tocco aggiunge o toglie l’opzione', () => {
  const multipla = domanda('multiple');
  const uno = impostaScelta({ q1: ['a'] }, multipla, 'b');
  expect(uno.q1).toEqual(['a', 'b']);
  expect(impostaScelta(uno, multipla, 'a').q1).toEqual(['b']);
});

it('l’accoppiamento funziona con la sola fetta della propria domanda', () => {
  const q = domanda('matching', { id: 'm1', pairs: [{}, {}] });
  let risposte: RisposteInCorso = {};
  let coppie: CoppieAttive = {};
  const setR = (f: (c: RisposteInCorso) => RisposteInCorso) => {
    risposte = f(risposte);
  };
  const setC = (f: (c: CoppieAttive) => CoppieAttive) => {
    coppie = f(coppie);
  };
  gestoriAccoppiamento(q, {}, {}, setR, setC).onSelezionaCoppia(1);
  expect(coppie).toEqual({ m1: 1 });
  const g = gestoriAccoppiamento(q, { m1: [] }, { m1: 1 }, setR, setC);
  expect(g.coppiaAttiva).toBe(1);
  g.onAssegna('d2');
  expect(risposte.m1).toEqual([null, 'd2']);
  gestoriAccoppiamento(q, { m1: [] }, {}, setR, setC).onAssegna('d3');
  expect(risposte.m1).toEqual([null, 'd2']); // nessuna coppia attiva: non assegna
});
