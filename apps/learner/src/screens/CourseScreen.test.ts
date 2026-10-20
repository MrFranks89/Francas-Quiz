import { readFileSync } from 'node:fs';

// Il mescolamento serve solo se il lettore lo usa: le opzioni di un test non
// devono mai essere disegnate nell'ordine in cui sono state generate.
it('renders exam options through displayOptions, never in generated order', () => {
  const source = readFileSync(new URL('./CourseScreen.tsx', import.meta.url), 'utf8');
  expect(source).toMatch(/displayOptions\(course,exam\.id,attempts\.length,id\)\.map\(/);
  expect(source).not.toMatch(/\.options\.map\(/);
});
