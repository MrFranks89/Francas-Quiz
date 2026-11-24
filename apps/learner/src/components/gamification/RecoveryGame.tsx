import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { GameQuestion } from './types';

export interface RecoveryGameProps {
  errors: GameQuestion[];
  onRecoverQuestion: (questionId: string, xpGained: number) => void;
  onClose: () => void;
}

export function RecoveryGame({
  errors,
  onRecoverQuestion,
  onClose,
}: RecoveryGameProps) {
  const C = usePalette(), { dark } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [recoveredCount, setRecoveredCount] = useState(0);

  if (!errors || errors.length === 0) {
    return (
      <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={styles.emptyIcon}>🌟</Text>
        <Text style={[styles.title, dark && { color: C.text }]}>Nessun Errore da Recuperare!</Text>
        <Text style={[styles.desc, dark && { color: C.textMuted }]}>
          Complimenti! Hai risposto correttamente a tutte le domande delle verifiche precedenti o hai già recuperato tutti i concetti deboli.
        </Text>
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi Recupero Errori"
            onPress={onClose}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Torna alla panoramica</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentQ = errors[currentIdx % errors.length];

  function handleSelect(optId: string) {
    if (showFeedback) return;
    setSelectedOpt(optId);
    setShowFeedback(true);

    const isCorrect = optId === currentQ.correctOptionId;
    if (isCorrect) {
      setRecoveredCount((c) => c + 1);
      onRecoverQuestion(currentQ.id, 25);
    }
  }

  function handleNext() {
    setSelectedOpt(null);
    setShowFeedback(false);
    if (errors.length <= 1) {
      // Era l'ultimo errore rimasto
      return;
    }
    setCurrentIdx((i) => i % (errors.length - 1));
  }

  const isCorrect = selectedOpt === currentQ.correctOptionId;

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, dark && { color: C.text }]}>🩹 Recupero Concetti Deboli</Text>
          <Text style={[styles.desc, dark && { color: C.textMuted }]}>
            {`Domanda ${currentIdx + 1} di ${errors.length} da recuperare`}
          </Text>
        </View>
        <View style={styles.badgeBox}>
          <Text style={styles.badgeText}>{`+25 XP a correzione`}</Text>
        </View>
      </View>

      {/* Domanda */}
      <View style={[styles.questionBox, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={[styles.questionPrompt, dark && { color: C.text }]}>{currentQ.prompt}</Text>

        <View style={styles.optionsList}>
          {currentQ.options.map((opt) => {
            const isChosen = selectedOpt === opt.id;
            const isRight = opt.id === currentQ.correctOptionId;

            let optStyle = styles.optionItem;
            if (showFeedback) {
              if (isRight) optStyle = { ...optStyle, ...styles.optionCorrect };
              else if (isChosen) optStyle = { ...optStyle, ...styles.optionWrong };
            } else if (isChosen) {
              optStyle = { ...optStyle, ...styles.optionSelected };
            }

            return (
              <Pressable
                key={opt.id}
                accessibilityRole="button"
                accessibilityLabel={opt.text}
                disabled={showFeedback}
                onPress={() => handleSelect(opt.id)}
                style={[optStyle, dark && !showFeedback && { backgroundColor: C.surfaceDark, borderColor: C.border }]}
              >
                <Text
                  style={[
                    styles.optionText,
                    dark && { color: C.text },
                    showFeedback && isRight && { color: '#065f46', fontWeight: '800' },
                    showFeedback && isChosen && !isRight && { color: '#991b1b', fontWeight: '800' },
                  ]}
                >
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showFeedback && currentQ.explanation && (
          <View style={[styles.explanationBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
            <Text style={[styles.explanationTitle, dark && { color: C.indigoLight }]}>💡 Spiegazione:</Text>
            <Text style={[styles.explanationText, dark && { color: C.text }]}>{currentQ.explanation}</Text>
          </View>
        )}
      </View>

      {/* Feedback e pulsante continua */}
      {showFeedback && (
        <View style={styles.feedbackContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continua recupero"
            onPress={handleNext}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>
              {isCorrect ? 'Concetto superato! Continua →' : 'Riprova più avanti →'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi Recupero"
          onPress={onClose}
          style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
        >
          <Text style={[styles.secondaryBtnText, dark && { color: C.textMuted }]}>Chiudi</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    gap: 14,
    marginTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  desc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  badgeBox: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  emptyIcon: {
    fontSize: 36,
    textAlign: 'center',
  },
  questionBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  questionPrompt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 22,
  },
  optionsList: {
    gap: 8,
  },
  optionItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  optionSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  optionCorrect: {
    borderColor: '#10b981',
    backgroundColor: '#d1fae5',
  },
  optionWrong: {
    borderColor: '#ef4444',
    backgroundColor: '#fee2e2',
  },
  optionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  explanationBox: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    gap: 4,
  },
  explanationTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
  },
  explanationText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  feedbackContainer: {
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  actionsRow: {
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
