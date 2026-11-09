import { describe, expect, it } from 'vitest';
import { CourseSchema } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { slidePerCivis, type Slide } from './slide';

const base: Slide = {
  id: 's1',
  heading: 'Titolo',
  body: 'Corpo della slide.',
  highlight: 'In evidenza',
  sourceRefs: ['src-1'],
};

describe('slidePerCivis', () => {
  it('porta titolo, corpo ed evidenza nei campi di SlideStep, senza emoji', () => {
    expect(slidePerCivis(base)).toEqual({
      heading: 'Titolo',
      body: 'Corpo della slide.',
      highlight: 'In evidenza',
    });
  });

  // SlideStep disegna sempre il riquadro: vuoto resterebbe un riquadro senza testo.
  it('con evidenza vuota mette il corpo nel riquadro e non ripete il testo', () => {
    expect(slidePerCivis({ ...base, highlight: '' })).toEqual({
      heading: 'Titolo',
      body: '',
      highlight: 'Corpo della slide.',
    });
    expect(slidePerCivis({ ...base, highlight: '   ' })).toEqual({
      heading: 'Titolo',
      body: '',
      highlight: 'Corpo della slide.',
    });
  });

  it('il riquadro non è mai vuoto per nessuna slide del corso dimostrativo', () => {
    const course = CourseSchema.parse(sample);
    for (const slide of course.modules.flatMap((m) => m.lessons.flatMap((l) => l.slides)))
      expect(slidePerCivis(slide).highlight.trim()).not.toBe('');
  });

  it("toglie gli spazi ai bordi dell'evidenza", () => {
    expect(slidePerCivis({ ...base, highlight: '  Punto chiave ' }).highlight).toBe('Punto chiave');
  });
});
