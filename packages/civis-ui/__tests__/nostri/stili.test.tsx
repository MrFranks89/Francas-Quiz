/**
 * Test nostro su src/comune/stili.ts (copia identica da Civis), che in Civis
 * non ha un test dedicato: gli stili seguono la tavolozza attiva e ogni
 * tavolozza ha un solo foglio di stile.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT, ThemeProvider, useTheme } from '../../src/ThemeProvider';
import { C as DARK } from '../../src/tema';
import { s, stylesFor, useStyles } from '../../src/comune/stili';

beforeEach(() => { (AsyncStorage as any).__reset(); });

test('il foglio predefinito usa la tavolozza scura', () => {
  expect(s).toBe(stylesFor(DARK));
  expect(stylesFor(DARK)).toBe(stylesFor(DARK));
  expect(stylesFor(LIGHT)).not.toBe(stylesFor(DARK));
});

function Probe() {
  const st = useStyles();
  const { setMode } = useTheme();
  return <>
    <Text testID="testo" style={st.btnText}>x</Text>
    <TouchableOpacity testID="light" onPress={() => setMode('light')} />
  </>;
}

test('useStyles segue il tema scelto', async () => {
  let view!: Renderer.ReactTestRenderer;
  await act(async () => { view = Renderer.create(<ThemeProvider><Probe /></ThemeProvider>); });
  expect(view.root.findByProps({ testID: 'testo' }).props.style.color).toBe(DARK.text);
  await act(async () => { view.root.findByProps({ testID: 'light' }).props.onPress(); });
  expect(view.root.findByProps({ testID: 'testo' }).props.style.color).toBe(LIGHT.text);
  act(() => view.unmount());
});
