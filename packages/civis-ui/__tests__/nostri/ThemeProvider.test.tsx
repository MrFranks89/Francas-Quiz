/**
 * Test nostro su src/ThemeProvider.tsx (copia identica da Civis).
 *
 * Il test originale (CivicaApp/__tests__/ThemeProvider.test.tsx, db9ff48) non
 * è portabile identico: importa `authPalette` e `StarLogo` da src/auth/ui, cioè
 * il logo di Civis e le schermate di accesso, che qui non si portano. Questo
 * file riprende alla lettera i suoi casi che non li usano: risoluzione del
 * tema di sistema, cambio e salvataggio, preferenza predefinita, corsa tra
 * scelta e caricamento, contrasti della tavolozza chiara e degli stili. Restano
 * fuori il caso di StarLogo e le coppie di `authPalette`.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT, THEME_STORAGE_KEY, ThemeProvider, resolveTheme, useTheme } from '../../src/ThemeProvider';
import { createStyles } from '../../src/comune/stili';
import { contrastRatio } from '../../src/comune/contrast';

function Probe() {
  const { C, mode, setMode } = useTheme();
  return <>
    <Text testID="mode">{mode}</Text>
    <Text testID="background">{C.bg}</Text>
    <TouchableOpacity testID="light" onPress={() => setMode('light')} />
    <TouchableOpacity testID="dark" onPress={() => setMode('dark')} />
  </>;
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  (AsyncStorage as any).__reset();
  jest.clearAllMocks();
});

test('system resolves to the active system palette and explicit choices win', () => {
  expect(resolveTheme('system', 'light')).toBe('light');
  expect(resolveTheme('system', 'dark')).toBe('dark');
  expect(resolveTheme('light', 'dark')).toBe('light');
  expect(resolveTheme('dark', 'light')).toBe('dark');
});

test('switches mode immediately and persists the selection', async () => {
  let view!: Renderer.ReactTestRenderer;
  await act(async () => { view = Renderer.create(<ThemeProvider><Probe /></ThemeProvider>); await flush(); });
  await act(async () => { view.root.findByProps({ testID: 'light' }).props.onPress(); await flush(); });
  expect(view.root.findByProps({ testID: 'mode' }).props.children).toBe('light');
  expect(view.root.findByProps({ testID: 'background' }).props.children).toBe(LIGHT.bg);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  act(() => view.unmount());
});

test('defaults new users to dark while restoring every saved preference', async () => {
  let view!: Renderer.ReactTestRenderer;
  await act(async () => { view = Renderer.create(<ThemeProvider><Probe /></ThemeProvider>); await flush(); });
  expect(view.root.findByProps({ testID: 'mode' }).props.children).toBe('dark');
  act(() => view.unmount());

  for (const preference of ['light', 'dark', 'system'] as const) {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
    await act(async () => { view = Renderer.create(<ThemeProvider><Probe /></ThemeProvider>); await flush(); });
    expect(view.root.findByProps({ testID: 'mode' }).props.children).toBe(preference);
    act(() => view.unmount());
    (AsyncStorage as any).__reset();
  }
});

test('a late persisted value cannot overwrite a choice made during loading', async () => {
  let resolveStored!: (value: string | null) => void;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveStored = resolve; }));
  let view!: Renderer.ReactTestRenderer;
  await act(async () => { view = Renderer.create(<ThemeProvider><Probe /></ThemeProvider>); });
  await act(async () => { view.root.findByProps({ testID: 'dark' }).props.onPress(); });
  await act(async () => { resolveStored('light'); await flush(); });
  expect(view.root.findByProps({ testID: 'mode' }).props.children).toBe('dark');
  act(() => view.unmount());
});

test('light semantic text pairs meet WCAG AA and shared disabled surfaces retain contrast', () => {
  for (const [background, foreground] of [
    [LIGHT.bg, LIGHT.textMuted], [LIGHT.bg, LIGHT.textDim], [LIGHT.bg, LIGHT.lightText],
    [LIGHT.surface, LIGHT.textMuted], [LIGHT.surface, LIGHT.textDim], [LIGHT.surface, LIGHT.lightText],
  ]) expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);

  const styles = createStyles(LIGHT);
  expect(contrastRatio(styles.btnDisabled.backgroundColor, styles.btnText.color)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(LIGHT.bg, styles.progressPct.color)).toBeGreaterThanOrEqual(4.5);
});
