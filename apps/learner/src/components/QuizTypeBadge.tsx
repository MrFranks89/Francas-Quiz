import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@formazione/civis-ui/src/ThemeProvider';
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

const DARK_THEMES: Record<TipoDomanda, TypeTheme> = {
  single: { bg: 'rgba(56,189,248,0.16)', text: '#7dd3fc', border: 'rgba(56,189,248,0.35)' },
  truefalse: { bg: 'rgba(167,139,250,0.16)', text: '#c4b5fd', border: 'rgba(167,139,250,0.35)' },
  fillblank: { bg: 'rgba(251,191,36,0.16)', text: '#fcd34d', border: 'rgba(251,191,36,0.35)' },
  oddOneOut: { bg: 'rgba(244,114,182,0.16)', text: '#f9a8d4', border: 'rgba(244,114,182,0.35)' },
  multiple: { bg: 'rgba(74,222,128,0.16)', text: '#86efac', border: 'rgba(74,222,128,0.35)' },
  scenario: { bg: 'rgba(45,212,191,0.16)', text: '#5eead4', border: 'rgba(45,212,191,0.35)' },
  correctStatement: { bg: 'rgba(248,113,113,0.16)', text: '#fca5a5', border: 'rgba(248,113,113,0.35)' },
  matching: { bg: 'rgba(129,140,248,0.16)', text: '#a5b4fc', border: 'rgba(129,140,248,0.35)' },
};

export function QuizTypeBadge({
  kind,
  label,
}: {
  kind: TipoDomanda;
  label?: string;
}) {
  const { dark } = useTheme();
  const map = dark ? DARK_THEMES : TYPE_THEMES;
  const theme = map[kind] ?? (dark
    ? { bg: 'rgba(255,255,255,0.08)', text: '#cbd5e1', border: 'rgba(255,255,255,0.16)' }
    : { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' });
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
