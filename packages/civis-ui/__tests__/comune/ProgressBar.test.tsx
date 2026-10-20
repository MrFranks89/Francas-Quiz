import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ProgressBar } from '../../src/comune/ProgressBar';

// La barra anima con Animated.timing (480ms): timer finti per non lasciarlo
// scattare a test concluso (ambiente Jest smontato), come in graficoDifficolta.test.tsx.
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });

test('ProgressBar si disegna senza esplodere', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<ProgressBar current={3} total={10} />);
  });
  expect(renderer!.toJSON()).not.toBeNull();
});
