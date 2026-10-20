import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DifficultyBadge } from '../../src/comune/DifficultyBadge';

test('DifficultyBadge non disegna nulla senza un livello riconosciuto', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<DifficultyBadge />);
  });
  expect(renderer!.toJSON()).toBeNull();
});

test('DifficultyBadge si disegna per un livello valido', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<DifficultyBadge level="medio" />);
  });
  expect(renderer!.toJSON()).not.toBeNull();
});
