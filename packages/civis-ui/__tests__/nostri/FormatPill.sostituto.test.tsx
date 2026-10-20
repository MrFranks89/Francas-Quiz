/**
 * Test nostro: FormatPill (copia identica) con il sostituto di Emoji. Anche
 * quando riceve un'icona, la pillola mostra solo il testo in maiuscolo.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { FormatPill } from '../../src/comune/FormatPill';
import { Emoji } from '../../src/comune/Emoji';

test("con un'icona la pillola mostra solo il testo", () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<FormatPill icon="scenario" text="Quiz" />); });
  expect(view.root.findAllByType(Text).map(t => t.props.children)).toEqual(['QUIZ']);
});

test('il sostituto di Emoji non disegna nulla', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<Emoji emoji="scenario" />); });
  expect(view.toJSON()).toBeNull();
});
