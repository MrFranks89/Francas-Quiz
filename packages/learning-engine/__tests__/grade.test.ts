import { readFileSync } from 'node:fs';
import { CourseSchema } from '@formazione/contracts';
import { valutaTentativo, sogliaPredefinita, descriviValutazione, gradeQuestions } from '@formazione/learning-engine';

const scala = JSON.parse(readFileSync(new URL('../../contracts/fixtures/grading-scale.json', import.meta.url), 'utf8'));
// Esame con soglia predefinita (60%) su `total` domande.
const esito = (correct: number, total: number, passingScore = sogliaPredefinita(total)) =>
  valutaTentativo({ correct, total }, { passingScore });

it('la scala condivisa comincia dalla soglia di superamento', () => {
  expect(scala.sogliaSuperamentoPercento).toBe(60);
  expect(scala.giudizi[0].daPercento).toBe(scala.sogliaSuperamentoPercento);
});
it('soglia predefinita: il più piccolo k con k/n >= 60%, in aritmetica intera', () => {
  expect([1, 2, 3, 4, 5, 7, 10].map(sogliaPredefinita)).toEqual([1, 2, 2, 3, 3, 5, 6]);
});
it.each([
  [0, 5, false, 0, 'non superato'],
  [599, 1000, false, 59, 'non superato'],
  [3, 5, true, 60, 'discreto'],
  [699, 1000, true, 69, 'discreto'],
  [7, 10, true, 70, 'buono'],
  [5, 7, true, 71, 'buono'],
  [899, 1000, true, 89, 'distinto'],
  [9, 10, true, 90, 'ottimo'],
  [999, 1000, true, 99, 'ottimo'],
  [7, 7, true, 100, 'perfetto'],
  [4, 7, false, 57, 'non superato'],
])('%i/%i → superato=%s, %i%%, %s', (correct, total, superato, percentuale, giudizio) => {
  expect(esito(correct, total)).toEqual({ superato, percentuale, giudizio });
});
it('soglia dell’esame più alta del 60% non raggiunta: non superato anche se la scala darebbe un giudizio', () => {
  expect(esito(8, 10, 9)).toEqual({ superato: false, percentuale: 80, giudizio: 'non superato' });
  expect(esito(9, 10, 9)).toEqual({ superato: true, percentuale: 90, giudizio: 'ottimo' });
});
it('soglia dell’esame sotto il 60% raggiunta: superato senza giudizio della scala', () => {
  // Caso non coperto dalla scala decisa: segnalato, non inventato.
  expect(esito(1, 5, 1)).toEqual({ superato: true, percentuale: 20, giudizio: 'superato' });
});
it('descrive il risultato come «percentuale · Giudizio»', () => {
  expect(descriviValutazione(esito(5, 7))).toBe('71% · Buono');
  expect(descriviValutazione(esito(4, 7))).toBe('57% · Non superato');
  expect(descriviValutazione(esito(7, 7))).toBe('100% · Perfetto');
});

describe('correzione dei tipi di domanda', () => {
  it('ogni tipo si corregge per opzione, come la scelta singola', () => {
    const course = CourseSchema.parse(JSON.parse(readFileSync(new URL('../../contracts/fixtures/sample-course.json', import.meta.url), 'utf8')));
    const ids = course.modules[1].exam!.questionIds.filter(id => !['multiple', 'matching'].includes(course.questions.find(q => q.id === id)!.kind));
    const giuste = ids.map(id => ({ questionId: id, optionId: course.questions.find(q => q.id === id)!.correctOptionId! }));
    expect(gradeQuestions(course, ids, giuste)).toMatchObject({ correct: ids.length, total: ids.length });
    expect(ids.length).toBe(6);
    for (const id of ids) {
      const q = course.questions.find(q => q.id === id)!;
      const sbagliata = q.options.find(o => o.id !== q.correctOptionId)!;
      const risposte = giuste.map(a => a.questionId === id ? { questionId: id, optionId: sbagliata.id } : a);
      const esito = gradeQuestions(course, ids, risposte);
      expect(esito.correct).toBe(ids.length - 1);
      expect(esito.rows.find(r => r.questionId === id)!.correct).toBe(false);
    }
  });
});

describe('risposta multipla', () => {
  const course = CourseSchema.parse(JSON.parse(readFileSync(new URL('../../contracts/fixtures/sample-course.json', import.meta.url), 'utf8')));
  const q = course.questions.find(q => q.kind === 'multiple')!;
  const giuste = q.correctOptionIds!;
  const sbagliata = q.options.find(o => !giuste.includes(o.id))!.id;
  const voto = (optionIds: string[]) => gradeQuestions(course, [q.id], [{ questionId: q.id, optionIds }]).correct;
  it('tutto-o-niente: giusta solo con l\'insieme esatto, in qualunque ordine', () => {
    expect(voto([...giuste])).toBe(1);
    expect(voto([...giuste].reverse())).toBe(1);
    expect(voto(giuste.slice(1))).toBe(0);
    expect(voto([...giuste, sbagliata])).toBe(0);
    expect(voto([sbagliata])).toBe(0);
  });
  it('senza risposta conta come sbagliata e non come risposta', () => {
    expect(gradeQuestions(course, [q.id], [])).toMatchObject({ correct: 0, unanswered: 1 });
  });
  it('rifiuta forme sbagliate: elenco vuoto, duplicati, opzioni ignote, forma del tipo sbagliato', () => {
    expect(() => voto([])).toThrow();
    expect(() => voto([giuste[0], giuste[0]])).toThrow();
    expect(() => voto(['inventata'])).toThrow();
    expect(() => gradeQuestions(course, [q.id], [{ questionId: q.id, optionId: giuste[0] }])).toThrow('shape');
    const singola = course.questions.find(x => x.kind === 'single')!;
    expect(() => gradeQuestions(course, [singola.id], [{ questionId: singola.id, optionIds: [singola.correctOptionId!] }])).toThrow('shape');
  });
});

describe('accoppiamento', () => {
  const course = CourseSchema.parse(JSON.parse(readFileSync(new URL('../../contracts/fixtures/sample-course.json', import.meta.url), 'utf8')));
  const q = course.questions.find(q => q.kind === 'matching')!;
  // La risposta è ordinata per coppia: optionIds[k] è la definizione assegnata al termine k.
  const giuste = q.pairs!.map(p => p.rightOptionId);
  const voto = (optionIds: string[]) => gradeQuestions(course, [q.id], [{ questionId: q.id, optionIds }]).correct;
  it('tutto-o-niente: giusta solo se ogni termine ha la sua definizione', () => {
    expect(voto([...giuste])).toBe(1);
    const scambiate = [...giuste]; [scambiate[0], scambiate[1]] = [scambiate[1], scambiate[0]];
    expect(voto(scambiate)).toBe(0);
    expect(voto(giuste.slice(1))).toBe(0);
  });
  it('senza risposta conta come sbagliata e non come risposta', () => {
    expect(gradeQuestions(course, [q.id], [])).toMatchObject({ correct: 0, unanswered: 1 });
  });
  it('rifiuta forme sbagliate: elenco vuoto, duplicati, opzioni ignote, forma del tipo sbagliato', () => {
    expect(() => voto([])).toThrow();
    expect(() => voto([giuste[0], giuste[0], giuste[2]])).toThrow();
    expect(() => voto(giuste.map((_, k) => k === 0 ? 'inventata' : giuste[k]))).toThrow();
    expect(() => gradeQuestions(course, [q.id], [{ questionId: q.id, optionId: giuste[0] }])).toThrow('shape');
  });
});
