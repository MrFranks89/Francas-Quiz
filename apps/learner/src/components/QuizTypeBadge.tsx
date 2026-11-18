import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TipoDomanda } from '@formazione/contracts';
import { NOMI_TIPO } from '../state/editor';

interface TypeTheme {
  bg: string;
  text: string;
  border: string;
}

const TYPE_THEMES: Record<TipoDomanda, TypeTheme> = {
  single: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  truefalse: { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  fillblank: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  oddOneOut: { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  multiple: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  scenario: { bg: '#ccfbf1', text: '#115e59', border: '#99f6e4' },
  correctStatement: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  matching: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
};

export function QuizTypeBadge({
  kind,
  label,
}: {
  kind: TipoDomanda;
  label?: string;
}) {
  const theme = TYPE_THEMES[kind] ?? {
    bg: '#f1f5f9',
    text: '#334155',
    border: '#cbd5e1',
  };
  const text = label ?? NOMI_TIPO[kind] ?? kind;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Tipo: ${text}`}
      style={[
        styles.badge,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
