/**
 * Test nostro sul sostituto src/comune/OptMark.tsx: le parole al posto della
 * spunta e della croce di Civis. Il test originale di OptMark (in
 * __tests__/comune, identico) verifica solo che disegni o no qualcosa.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { OptMark } from '../../src/comune/OptMark';
import { C } from '../../src/tema';

function disegna(state: 'cor' | 'wr' | 'idle' | 'sel' | 'dim') {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<OptMark state={state} />); });
  return view;
}

test('giusta e sbagliata sono parole nei colori di Civis', () => {
  const giusta = disegna('cor').root.findByType(Text);
  expect(giusta.props.children).toBe('Giusta');
  expect(giusta.props.style.color).toBe(C.greenText);
  const sbagliata = disegna('wr').root.findByType(Text);
  expect(sbagliata.props.children).toBe('Sbagliata');
  expect(sbagliata.props.style.color).toBe(C.redText);
});

test('negli altri stati non disegna nulla', () => {
  for (const state of ['idle', 'sel', 'dim'] as const) expect(disegna(state).toJSON()).toBeNull();
});
