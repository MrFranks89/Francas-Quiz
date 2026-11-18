import { existsSync, readFileSync } from 'node:fs';

function leggi(...percorsi: string[]) {
  const url = percorsi.map((p) => new URL(p, import.meta.url)).find((u) => existsSync(u));
  if (!url) throw new Error(`File non trovato: ${percorsi.join(' | ')}`);
  return readFileSync(url, 'utf8');
}

it('il guscio evita la tastiera una volta sola e rispetta la safe area', () => {
  const guscio = leggi('./components/Guscio.tsx');
  expect(guscio).toContain('KeyboardAvoidingView');
  expect(guscio).toContain('keyboardShouldPersistTaps="handled"');
  expect(guscio).toContain('useSafeAreaInsets');
  for (const schermata of ['ImportScreen', 'EditorScreen', 'SettingsScreen'])
    expect(leggi(`./screens/${schermata}.tsx`)).not.toContain('KeyboardAvoidingView');
});

it('App monta SafeAreaProvider, il Guscio e il tasto Indietro', () => {
  const app = leggi('../App.tsx', './App.tsx');
  expect(app).toContain('SafeAreaProvider');
  expect(app).toMatch(/<Guscio\s/);
  expect(app).toContain('useIndietro');
});

it('le risposte in corso vivono in SezioneEsame, non nel lettore', () => {
  const lettore = leggi('./screens/CourseScreen.tsx');
  expect(lettore).toMatch(/<SezioneEsame\s/);
  expect(lettore).not.toContain('setAnswers');
  expect(lettore).toContain('onTesti={nessunaLettura}');
  expect(leggi('./components/DomandaEsame.tsx')).toContain('memo(');
});
