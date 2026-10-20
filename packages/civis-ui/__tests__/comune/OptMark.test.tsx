import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { OptMark } from '../../src/comune/OptMark';

test('OptMark non disegna nulla se lo stato è "idle"', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<OptMark state="idle" />);
  });
  expect(renderer!.toJSON()).toBeNull();
});

test('OptMark disegna la spunta quando lo stato è "cor"', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<OptMark state="cor" />);
  });
  expect(renderer!.toJSON()).not.toBeNull();
});
