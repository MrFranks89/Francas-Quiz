import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { AudioPicker } from './AudioPicker';
import { Button } from './ui';

describe('AudioPicker', () => {
  test('si renderizza correttamente con i pulsanti attesi', () => {
    const onPick = jest.fn();
    const onError = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AudioPicker onPick={onPick} onError={onError} />,
      );
    });

    const buttons = renderer.root.findAllByType(Button);
    expect(buttons.length).toBeGreaterThan(0);
  });

  test('segnala onError quando il permesso microfono viene negato', async () => {
    (requestRecordingPermissionsAsync as any).mockResolvedValueOnce({
      granted: false,
      status: 'denied',
      expires: 'never',
      canAskAgain: false,
    });
    const onPick = jest.fn();
    const onError = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AudioPicker onPick={onPick} onError={onError} />,
      );
    });

    const recordButton = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label.includes('Registra'));
    expect(recordButton).toBeDefined();

    await act(async () => {
      recordButton?.props.onPress();
    });

    expect(onError).toHaveBeenCalledWith('Permesso microfono non concesso.');
    expect(onPick).not.toHaveBeenCalled();
  });
});
