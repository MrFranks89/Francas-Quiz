import React from 'react';
import { describe, expect, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';
import { extractDocument, type Extraction } from '../api/documents';
import {
  ProposedIndexPanel,
  buildProposedSections,
  extractTopic,
  formatPageRange,
} from './ProposedIndexPanel';

const mockExtraction: Extraction = {
  id: 'ext-123',
  status: 'ready',
  engine: 'native',
  warnings: [],
  blocks: [
    {
      id: 'b-1',
      label: 'Blocco 1',
      page: 4,
      text: 'Numeri e Alfabeto greco\nQuesto capitolo illustra le basi dei numeri e le lettere greche.',
    },
    {
      id: 'b-2',
      label: 'Blocco 2',
      page: 4,
      text: 'Le lettere greche sono ampiamente utilizzate nelle formule scientifiche.',
    },
    {
      id: 'b-3',
      label: 'Blocco 3',
      page: 5,
      text: 'Geometria euclidea e assiomi fondamentali della fisica moderna.',
    },
  ],
};

describe('ProposedIndexPanel helper functions', () => {
  test('estrae il titolo significativo (topic) dalla prima riga pulita', () => {
    expect(extractTopic('## 1. Numeri e Alfabeto greco\nAltro testo', 'Default')).toBe(
      'Numeri e Alfabeto greco',
    );
    expect(extractTopic('Semplice riga di testo', 'Default')).toBe('Semplice riga di testo');
    expect(extractTopic('', 'Fallback')).toBe('Fallback');
  });

  test('formatta correttamente gli intervalli di pagina', () => {
    expect(formatPageRange([])).toBe('Senza pagina');
    expect(formatPageRange([4])).toBe('Pagina 4');
    expect(formatPageRange([1, 2, 3])).toBe('Pagine 1–3');
  });

  test('raggruppa blocchi per pagina in sezioni didattiche strutturate', () => {
    const sections = buildProposedSections(mockExtraction.blocks);
    expect(sections).toHaveLength(2);

    expect(sections[0].index).toBe(1);
    expect(sections[0].pageRangeLabel).toBe('Pagina 4');
    expect(sections[0].topic).toBe('Numeri e Alfabeto greco');
    expect(sections[0].title).toBe('Sezione 1 · Pagina 4 — Numeri e Alfabeto greco');
    expect(sections[0].blocksCount).toBe(2);
    expect(sections[0].pages).toEqual([4]);
    expect(sections[0].preview).toContain('Numeri e Alfabeto greco');

    expect(sections[1].index).toBe(2);
    expect(sections[1].pageRangeLabel).toBe('Pagina 5');
    expect(sections[1].topic).toBe('Geometria euclidea e assiomi fondamentali della fisica moderna.');
    expect(sections[1].blocksCount).toBe(1);
  });

  test('raggruppa blocchi senza pagina raggruppandoli in chunk logici', () => {
    const blocksWithoutPage = [
      { id: '1', label: 'Intro', page: null, text: 'Introduzione ai principi' },
      { id: '2', label: 'Capitolo', page: null, text: 'Dettagli operativi' },
    ];
    const sections = buildProposedSections(blocksWithoutPage);
    expect(sections).toHaveLength(1);
    expect(sections[0].pageRangeLabel).toBe('Senza pagina');
    expect(sections[0].title).toBe('Sezione 1 — Introduzione ai principi');
  });
});

describe('ProposedIndexPanel component', () => {
  test('mostra il riepilogo in alto con conteggio sezioni e le card didattiche', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ProposedIndexPanel extraction={mockExtraction} />);
    });

    const allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    const flattenedTexts = allTexts.flat().join(' ');

    expect(flattenedTexts).toContain('📚 Indice didattico proposto · 2 sezioni individuate');
    expect(flattenedTexts).toContain('2 pagine coperte');
    expect(flattenedTexts).toContain('3 blocchi totali');
    expect(flattenedTexts).toContain('Sezione 1 · Pagina 4 — Numeri e Alfabeto greco');
  });

  test('consente di espandere i singoli blocchi inclusi nella sezione', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ProposedIndexPanel extraction={mockExtraction} />);
    });

    const expandBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Mostra blocchi sezione 1' })[0];
    expect(expandBtn).toBeDefined();

    act(() => {
      expandBtn.props.onPress();
    });

    const allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    const flattenedTexts = allTexts.flat().join(' ');

    expect(flattenedTexts).toContain('Blocco 1 · p. 4');
    expect(flattenedTexts).toContain('Blocco 2 · p. 4');
    expect(flattenedTexts).toContain('▲ Nascondi blocchi inclusi');
  });

  test('permette di alternare tra vista Indice e vista Testo integrale delle fonti', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ProposedIndexPanel extraction={mockExtraction} />);
    });

    const sourcesTab = renderer.root
      .findAllByProps({ accessibilityLabel: 'Vista testo integrale' })[0];
    expect(sourcesTab).toBeDefined();

    act(() => {
      sourcesTab.props.onPress();
    });

    let allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    let flattened = allTexts.flat().join(' ');

    expect(flattened).toContain('Blocco 1 · pagina 4');
    expect(flattened).toContain('Blocco 2 · pagina 4');
    expect(flattened).toContain('Blocco 3 · pagina 5');

    const indexTab = renderer.root
      .findAllByProps({ accessibilityLabel: 'Vista indice strutturato' })[0];
    expect(indexTab).toBeDefined();

    act(() => {
      indexTab.props.onPress();
    });

    allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    flattened = allTexts.flat().join(' ');
    expect(flattened).toContain('Sezione 1 · Pagina 4 — Numeri e Alfabeto greco');
  });

  test('gestisce il caso di estrazione senza blocchi', () => {
    const emptyExtraction: Extraction = {
      ...mockExtraction,
      blocks: [],
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ProposedIndexPanel extraction={emptyExtraction} />);
    });

    const allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children);
    const flattened = allTexts.flat().join(' ');
    expect(flattened).toContain('0 sezioni individuate');
    expect(flattened).toContain('Nessun blocco di testo rilevato nelle pagine selezionate.');
  });
});
