import { readFileSync } from 'node:fs';
// Import statico, non dinamico dentro la prova: caricare e trasformare il
// contratto (zod compreso) a freddo, con tutti i file di prova in parallelo,
// arrivava a 4,4 s misurati, a ridosso dei 5 s del limite per prova, e una
// volta lo ha superato. Un import in testa al file avviene mentre Vitest
// raccoglie le prove e non conta nel limite della singola prova.
import { TIPI_DOMANDA } from '@formazione/contracts';

// Il mescolamento serve solo se il lettore lo usa: le opzioni di un test non
// devono mai essere disegnate nell'ordine in cui sono state generate.
it('renders exam options through displayOptions, never in generated order', () => {
  const source = readFileSync(new URL('./CourseScreen.tsx', import.meta.url), 'utf8');
  expect(source).toMatch(/displayOptions\(course,exam\.id,attempts\.length,id\)\.map\(/);
  expect(source).not.toMatch(/\.options\.map\(/);
});

// Il giudizio serve solo se il lettore lo mostra: percentuale e giudizio vengono
// da valutaTentativo, non da un calcolo locale su last.passed o last.correct.
it('shows percentage and grade of the last attempt through valutaTentativo', () => {
  const source = readFileSync(new URL('./CourseScreen.tsx', import.meta.url), 'utf8');
  expect(source).toMatch(/descriviValutazione\(valutaTentativo\(last,exam\)\)/);
  expect(source).not.toMatch(/last\.passed\?/);
  expect(source).not.toMatch(/\*\s*100|\/\s*last\.total/);
});

// I tipi di domanda servono solo se il lettore li disegna: la domanda passa per
// presentazione() e la vista ha un caso per ogni tipo diverso dalla scelta singola.
it('presents every question kind through presentazione and a case in the exam view', () => {
  const source = readFileSync(new URL('./CourseScreen.tsx', import.meta.url), 'utf8');
  expect(source).toMatch(/domanda=\{presentazione\(q\)\}/);
  const vista = readFileSync(new URL('../components/ExamView.tsx', import.meta.url), 'utf8');
  for (const kind of TIPI_DOMANDA.filter(k => k !== 'single' && k !== 'oddOneOut')) expect(vista).toContain(`case '${kind}':`);
  expect(vista).toMatch(/<RiepilogoDomanda|export function RiepilogoDomanda/);
});
