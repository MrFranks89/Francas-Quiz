import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { EditorTabs, type TabItem } from './EditorTabs';

describe('EditorTabs', () => {
  const tabs: TabItem[] = [
    { id: 'panoramica', label: 'Panoramica' },
    { id: 'modulo-1', label: 'Modulo 1' },
    { id: 'domande', label: 'Domande & Quiz', badge: 10 },
    { id: 'tutto', label: 'Tutto' },
  ];

  test('renderizza tutte le schede e riflette quella attiva', () => {
    const onSelect = jest.fn();
    let albero!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      albero = ReactTestRenderer.create(
        <EditorTabs tabs={tabs} activeTab="modulo-1" onSelectTab={onSelect} />,
      );
    });

    const tabNodes = albero.root.findAll(
      (n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function',
    );
    expect(tabNodes).toHaveLength(4);

    const labels = tabNodes.map((p) => p.props.accessibilityLabel);
    expect(labels).toEqual([
      'Scheda Panoramica',
      'Scheda Modulo 1',
      'Scheda Domande & Quiz',
      'Scheda Tutto',
    ]);

    expect(tabNodes[1].props.accessibilityState.selected).toBe(true);
    expect(tabNodes[0].props.accessibilityState.selected).toBe(false);

    const badgeText = albero.root
      .findAllByType(Text)
      .find((t) => t.props.children === 10);
    expect(badgeText).toBeDefined();
  });

  test('seleziona una scheda quando premuta', () => {
    const onSelect = jest.fn();
    let albero!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      albero = ReactTestRenderer.create(
        <EditorTabs tabs={tabs} activeTab="panoramica" onSelectTab={onSelect} />,
      );
    });

    const tabDomande = albero.root
      .findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function')
      .find((p) => p.props.accessibilityLabel === 'Scheda Domande & Quiz')!;

    act(() => {
      tabDomande.props.onPress();
    });

    expect(onSelect).toHaveBeenCalledWith('domande');
  });
});
