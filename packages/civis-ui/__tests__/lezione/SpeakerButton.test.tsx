import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { SpeakerButton } from '../../src/lezione/SpeakerButton';

jest.mock('../../src/speech', () => ({ useSpeech: () => ({ speaking: false, toggle: jest.fn() }) }));

test('il tocco lungo indica il nome vero delle impostazioni', () => {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let root: any;
  act(() => { root = ReactTestRenderer.create(<SpeakerButton testi={['x']} />); });
  const btn = root.root.find((n: any) => typeof n.props.onLongPress === 'function');
  act(() => { btn.props.onLongPress(); });
  const testo = spy.mock.calls[0][1] as string;
  expect(testo).toContain('Impostazioni del profilo');
  expect(testo).toContain('Lettura ad alta voce');
  spy.mockRestore();
});
