/**
 * Test nostro su src/comune/useReducedMotion.ts (copia identica da Civis),
 * che in Civis non ha un test dedicato. jest.setup.js lo sostituisce con un
 * finto per tutti gli altri test; qui si prova il modulo vero.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Text } from 'react-native';

const { useReducedMotion } = jest.requireActual('../../src/comune/useReducedMotion');

function Probe() {
  return <Text>{String(useReducedMotion())}</Text>;
}

afterEach(() => { jest.restoreAllMocks(); });

test('parte senza movimento e poi legge la preferenza del sistema', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<Probe />); });
  expect(view.root.findByType(Text).props.children).toBe('true');
  await act(async () => { await Promise.resolve(); });
  expect(view.root.findByType(Text).props.children).toBe('false');
  act(() => view.unmount());
});

test('segue i cambi della preferenza e smette di ascoltare quando sparisce', async () => {
  let listener!: (value: boolean) => void;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (value: boolean) => void) => {
    listener = handler;
    return { remove };
  }) as any);
  let view!: Renderer.ReactTestRenderer;
  await act(async () => { view = Renderer.create(<Probe />); await Promise.resolve(); });
  expect(view.root.findByType(Text).props.children).toBe('false');
  act(() => listener(true));
  expect(view.root.findByType(Text).props.children).toBe('true');
  act(() => view.unmount());
  expect(remove).toHaveBeenCalled();
});
