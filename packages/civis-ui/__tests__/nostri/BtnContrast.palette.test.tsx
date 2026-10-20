/**
 * Test nostro, al posto di CivicaApp/__tests__/comune/BtnContrast.test.tsx,
 * che non si porta perché prende i colori anche dai pacchetti di figurine
 * (src/stickers). Stessa verifica sul pulsante disegnato davvero (sfondo del
 * TouchableOpacity contro colore del testo, soglia WCAG AA 4,5:1), ma sui
 * colori delle due palette che il lettore usa: scura (src/tema.ts) e chiara
 * (LIGHT in src/ThemeProvider.tsx), con il pulsante principale colorato,
 * quello secondario e quello disabilitato, ciascuno nel tema in cui compare.
 */
import React, { useEffect } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Btn } from '../../src/comune/Btn';
import { EmojiText } from '../../src/icons/AppIcon';
import { C as DARK } from '../../src/tema';
import { LIGHT, ThemeProvider, ThemeMode, useTheme } from '../../src/ThemeProvider';
import { contrastRatio } from '../../src/comune/contrast';

const opachi = (p: Record<string, string>) => [...new Set(Object.values(p).filter(c => /^#[0-9a-f]{6}$/i.test(c)))];

function Modo({ mode }: { mode: ThemeMode }) {
  const { setMode } = useTheme();
  useEffect(() => { setMode(mode); }, [mode]);
  return null;
}

function contrastoDi(mode: 'light' | 'dark', props: { color?: string; primary?: boolean; disabled?: boolean }) {
  let view!: Renderer.ReactTestRenderer;
  act(() => {
    view = Renderer.create(
      <ThemeProvider>
        <Modo mode={mode} />
        <Btn label="Continua" onPress={() => {}} {...props} />
      </ThemeProvider>,
    );
  });
  const button = view.root.findByType(TouchableOpacity);
  const bg = StyleSheet.flatten(button.props.style).backgroundColor as string;
  const fg = StyleSheet.flatten(view.root.findByType(EmojiText).props.style).color as string;
  const ratio = contrastRatio(bg, fg);
  act(() => view.unmount());
  return { bg, ratio };
}

describe.each([
  ['scura', 'dark' as const, DARK],
  ['chiara', 'light' as const, LIGHT],
])('palette %s', (_nome, mode, palette) => {
  test.each(opachi(palette))('pulsante principale colorato %s: contrasto >= 4,5', color => {
    const { bg, ratio } = contrastoDi(mode, { primary: true, color });
    expect(bg).toBe(color);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('pulsante secondario sullo sfondo del tema: contrasto >= 4,5', () => {
    const { bg, ratio } = contrastoDi(mode, {});
    expect(bg).toBe(palette.bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('pulsante disabilitato: contrasto >= 4,5', () => {
    const { bg, ratio } = contrastoDi(mode, { primary: true, color: palette.green, disabled: true });
    expect(bg).toBe(palette.slate);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
