import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Platform, Text } from 'react-native';
import { UploadedDocCard } from '../UploadedDocCard';
import type { Document } from '../../api/documents';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('UploadedDocCard', () => {
  const doc: Document = {
    id: 'doc-123',
    name: 'test.pdf',
    kind: 'pdf',
    pageCount: 15,
  };
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('mostra nome, badge kind e conteggio pagine', () => {
    const onDelete = jest.fn(() => Promise.resolve());
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <UploadedDocCard document={doc} onDelete={onDelete} />,
      );
    });

    const text = readAllText(renderer);
    expect(text).toContain('pdf');
    expect(text).toContain('test.pdf');
    expect(text).toContain('15 pagine originali rilevate');
  });

  test('al tocco di elimina apre conferma e chiama onDelete se confermato', async () => {
    const onDelete = jest.fn(() => Promise.resolve());
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
      const deleteBtn = buttons?.find((b) => b.text === 'Elimina');
      deleteBtn?.onPress?.();
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <UploadedDocCard document={doc} onDelete={onDelete} />,
      );
    });

    if (isNative) {
      // Pattern nativo: prima si seleziona la card, poi compare il cestino.
      const card = renderer.root.findByProps({ testID: 'doc-card' });
      act(() => {
        card.props.onPress();
      });
    }

    const btn = renderer.root.findByProps({ testID: 'btn-delete-doc' });
    await act(async () => {
      btn.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('su nativo il cestino compare solo dopo la selezione della card', () => {
    if (!isNative) return;
    const onDelete = jest.fn(() => Promise.resolve());
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <UploadedDocCard document={doc} onDelete={onDelete} />,
      );
    });

    expect(renderer.root.findAllByProps({ testID: 'btn-delete-doc' })).toHaveLength(0);
    const card = renderer.root.findByProps({ testID: 'doc-card' });
    act(() => {
      card.props.onPress();
    });
    // RN 0.88 replica il testID su più nodi interni: conta l'esistenza, non il numero.
    expect(renderer.root.findAllByProps({ testID: 'btn-delete-doc' }).length).toBeGreaterThan(0);
    act(() => {
      card.props.onPress();
    });
    expect(renderer.root.findAllByProps({ testID: 'btn-delete-doc' })).toHaveLength(0);
  });
});
