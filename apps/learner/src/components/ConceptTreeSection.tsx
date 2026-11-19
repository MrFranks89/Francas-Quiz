import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ConceptNode, ConceptTree } from '@formazione/contracts';
import { fetchConceptTree } from '../api/generation';
import { Button, Notice, colors, useUiStyles } from './ui';
import { ConceptTreeViewer } from './ConceptTreeViewer';

export function ConceptTreeSection({
  extractionId,
  excludedPages,
  hasBlocks,
  onPracticeVoice,
  onPracticeQuiz,
}: {
  extractionId: string;
  excludedPages: number[];
  hasBlocks: boolean;
  onPracticeVoice?: (node: ConceptNode) => void;
  onPracticeQuiz?: (node: ConceptNode, branch: { id: string; title: string }, treeHash?: string) => void;
}) {
  const C = usePalette(), { dark } = useTheme(), s = useUiStyles();
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
    <View
      style={[
        localStyles.conceptBox,
        dark && { backgroundColor: C.surface, borderColor: C.border },
      ]}
    >
      <Text style={[localStyles.conceptTitle, dark && { color: C.text }]}>
        🌳 Mappa Concettuale
      </Text>
      <Text style={s.muted}>
        Organizza automaticamente i concetti chiave estratti in un albero visivo per temi e
        sotto-concetti. Clicca sui nodi per aprire la scheda di dettaglio.
      </Text>
      <View style={s.row}>
        <Button
          label={
            conceptBusy ? 'Generazione mappa in corso…' : "Genera Mappa Concettuale con l'AI"
          }
          disabled={conceptBusy || !hasBlocks}
          onPress={generateConceptTree}
        />
        {conceptBusy && <ActivityIndicator color={dark ? C.teal : colors.teal} size="small" />}
      </View>
      {!!conceptError && <Notice text={conceptError} error />}
      {conceptTree && conceptTree.complete === false && (
        <View style={localStyles.partialBanner}>
          <Notice text="⚠️ La mappa è parziale: alcuni blocchi non sono stati elaborati." />
          <Button
            label="Riprendi la mappa"
            disabled={conceptBusy}
            onPress={generateConceptTree}
          />
        </View>
      )}
      {conceptTree && (
        <ConceptTreeViewer
          tree={conceptTree}
          onPracticeVoice={onPracticeVoice}
          onPracticeQuiz={
            onPracticeQuiz
              ? (node, branch) => onPracticeQuiz(node, branch, conceptTree?.treeHash)
              : undefined
          }
        />
      )}
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
  partialBanner: {
    gap: 8,
  },
});
