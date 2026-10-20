/**
 * Test nostro su src/comune/FeedbackMotion.tsx (copia identica da Civis), che
 * in Civis non ha un test dedicato: con movimento ridotto non anima nulla; con
 * movimento attivo la risposta giusta "cresce" e quella sbagliata "scuote".
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Animated, Text } from 'react-native';
import { FeedbackMotion } from '../../src/comune/FeedbackMotion';
import { useReducedMotion } from '../../src/comune/useReducedMotion';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
  (useReducedMotion as jest.Mock).mockReturnValue(true);
});

function trasformazione(view: Renderer.ReactTestRenderer) {
  const style = [view.root.findByType(Animated.View).props.style].flat(Infinity).filter(Boolean);
  return style.find((s: any) => s.transform)?.transform;
}

test('disegna i figli', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<FeedbackMotion correct><Text>ok</Text></FeedbackMotion>); });
  expect(view.root.findByType(Text).props.children).toBe('ok');
});

test('una risposta giusta cresce, una sbagliata scuote', () => {
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  let giusta!: Renderer.ReactTestRenderer;
  let sbagliata!: Renderer.ReactTestRenderer;
  act(() => { giusta = Renderer.create(<FeedbackMotion correct><Text>a</Text></FeedbackMotion>); });
  act(() => { sbagliata = Renderer.create(<FeedbackMotion correct={false}><Text>b</Text></FeedbackMotion>); });
  expect(Object.keys(trasformazione(giusta)[0])).toEqual(['scale']);
  expect(Object.keys(trasformazione(sbagliata)[0])).toEqual(['translateX']);
});

test('spento, non trasforma nulla', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<FeedbackMotion active={false} correct><Text>x</Text></FeedbackMotion>); });
  expect(trasformazione(view)).toBeUndefined();
});
