import { readFileSync } from 'node:fs';

// La conferma «Ho revisionato» vale solo se l'editor mostra tutto quello che
// l'allievo vedrà: ogni campo di presentazione dei tipi di domanda deve avere
// un campo nell'editor, e l'editor deve usare il componente che li disegna.
it('shows every question presentation field to the reviewer', () => {
  const screen = readFileSync(new URL('./EditorScreen.tsx', import.meta.url), 'utf8');
  expect(screen).toMatch(/<DomandaEditor /);
  expect(screen).toMatch(/erroriDomande\(course\)/);
  const editor = readFileSync(new URL('../components/DomandaEditor.tsx', import.meta.url), 'utf8');
  for (const campo of ['situation', 'sentence', 'wrong', 'rationale', 'difficulty', 'prompt', 'explanation', 'correctOptionId', 'correctOptionIds'])
    expect(editor).toContain(`'${campo}'`);
  for (const campo of ['situation', 'sentence', 'wrong', 'prompt', 'options', 'correctOptionIds']) expect(editor).toContain(`sotto('${campo}')`);
});
