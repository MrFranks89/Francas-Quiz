import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SettingsScreen } from '../SettingsScreen';
import { Btn } from '@formazione/civis-ui/src/comune/Btn';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('SettingsScreen (Rilievo 7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('mostra tema e preferenze e nessuna menzione di API, chiavi o provider AI', () => {
    const onChiudi = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<SettingsScreen onChiudi={onChiudi} />);
    });

    const text = readAllText(renderer);
    expect(text).toContain('Impostazioni');
    expect(text).toContain("Preferenze dell'applicazione");
    expect(text).toContain('Aspetto e tema');
    expect(text).toContain("Tema dell'interfaccia");

    // Verifica assenza di menzioni API / provider
    expect(text).not.toContain('Groq');
    expect(text).not.toContain('OpenAI');
    expect(text).not.toContain('Chiave API');
    expect(text).not.toContain('Fornitore AI');

    // Chiusura schermata
    const backBtn = renderer.root.findAllByType(Btn).find((b) => b.props.label === 'Torna ai materiali');
    expect(backBtn).toBeDefined();
    act(() => {
      backBtn?.props.onPress();
    });
    expect(onChiudi).toHaveBeenCalledTimes(1);
  });
});
