import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ConceptTree } from '@formazione/contracts';
import { fetchConceptTree } from '../api/generation';
import { Button, Notice, colors, styles } from './ui';
import { ConceptTreeViewer } from './ConceptTreeViewer';

export function ConceptTreeSection({
  extractionId,
  excludedPages,
  hasBlocks,
}: {
  extractionId: string;
  excludedPages: number[];
  hasBlocks: boolean;
}) {
  const [conceptTree, setConceptTree] = useState<ConceptTree | null>(null);
  const [conceptBusy, setConceptBusy] = useState(false);
  const [conceptError, setConceptError] = useState('');

  async function generateConceptTree() {
    setConceptBusy(true);
    setConceptError('');
    try {
      const tree = await fetchConceptTree(extractionId, excludedPages);
      setConceptTree(tree);
    } catch (e) {
      setConceptError(e instanceof Error ? e.message : 'Mappa concettuale non disponibile.');
    } finally {
      setConceptBusy(false);
    }
  }

  return (
    <View style={localStyles.conceptBox}>
      <Text style={localStyles.conceptTitle}>🌳 Mappa Concettuale (Stile Algor)</Text>
      <Text style={styles.muted}>
        Organizza automaticamente i concetti chiave estratti in un albero visivo per temi e
        sotto-concetti.
      </Text>
      <View style={styles.row}>
        <Button
          label={
            conceptBusy ? 'Generazione mappa in corso…' : "Genera Mappa Concettuale con l'AI"
          }
          disabled={conceptBusy || !hasBlocks}
          onPress={generateConceptTree}
        />
        {conceptBusy && <ActivityIndicator color={colors.teal} size="small" />}
      </View>
      {!!conceptError && <Notice text={conceptError} error />}
      {conceptTree && <ConceptTreeViewer tree={conceptTree} />}
    </View>
  );
}

const localStyles = StyleSheet.create({
  conceptBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  conceptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
});
