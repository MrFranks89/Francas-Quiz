import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ConceptNode, Course } from '@formazione/contracts';
import { Button, Notice, colors } from './ui';
import { useBranchQuiz } from '../state/useBranchQuiz';
import { corsoDiPratica } from '../state/pratica';

export interface BranchQuizSheetProps {
  extractionId: string;
  branch: { id: string; title: string };
  node?: ConceptNode;
  treeHash?: string;
  onClose: () => void;
  onStartPractice: (course: Course) => void;
}

const QUESTION_OPTIONS = [3, 4, 5, 6];

// Codici di avviso del server tradotti per l'utente (microcopy ChatGPT, sezione A).
function descriviWarning(w: string): string {
  if (w === 'LOW_QUESTION_COUNT')
    return 'Alcune domande sono state escluse dai controlli di qualità.';
  if (w.startsWith('BLOCKS_TRUNCATED'))
    return 'Il quiz usa le 3 parti più rilevanti del ramo.';
  return w;
}

export function BranchQuizSheet({
  extractionId,
  branch,
  node,
  treeHash,
  onClose,
  onStartPractice,
}: BranchQuizSheetProps) {
  const C = usePalette(), { dark } = useTheme();
  const [questionCount, setQuestionCount] = useState<number>(4);
  const [estimating, setEstimating] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const {
    loading,
    error,
    estimateData,
    quizData,
    estimate,
    generate,
    cancel,
    resetError,
  } = useBranchQuiz();

  useEffect(() => {
    let active = true;
    setEstimating(true);
    resetError();
    estimate(extractionId, {
      branchId: branch.id,
      nodeId: node?.id ?? null,
      treeHash: treeHash ?? null,
      questionCount,
    }).finally(() => {
      if (active) setEstimating(false);
    });
    return () => {
      active = false;
    };
  }, [extractionId, branch.id, node?.id, treeHash, questionCount, estimate, resetError]);

  const handleGenerate = async () => {
    if (!treeHash) return;
    setIsGenerating(true);
    try {
      await generate(extractionId, {
        branchId: branch.id,
        nodeId: node?.id ?? null,
        treeHash,
        questionCount,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStart = () => {
    if (!quizData) return;
    onStartPractice(corsoDiPratica(quizData, branch.title));
  };

  const fitsBudget = estimateData ? estimateData.fitsBudget : true;
  const canGenerate = !estimating && !isGenerating && !loading && fitsBudget && !!treeHash;

  return (
    <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.teal }]}>
      <View style={[styles.headerRow, dark && { borderBottomColor: C.border }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.eyebrow, dark && { color: C.textMuted }]}>🎯 Quiz mirato sul ramo</Text>
          <Text style={[styles.title, dark && { color: C.text }]}>{branch.title}</Text>
          {node && <Text style={[styles.nodeSub, dark && { color: C.teal }]}>{`Concetto: ${node.title}`}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi pannello quiz"
          onPress={() => { cancel(); onClose(); }}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
        </Pressable>
      </View>

      {!quizData && !isGenerating && (
        <View style={styles.section}>
          <Text style={[styles.label, dark && { color: C.text }]}>Numero di domande:</Text>
          <View style={styles.pillsRow}>
            {QUESTION_OPTIONS.map((count) => {
              const sel = count === questionCount;
              return (
                <Pressable
                  key={count}
                  accessibilityRole="button"
                  accessibilityLabel={`${count} domande`}
                  onPress={() => setQuestionCount(count)}
                  style={[
                    styles.pill,
                    sel && styles.pillSelected,
                    dark && { backgroundColor: sel ? C.teal : C.surface, borderColor: sel ? C.teal : C.border },
                  ]}
                >
                  <Text style={[styles.pillText, sel && styles.pillTextSelected, dark && { color: sel ? '#ffffff' : C.text }]}>
                    {`${count} domande`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.estimateBox, dark && { backgroundColor: C.surface, borderColor: C.border }]}>
            {estimating ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={dark ? C.teal : colors.teal} />
                <Text style={[styles.estimateText, dark && { color: C.textMuted }]}>Calcolo preventivo in corso…</Text>
              </View>
            ) : estimateData ? (
              <View style={{ gap: 4 }}>
                <Text style={[styles.estimateTitle, dark && { color: C.text }]}>
                  {estimateData.expectedCostUsd === '0.0000' || estimateData.expectedCostUsd === '0'
                    ? 'Nessun costo previsto con il fornitore attuale.'
                    : `Costo massimo stimato: circa ${estimateData.maxCostUsd} $.`}
                </Text>
                <Text style={[styles.estimateDetails, dark && { color: C.textMuted }]}>
                  {`Budget residuo documento: $${estimateData.remainingBudgetUsd}`}
                </Text>
              </View>
            ) : null}
          </View>

          {estimateData && !estimateData.fitsBudget && (
            <Notice text="Il budget disponibile per questo documento non basta per generare il quiz." error />
          )}
          {!treeHash && (
            <Notice text="Genera prima la mappa concettuale: serve per collegare il quiz al ramo." />
          )}
          {error && <Notice text={error} error />}

          <View style={styles.actionRow}>
            <Button
              label="Genera il quiz"
              onPress={handleGenerate}
              disabled={!canGenerate}
            />
            <Button label="Annulla" secondary onPress={onClose} />
          </View>
        </View>
      )}

      {isGenerating && (
        <View style={styles.generatingBox}>
          <ActivityIndicator size="large" color={dark ? C.teal : colors.teal} />
          <Text style={[styles.generatingTitle, dark && { color: C.text }]}>
            Sto preparando le domande su questo ramo…
          </Text>
          <Text style={[styles.generatingSubtitle, dark && { color: C.textMuted }]}>
            I controlli di qualità e aderenza al testo sono in corso.
          </Text>
          <View style={{ marginTop: 10 }}>
            <Button label="Annulla" secondary onPress={() => { cancel(); setIsGenerating(false); }} />
          </View>
        </View>
      )}

      {quizData && (
        <View style={styles.section}>
          <View style={styles.readyHeader}>
            <Text style={[styles.readyBadge, dark && { color: C.teal }]}>Quiz pronto</Text>
            <Text style={[styles.readyTitle, dark && { color: C.text }]}>
              {`${quizData.questions.length} domande pronte`}
            </Text>
          </View>
          {quizData.cached && <Notice text="Il quiz è già pronto: non verrà addebitato un nuovo costo." />}
          {quizData.warnings && quizData.warnings.length > 0 && (
            <Notice text={quizData.warnings.map(descriviWarning).join(' · ')} />
          )}
          <View style={styles.actionRow}>
            <Button label="Inizia" onPress={handleStart} />
            <Button label="Chiudi" secondary onPress={onClose} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#087e83',
    padding: 16,
    marginVertical: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 10,
  },
  headerTitleWrap: { flex: 1, gap: 3, paddingRight: 8 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: '#087e83', letterSpacing: 0.6 },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  nodeSub: { fontSize: 13, fontWeight: '600', color: '#0e7490' },
  closeBtn: { padding: 6, borderRadius: 8 },
  closeBtnText: { fontSize: 16, color: '#64748b', fontWeight: '600' },
  section: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  pillSelected: { backgroundColor: '#087e83', borderColor: '#087e83' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  pillTextSelected: { color: '#ffffff' },
  estimateBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  estimateTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  estimateDetails: { fontSize: 12, color: '#64748b' },
  estimateText: { fontSize: 13, color: '#475569' },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 },
  generatingBox: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  generatingTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  generatingSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center' },
  readyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readyBadge: { fontSize: 12, fontWeight: '800', color: '#087e83' },
  readyTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
});
