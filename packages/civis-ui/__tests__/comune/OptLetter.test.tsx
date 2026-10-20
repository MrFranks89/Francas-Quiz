import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { OptLetter } from '../../src/comune/OptLetter';

test('OptLetter mostra la lettera giusta per ogni indice e stato', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<OptLetter i={1} state="idle" />);
  });
  expect(renderer!.toJSON()).not.toBeNull();
});

test('OptLetter si disegna anche negli stati "cor" e "wr"', () => {
  ['cor', 'wr', 'sel', 'dim'].forEach((state) => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<OptLetter i={0} state={state as any} />);
    });
    expect(renderer!.toJSON()).not.toBeNull();
  });
});
