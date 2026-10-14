import { statoLezione } from '../src/statoLezione';

const modulo = {
  lessons: [
    { id: 'm-1' },
    { id: 'm-2' },
    { id: 'm-3' },
    { id: 'm-p', isBonus: true },
  ],
};

test('una lezione completata non è mai bloccata dalla sequenza, anche se la precedente non lo è', () => {
  const stato = statoLezione(modulo, { id: 'm-2' }, new Set(['m-2']), 3);
  expect(stato.done).toBe(true);
  expect(stato.seqLocked).toBe(false);
  expect(stato.locked).toBe(false);
});

test('una lezione nuova inserita in testa, non completata, è sbloccata', () => {
  const stato = statoLezione(modulo, { id: 'm-1' }, new Set(), 3);
  expect(stato.seqLocked).toBe(false);
  expect(stato.locked).toBe(false);
});

test('inserendo una lezione in testa a un modulo già iniziato, le lezioni già completate restano aperte', () => {
  // Chi aveva completato m-2 ed m-3 prima che arrivasse m-1 non se le ritrova bloccate.
  const completate = new Set(['m-2', 'm-3']);
  expect(statoLezione(modulo, { id: 'm-2' }, completate, 3).locked).toBe(false);
  expect(statoLezione(modulo, { id: 'm-3' }, completate, 3).locked).toBe(false);
});

test('la prima lezione non completata dopo una completata è aperta, quelle dopo restano chiuse', () => {
  const completate = new Set(['m-1']);
  expect(statoLezione(modulo, { id: 'm-2' }, completate, 3).locked).toBe(false); // aperta: precede m-3, m-1 è fatta
  expect(statoLezione(modulo, { id: 'm-3' }, completate, 3).locked).toBe(true);  // chiusa: m-2 non è fatta
});

test('le vite a zero restano invariate: bloccano solo le lezioni non completate', () => {
  const completate = new Set(['m-1']);
  expect(statoLezione(modulo, { id: 'm-1' }, completate, 0).locked).toBe(false); // completata: rivedibile
  expect(statoLezione(modulo, { id: 'm-2' }, completate, 0).livesLocked).toBe(true);
  expect(statoLezione(modulo, { id: 'm-2' }, completate, 0).locked).toBe(true);
});

test('le pillole restano invariate: bloccate finché non sono complete tutte le lezioni regolari', () => {
  const tutteComplete = new Set(['m-1', 'm-2', 'm-3']);
  expect(statoLezione(modulo, { id: 'm-p', isBonus: true }, new Set(['m-1']), 3).locked).toBe(true);
  expect(statoLezione(modulo, { id: 'm-p', isBonus: true }, tutteComplete, 3).locked).toBe(false);
});
