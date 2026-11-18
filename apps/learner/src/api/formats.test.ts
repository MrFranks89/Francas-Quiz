import { FORMATI_AMMESSI, tipiSelettore } from './formats';
const fogli = /xlsx|csv|spreadsheet|excel|ms-excel|comma-separated/i;
it('il selettore non propone fogli di calcolo, né sul web né su dispositivo', () => {
  for (const web of [true, false]) {
    const tipi = tipiSelettore(web);
    expect(tipi.filter((t) => fogli.test(t))).toEqual([]);
    expect(tipi).not.toContain('*/*');
    expect(tipi.some((t) => t.startsWith('text/') && t.endsWith('*'))).toBe(false);
  }
  expect(FORMATI_AMMESSI).not.toMatch(fogli);
});
it('il selettore propone ancora PDF, DOCX, TXT, Markdown e immagini JPG/PNG', () => {
  expect(tipiSelettore(true)).toEqual(
    expect.arrayContaining([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/jpeg',
      'image/png',
      '.pdf',
      '.docx',
      '.txt',
      '.md',
      '.jpg',
      '.jpeg',
      '.png',
    ]),
  );
  expect(tipiSelettore(false).every((t) => t.includes('/'))).toBe(true);
});
