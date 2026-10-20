import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { Card } from '../../src/comune/Card';

test('Card si disegna con i suoi children', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Card><Text>contenuto</Text></Card>);
  });
  expect(renderer!.root.findByType(Text).props.children).toBe('contenuto');
});
