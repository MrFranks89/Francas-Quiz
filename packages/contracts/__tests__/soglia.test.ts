import { readFileSync } from 'node:fs';
import { CourseSchema, erroreSogliaMinima, sogliaMinima } from '@formazione/contracts';
import scala from '../fixtures/grading-scale.json';

const sample = () => JSON.parse(readFileSync(new URL('../fixtures/sample-course.json', import.meta.url), 'utf8'));

/** Corso di esempio con n domande nell'esame del primo modulo e la soglia indicata. */
function conEsame(n: number, passingScore: number) {
  const course = sample();
  const module = course.modules[0];
  const base = course.questions.find((q: any) => q.id === module.exam.questionIds[0]);
  const extra = Array.from({ length: n - 1 }, (_, i) => ({ ...base, id: `${base.id}-extra-${i}` }));
  course.questions.push(...extra);
  module.lessons[0].questionIds.push(...extra.map(q => q.id));
  module.exam.questionIds = [base.id, ...extra.map(q => q.id)];
  module.exam.passingScore = passingScore;
  return course;
}

describe('soglia minima degli esami', () => {
  it('deriva dalla scala condivisa: ⌈60%·n⌉ in interi', () => {
    expect(scala.sogliaSuperamentoPercento).toBe(60);
    expect([1, 2, 3, 4, 5, 7, 10, 20].map(sogliaMinima)).toEqual([1, 2, 2, 3, 3, 5, 6, 12]);
  });

  it.each([
    [7, 4, false], [7, 5, true],
    [5, 2, false], [5, 3, true],
    [1, 1, true],
  ])('%i domande, soglia %i: accettata = %s', (n, soglia, accettata) => {
    const result = CourseSchema.safeParse(conEsame(n, soglia));
    expect(result.success).toBe(accettata);
    if (!result.success) expect(result.error.issues.map(i => i.message)).toContain(erroreSogliaMinima(soglia, n));
  });

  it('dà un messaggio leggibile in italiano, anche per valori non numerici', () => {
    expect(erroreSogliaMinima(4, 7)).toBe('La soglia minima è 5 risposte su 7 (60%)');
    expect(erroreSogliaMinima(0, 1)).toBe('La soglia minima è 1 risposta su 1 (60%)');
    expect(erroreSogliaMinima(Number.NaN, 7)).toBe('La soglia minima è 5 risposte su 7 (60%)');
    expect(erroreSogliaMinima(5, 7)).toBeNull();
  });

  it('il caso condiviso con il backend diventa valido alla soglia minima', () => {
    // Esclude che il caso di invalid-course-cases.json sia rifiutato per un motivo diverso dalla soglia.
    const base = new URL('../../../services/api/tests/fixtures/', import.meta.url);
    const fixture = JSON.parse(readFileSync(new URL('generated-course.json', base), 'utf8'));
    const cases = JSON.parse(readFileSync(new URL('invalid-course-cases.json', base), 'utf8')) as any[];
    const soglia = cases.find(c => c.changes?.some((ch: any) => ch.path.at(-1) === 'passingScore'));
    expect(soglia).toBeDefined();
    for (const ch of soglia.changes) {
      let target = fixture;
      for (const key of ch.path.slice(0, -1)) target = target[key];
      target[ch.path.at(-1)] = ch.value;
    }
    expect(CourseSchema.safeParse(fixture).success).toBe(false);
    fixture.modules[0].exam.passingScore = sogliaMinima(fixture.modules[0].exam.questionIds.length);
    expect(CourseSchema.safeParse(fixture).success).toBe(true);
  });
});
