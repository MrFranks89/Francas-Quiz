import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { ChaptersSelector } from '../ChaptersSelector';
import type { DocumentChapter } from '../../api/documents';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('ChaptersSelector con albero e multi-selezione (Blocchi C e D)', () => {
  const mockChapters: DocumentChapter[] = [
    { title: 'Capitolo 1: Introduzione', fromPage: 1, toPage: 10, level: 1 },
    { title: '1.1 Contesto storico', fromPage: 1, toPage: 5, level: 2 },
    { title: '1.2 Obiettivi', fromPage: 6, toPage: 10, level: 2 },
    { title: 'Capitolo 2: Sviluppo', fromPage: 15, toPage: 25, level: 1 },
    { title: '2.1 Analisi', fromPage: 15, toPage: 20, level: 2 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('stato di default: sezioni figlie collassate, si espandono al tocco', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ChaptersSelector chapters={mockChapters} range={true} />,
      );
    });

    // Default collassato: le sezioni 1.1 e 1.2 non sono visibili
    let text = readAllText(renderer);
    expect(text).toContain('Capitolo 1: Introduzione');
    expect(text).not.toContain('1.1 Contesto storico');

    // Tocco su expand di Capitolo 1
    const expandBtn = renderer.root.findByProps({
      accessibilityLabel: 'Espandi sezioni di Capitolo 1: Introduzione',
    });
    act(() => {
      expandBtn.props.onPress();
    });

    // Ora le sezioni figlie sono visibili
    text = readAllText(renderer);
    expect(text).toContain('1.1 Contesto storico');
    expect(text).toContain('1.2 Obiettivi');

    // Tocco per collassare di nuovo
    const collapseBtn = renderer.root.findByProps({
      accessibilityLabel: 'Collassa sezioni di Capitolo 1: Introduzione',
    });
    act(() => {
      collapseBtn.props.onPress();
    });

    text = readAllText(renderer);
    expect(text).not.toContain('1.1 Contesto storico');
  });

  test('selezionando un capitolo padre seleziona anche i suoi figli ed emette intervalli', () => {
    const onSelectionChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ChaptersSelector
          chapters={mockChapters}
          range={true}
          onSelectionChange={onSelectionChange}
        />,
      );
    });

    const cap1Check = renderer.root.findByProps({
      accessibilityLabel: 'Seleziona Capitolo 1: Introduzione · pp. 1–10',
    });

    act(() => {
      cap1Check.props.onPress();
    });

    expect(onSelectionChange).toHaveBeenCalledWith([
      { fromPage: 1, toPage: 10 },
      { fromPage: 1, toPage: 5 },
      { fromPage: 6, toPage: 10 },
    ]);

    // Mostra la chip riassuntiva del capitolo
    const text = readAllText(renderer);
    expect(text).toContain('Capitolo 1: Introduzione · pp. 1–10');
  });

  test('selezione capitoli multipli non consecutivi (Cap. 1 + Cap. 2) genera chip e intervalli ranges', () => {
    const onSelectionChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ChaptersSelector
          chapters={mockChapters}
          range={true}
          onSelectionChange={onSelectionChange}
        />,
      );
    });

    const cap1 = renderer.root.findByProps({
      accessibilityLabel: 'Seleziona Capitolo 1: Introduzione · pp. 1–10',
    });
    const cap2 = renderer.root.findByProps({
      accessibilityLabel: 'Seleziona Capitolo 2: Sviluppo · pp. 15–25',
    });

    act(() => {
      cap1.props.onPress();
    });
    act(() => {
      cap2.props.onPress();
    });

    // Entrambi selezionati
    const text = readAllText(renderer);
    expect(text).toContain('Selezionati (2)');

    // Rimuovendo dalla chip
    const removeChipBtn = renderer.root.findByProps({
      accessibilityLabel: 'Rimuovi Capitolo 1: Introduzione · pp. 1–10',
    });
    act(() => {
      removeChipBtn.props.onPress();
    });

    const textAfter = readAllText(renderer);
    expect(textAfter).toContain('Selezionati (1)');
    expect(textAfter).toContain('Capitolo 2: Sviluppo · pp. 15–25');
  });
});
