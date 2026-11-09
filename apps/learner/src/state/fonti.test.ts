import { describe, expect, it } from 'vitest';
import { CourseSchema, type Course } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { etichettaFonti, fontiDellaSlide, type FonteSlide } from './fonti';

const course: Course = CourseSchema.parse(sample);
const f = (id: string, page: number | null, label = `Etichetta ${id}`): FonteSlide => ({
  id,
  page,
  label,
  excerpt: `Estratto ${id}`,
});

describe('fontiDellaSlide', () => {
  it('restituisce le fonti citate dalla slide, con etichetta, pagina ed estratto', () => {
    const slide = course.modules[0].lessons[0].slides[0];
    expect(fontiDellaSlide(course, slide)).toEqual([
      {
        id: 'source-1',
        label: 'Manuale di esempio, pagina 201',
        page: 201,
        excerpt: 'Il referente accoglie il nuovo collega e presenta il team.',
      },
    ]);
  });

  it("con più riferimenti le elenca tutte, nell'ordine della slide", () => {
    const doppio: Course = {
      ...course,
      sources: [
        ...course.sources,
        { id: 'source-2', documentId: 'd', page: 12, label: 'Altro', excerpt: 'Altro estratto' },
      ],
    };
    const slide = {
      ...course.modules[0].lessons[0].slides[0],
      sourceRefs: ['source-2', 'source-1'],
    };
    expect(fontiDellaSlide(doppio, slide).map((x) => x.id)).toEqual(['source-2', 'source-1']);
  });

  it('un riferimento sconosciuto è un errore, non una fonte che sparisce', () => {
    const slide = { ...course.modules[0].lessons[0].slides[0], sourceRefs: ['mancante'] };
    expect(() => fontiDellaSlide(course, slide)).toThrow('Fonte sconosciuta mancante');
  });
});

describe('etichettaFonti', () => {
  it('una fonte con pagina: «Fonte: pagina N»', () => {
    expect(etichettaFonti([f('a', 172)])).toBe('Fonte: pagina 172');
  });
  it('più fonti con pagina: «Fonti: pagine N, M»', () => {
    expect(etichettaFonti([f('a', 166), f('b', 172)])).toBe('Fonti: pagine 166, 172');
  });
  it('una fonte senza pagina usa la sua etichetta', () => {
    expect(etichettaFonti([f('a', null, 'Regolamento interno')])).toBe(
      'Fonte: Regolamento interno',
    );
    expect(etichettaFonti([f('a', 3), f('b', null, 'Allegato')])).toBe(
      'Fonti: pagina 3 · Allegato',
    );
  });
  it('nel corso dimostrativo dice che la fonte è dimostrativa', () => {
    expect(etichettaFonti([f('a', 201)], true)).toBe('Fonte dimostrativa: pagina 201');
    expect(etichettaFonti([f('a', 1), f('b', 2)], true)).toBe('Fonti dimostrative: pagine 1, 2');
  });
});
