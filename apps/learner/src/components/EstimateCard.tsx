import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GenerationConfig, GenerationEstimate } from '../api/generation';
import { importoUsd } from '../state/generazione';
import { Notice, colors } from './ui';

export function getProviderBadge(provider?: string) {
  const p = (provider ?? '').toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) {
    return { name: 'Anthropic Claude', bg: '#fbf4ee', border: '#e8d5c4', text: '#8e3e18' };
  }
  if (p.includes('openai') || p.includes('gpt')) {
    return { name: 'OpenAI', bg: '#edf7f2', border: '#c3e6d3', text: '#0e704a' };
  }
  if (p.includes('gemini') || p.includes('google')) {
    return { name: 'Google Gemini', bg: '#edf2fc', border: '#c7d7f7', text: '#1a56db' };
  }
  return {
    name: provider ? provider.toUpperCase() : 'AI Provider',
    bg: colors.pale,
    border: '#cde4e0',
    text: colors.teal,
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
  const badge = getProviderBadge(estimate?.provider ?? config.provider);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.name}</Text>
        </View>
        <Text style={styles.model} numberOfLines={1}>
          {estimate?.model ?? 'Modello predefinito'}
        </Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>✓ Pronto</Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Costo massimo stimato</Text>
          <Text style={styles.statValue}>
            {estimate?.maxCostUsd ? importoUsd(estimate.maxCostUsd) : 'In calcolo…'}
          </Text>
          <Text style={styles.statHint}>
            {estimate?.chunks
              ? `Fino a ${estimate.chunks === 1 ? '1 blocco' : `${estimate.chunks} blocchi`}`
              : 'Stima garantita per il corso'}
          </Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Budget residuo</Text>
          <Text style={styles.statValue}>
            {config.spending?.remainingUsd
              ? importoUsd(config.spending.remainingUsd)
              : 'Disponibile'}
          </Text>
          <Text style={styles.statHint}>
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
          <Text style={styles.reassuranceText}>
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
