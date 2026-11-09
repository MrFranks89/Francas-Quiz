import { CourseSchema } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import {
  bozzaBloccata,
  messaggioErrore,
  richiestaPubblicazione,
  richiestaSalvataggio,
  validaBozza,
} from './bozza';
import { changeField, strictPositive } from './editor';

const corso = CourseSchema.parse(sample);

it('bozzaBloccata: basta un errore di soglia o di domanda', () => {
  expect(bozzaBloccata({}, {})).toBe(false);
  expect(bozzaBloccata({ 1: 'La soglia minima è 5 risposte su 7 (60%)' }, {})).toBe(true);
  expect(bozzaBloccata({}, { 4: { situation: ['troppo corta'] } })).toBe(true);
});

describe('validaBozza', () => {
  it('restituisce il corso accettato dal contratto', () => {
    expect(validaBozza(corso)).toEqual(corso);
  });
  it('un corso rifiutato diventa un errore «Bozza non valida» con i motivi', () => {
    const rotto = changeField(corso, ['modules', 0, 'exam', 'maxAttempts'], strictPositive('abc'));
    expect(() => validaBozza(rotto)).toThrow(/^Bozza non valida: .+/);
  });
});

describe('richieste al server', () => {
  it('salvataggio: PUT sulla bozza con la revisione attesa e il corso', () => {
    expect(richiestaSalvataggio({ id: 'b1', revision: 3 }, corso)).toEqual({
      path: '/drafts/b1',
      method: 'PUT',
      body: { expectedRevision: 3, course: corso },
    });
  });
  it('pubblicazione: POST su publish con la conferma della revisione', () => {
    expect(richiestaPubblicazione({ id: 'b1', revision: 3 }, true)).toEqual({
      path: '/drafts/b1/publish',
      method: 'POST',
      body: { expectedRevision: 3, confirmReviewed: true },
    });
  });
  it('senza revisione la revisione attesa è 1', () => {
    expect(richiestaSalvataggio({ id: 'b1' }, corso).body.expectedRevision).toBe(1);
    expect(richiestaPubblicazione({ id: 'b1' }, false).body.expectedRevision).toBe(1);
  });
});

it('messaggioErrore: il messaggio di un Error, altrimenti quello predefinito', () => {
  expect(messaggioErrore(new Error('Conflitto'), 'Predefinito')).toBe('Conflitto');
  expect(messaggioErrore('stringa', 'Predefinito')).toBe('Predefinito');
  expect(messaggioErrore(undefined, 'Predefinito')).toBe('Predefinito');
});
