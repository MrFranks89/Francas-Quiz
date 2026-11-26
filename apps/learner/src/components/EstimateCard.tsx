import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { GenerationConfig, GenerationEstimate } from '../api/generation';
import { blocchiStima } from '../state/generazione';
import { Notice, colors } from './ui';

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

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.header}>
        <View style={[styles.pill, dark && { backgroundColor: 'rgba(34,211,238,0.14)' }]}>
          <Text style={[styles.pillText, dark && { color: C.teal }]}>✓ Pronto</Text>
        </View>
        {!!estimate?.chunks && (
          <Text style={[styles.blocchiInfo, dark && { color: C.lightText }]}>
            Fino a {blocchiStima(estimate)}
          </Text>
        )}
      </View>

      {preventivo.bloccante && !!estimate ? (
        <Notice text={preventivo.testo} error />
      ) : (
        <View style={styles.reassurance}>
          <Text style={[styles.reassuranceText, dark && { color: C.teal }]}>
            ✓ Configurazione verificata. Il corso sarà salvato nel tuo profilo.
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
  pill: {
    backgroundColor: colors.pale,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.teal,
  },
  blocchiInfo: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  reassurance: {
    paddingTop: 2,
  },
  reassuranceText: {
    fontSize: 13,
    color: colors.teal,
    fontWeight: '500',
  },
});
