/**
 * Test nostro su src/lezione/util.ts (copia): Civis non ha un test dedicato.
 * Fissa optState, che il lettore usa per colorare le opzioni del test e del
 * riepilogo, e toOptions/shuffleArray, che restano disponibili.
 */
import { optState, shuffleArray, toOptions } from '../../src/lezione/util';

test('optState prima della conferma: selezionata o neutra, senza rivelare nulla', () => {
  expect(optState(false, true, true)).toBe('sel');
  expect(optState(false, true, false)).toBe('sel');
  expect(optState(false, false, true)).toBe('idle');
  expect(optState(false, false, false)).toBe('idle');
});

test('optState dopo la conferma: giusta verde, scelta sbagliata rossa, altre spente', () => {
  expect(optState(true, true, true)).toBe('cor');
  expect(optState(true, false, true)).toBe('cor');
  expect(optState(true, true, false)).toBe('wr');
  expect(optState(true, false, false)).toBe('dim');
});

test('toOptions porta con sé la correttezza; shuffleArray non perde elementi', () => {
  expect(toOptions(['a', 'b'], 1)).toEqual([
    { text: 'a', correct: false, perche: null },
    { text: 'b', correct: true, perche: null },
  ]);
  expect([...shuffleArray([1, 2, 3])].sort()).toEqual([1, 2, 3]);
});
