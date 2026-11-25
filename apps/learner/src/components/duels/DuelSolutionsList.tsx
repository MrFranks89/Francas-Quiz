import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type SoluzioneDomanda } from '@formazione/contracts';
import { DUELS_MICROCOPY } from './microcopy';

interface DuelSolutionsListProps {
  soluzioni: SoluzioneDomanda[];
  dark: boolean;
  C: any;
}

export function DuelSolutionsList({
  soluzioni,
  dark,
  C,
}: DuelSolutionsListProps) {
  if (!soluzioni || soluzioni.length === 0) return null;

  return (
    <View style={styles.solutionsSection}>
      <Text style={[styles.solutionsHeading, dark && { color: C.text }]}>
        {DUELS_MICROCOPY['result.solutionsTitle']}
      </Text>
      <View style={styles.solutionsList}>
        {soluzioni.map((sol, sIdx) => (
          <View
            key={sol.domanda_id}
            style={[styles.solCard, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
          >
            <Text style={[styles.solNumber, dark && { color: C.textMuted }]}>
              Domanda #{sIdx + 1}
            </Text>
            <Text style={[styles.solAnswer, { color: '#059669' }]}>
              Risposta esatta: Opzione {sol.corretta !== undefined ? String.fromCharCode(65 + sol.corretta) : '-'}
            </Text>
            {sol.spiegazione && (
              <Text style={[styles.solExplanation, dark && { color: C.text }]}>
                {sol.spiegazione}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  solutionsSection: {
    marginTop: 8,
    gap: 8,
  },
  solutionsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  solutionsList: {
    gap: 8,
  },
  solCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 4,
  },
  solNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  solAnswer: {
    fontSize: 13,
    fontWeight: '600',
  },
  solExplanation: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 16,
  },
});
