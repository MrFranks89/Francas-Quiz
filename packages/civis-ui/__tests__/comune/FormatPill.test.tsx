import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { FormatPill } from '../../src/comune/FormatPill';

test('FormatPill si disegna senza esplodere', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<FormatPill text="quiz" />);
  });
  expect(renderer!.toJSON()).not.toBeNull();
});
