/**
 * Test nostro: dimostra che Jest, con il preset di React Native, disegna un
 * componente React Native dentro questo pacchetto.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';

test('Jest disegna un componente React Native', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<View><Text>ciao</Text></View>);
  });
  expect(renderer!.root.findByType(Text).props.children).toBe('ciao');
});
