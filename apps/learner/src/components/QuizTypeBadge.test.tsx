import React from 'react';
import { describe, expect, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { TIPI_DOMANDA, type TipoDomanda } from '@formazione/contracts';
import { NOMI_TIPO } from '../state/editor';
import { QuizTypeBadge } from './QuizTypeBadge';

describe('QuizTypeBadge', () => {
  test('renderizza correttamente tutti i 7 tipi di domanda con la loro etichetta', () => {
    for (const kind of TIPI_DOMANDA) {
      let albero!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        albero = ReactTestRenderer.create(<QuizTypeBadge kind={kind} />);
      });
      const badge = albero.root.findByType(View);
      expect(badge.props.accessibilityRole).toBe('text');
      expect(badge.props.accessibilityLabel).toBe(`Tipo: ${NOMI_TIPO[kind]}`);
      const text = albero.root.findByType(Text);
      expect(text.props.children).toBe(NOMI_TIPO[kind]);
    }
  });

  test('supporta etichetta personalizzata se fornita', () => {
    let albero!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      albero = ReactTestRenderer.create(
        <QuizTypeBadge kind="scenario" label="Caso applicato" />,
      );
    });
    const badge = albero.root.findByType(View);
    expect(badge.props.accessibilityLabel).toBe('Tipo: Caso applicato');
    const text = albero.root.findByType(Text);
    expect(text.props.children).toBe('Caso applicato');
  });
});
