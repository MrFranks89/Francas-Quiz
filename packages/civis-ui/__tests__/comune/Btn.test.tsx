import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { Btn } from '../../src/comune/Btn';

test('Btn chiama onPress quando non disabilitato', () => {
  const onPress = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<Btn onPress={onPress} label="Continua" />);
  });
  act(() => { renderer!.root.findByType(TouchableOpacity).props.onPress(); });
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('Btn disabilitato: onPress non è chiamabile', () => {
  const onPress = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<Btn onPress={onPress} label="Continua" disabled />);
  });
  expect(renderer!.root.findByType(TouchableOpacity).props.onPress).toBeUndefined();
});
