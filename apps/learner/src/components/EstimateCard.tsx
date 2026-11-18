import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { GenerationConfig, GenerationEstimate } from '../api/generation';
import { blocchiStima, importoUsd } from '../state/generazione';
import { Notice, colors } from './ui';

export function getProviderBadge(provider?: string, dark = false) {
  const p = (provider ?? '').toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) {
    return dark
      ? { name: 'Anthropic Claude', bg: 'rgba(234,88,12,0.18)', border: 'rgba(251,146,60,0.4)', text: '#fdba74' }
      : { name: 'Anthropic Claude', bg: '#fbf4ee', border: '#e8d5c4', text: '#8e3e18' };
  }
  if (p.includes('openai') || p.includes('gpt')) {
    return dark
      ? { name: 'OpenAI', bg: 'rgba(16,185,129,0.18)', border: 'rgba(52,211,153,0.4)', text: '#6ee7b7' }
      : { name: 'OpenAI', bg: '#edf7f2', border: '#c3e6d3', text: '#0e704a' };
  }
  if (p.includes('gemini') || p.includes('google')) {
    return dark
      ? { name: 'Google Gemini', bg: 'rgba(59,130,246,0.18)', border: 'rgba(96,165,250,0.4)', text: '#93c5fd' }
      : { name: 'Google Gemini', bg: '#edf2fc', border: '#c7d7f7', text: '#1a56db' };
  }
  return {
    name: provider ? provider.toUpperCase() : 'AI Provider',
    bg: dark ? 'rgba(34,211,238,0.14)' : colors.pale,
    border: dark ? 'rgba(34,211,238,0.35)' : '#cde4e0',
    text: dark ? '#22d3ee' : colors.teal,
  };
}

export function EstimateCard({
  config,
  estimate,
  preventivo,
}: {
  config: GenerationConfig;
  estimate: GenerationEstimate | null;
  preventivo: { testo: string; bloccante: boolean };
}) {
  const C = usePalette(), { dark } = useTheme();
  const badge = getProviderBadge(estimate?.provider ?? config.provider, dark);
  const boxStyle = dark ? { backgroundColor: C.surfaceDark, borderColor: C.border } : null;
  const labelStyle = dark ? { color: C.textMuted } : null;
  const valStyle = dark ? { color: C.text } : null;
  const hintStyle = dark ? { color: C.lightText } : null;

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.name}</Text>
        </View>
        <Text style={[styles.model, dark && { color: C.lightText }]} numberOfLines={1}>
          {estimate?.model ?? 'Modello predefinito'}
        </Text>
        <View style={[styles.pill, dark && { backgroundColor: 'rgba(34,211,238,0.14)' }]}>
          <Text style={[styles.pillText, dark && { color: C.teal }]}>✓ Pronto</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={[styles.statBox, boxStyle]}>
          <Text style={[styles.statLabel, labelStyle]}>Costo massimo stimato</Text>
          <Text style={[styles.statValue, valStyle]}>
            {estimate?.maxCostUsd ? importoUsd(estimate.maxCostUsd) : 'In calcolo…'}
          </Text>
          <Text style={[styles.statHint, hintStyle]}>
            {estimate?.chunks ? `Fino a ${blocchiStima(estimate)}` : 'Stima garantita per il corso'}
          </Text>
        </View>

        <View style={[styles.statBox, boxStyle]}>
          <Text style={[styles.statLabel, labelStyle]}>Budget residuo</Text>
          <Text style={[styles.statValue, valStyle]}>
            {config.spending?.remainingUsd
              ? importoUsd(config.spending.remainingUsd)
              : 'Disponibile'}
          </Text>
          <Text style={[styles.statHint, hintStyle]}>
            {config.spending?.budgetUsd
              ? `su ${importoUsd(config.spending.budgetUsd)} totali`
              : 'Copre la generazione'}
          </Text>
        </View>
      </View>

      {preventivo.bloccante && !!estimate ? (
        <Notice text={preventivo.testo} error />
      ) : (
        <View style={styles.reassurance}>
          <Text style={[styles.reassuranceText, dark && { color: C.teal }]}>
            ✓ Costo massimo garantito prima dell’avvio. Bozza da revisionare prima dell’esame.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  model: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
    flex: 1,
  },
  pill: {
    backgroundColor: colors.pale,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.teal,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  statBox: {
    flex: 1,
    minWidth: 180,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
  },
  statHint: {
    fontSize: 12,
    color: colors.ink,
  },
  reassurance: {
    paddingTop: 4,
  },
  reassuranceText: {
    fontSize: 13,
    color: colors.teal,
    fontWeight: '500',
  },
});
