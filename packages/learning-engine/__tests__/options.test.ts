import { readFileSync } from 'node:fs';
import { CourseSchema } from '@formazione/contracts';
import { displayOptions, seededOrder } from '@formazione/learning-engine';
const sample = () => CourseSchema.parse(JSON.parse(readFileSync(new URL('../../contracts/fixtures/sample-course.json', import.meta.url), 'utf8')));

it('scatters the correct answer even when generation always puts it first', () => {
  // 400 domande con la giusta sempre in posizione 0, come una generazione sbilanciata.
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 400; i++) {
    const shown = seededOrder(['giusta', 'b', 'c', 'd'], `course:1:exam:0:question-${i}`);
    counts[shown.indexOf('giusta')]++;
  }
  for (const c of counts) expect(c).toBeGreaterThan(60);
  for (const c of counts) expect(c).toBeLessThan(140);
});
it('keeps the same order for the same attempt and changes it across attempts', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  expect(seededOrder(items, 'x:1:exam-1:0:q')).toEqual(seededOrder(items, 'x:1:exam-1:0:q'));
  const orders = new Set(Array.from({ length: 20 }, (_, n) => seededOrder(items, `x:1:exam-1:${n}:q`).join()));
  expect(orders.size).toBeGreaterThan(5);
  expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
});
it('shows every option of the course question with its id, stable per attempt', () => {
  const course = sample();
  const first = displayOptions(course, 'exam-1', 0, 'question-1');
  expect(first).toEqual(displayOptions(course, 'exam-1', 0, 'question-1'));
  expect(first.map(o => o.id).sort()).toEqual(['option-1-a', 'option-1-b']);
  expect(first.every(o => course.questions[0].options.some(x => x.id === o.id && x.text === o.text))).toBe(true);
  expect(() => displayOptions(course, 'exam-1', 0, 'question-x')).toThrow('Unknown question');
});
it('vero/falso non si mescola: Vero sempre prima di Falso, in ogni tentativo', () => {
  const course = sample();
  const q = course.questions.find(q => q.kind === 'truefalse')!;
  for (let attempt = 0; attempt < 20; attempt++) {
    expect(displayOptions(course, 'exam-2', attempt, q.id).map(o => o.text)).toEqual(['Vero', 'Falso']);
  }
});
it('gli altri tipi si mescolano con lo stesso seme', () => {
  const course = sample();
  for (const kind of ['fillblank', 'scenario', 'oddOneOut', 'correctStatement'] as const) {
    const q = course.questions.find(q => q.kind === kind)!;
    const ordini = new Set(Array.from({ length: 20 }, (_, n) => displayOptions(course, 'exam-2', n, q.id).map(o => o.id).join()));
    expect(ordini.size).toBeGreaterThan(1);
  }
});
