import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { GiochiScreen } from '../GiochiScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('GiochiScreen', () => {
  it('renderizza correttamente la card di gamification e il coach', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(<GiochiScreen />);
    });

    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts.some((t) => t.includes('Giochi & Ripasso Dinamico'))).toBe(true);
    expect(texts.some((t) => t.includes('Livello Padronanza:'))).toBe(true);
    expect(texts.some((t) => t.includes('Sopravvivenza'))).toBe(true);
    expect(texts.some((t) => t.includes('Esposizione Orale & Coach'))).toBe(true);
  });
});
