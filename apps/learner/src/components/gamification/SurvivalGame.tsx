import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { GameQuestion, PowerUps } from './types';
import { GameEndCard } from './GameEndCard';

export interface SurvivalGameProps {
  questions: GameQuestion[];
  record: number;
  poteri: PowerUps;
  onUsePower: (power: 'fiftyFifty' | 'salta') => void;
  onFinish: (result: { newRecord: number; xpGained: number; failedQuestion?: GameQuestion }) => void;
  onClose: () => void;
}

export function SurvivalGame({
  questions,
  record,
  poteri,
  onUsePower,
  onFinish,
  onClose,
}: SurvivalGameProps) {
  const C = usePalette(), { dark } = useTheme();
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [accumulatedXp, setAccumulatedXp] = useState(0);

  const currentQ = questions[currentIdx % questions.length];

  function handleAnswer(optId: string) {
    if (showFeedback || isGameOver) return;
    setSelectedOpt(optId);
    setShowFeedback(true);

    const isCorrect = optId === currentQ.correctOptionId;
    if (isCorrect) {
      setStreak((s) => s + 1);
      setAccumulatedXp((x) => x + 15);
    } else {
      const nextLives = lives - 1;
      setLives(nextLives);
      setStreak(0);
      if (nextLives <= 0) {
        setIsGameOver(true);
      }
    }
  }

  function handleNext() {
    if (lives <= 0) {
      const finalRecord = Math.max(record, streak);
      onFinish({
        newRecord: finalRecord,
        xpGained: accumulatedXp,
        failedQuestion: currentQ,
      });
      return;
    }
    setShowFeedback(false);
    setSelectedOpt(null);
    setEliminatedOptions([]);
    setCurrentIdx((i) => i + 1);
  }

  function applyFiftyFifty() {
    if (poteri.fiftyFifty <= 0 || eliminatedOptions.length > 0) return;
    const wrongOpts = currentQ.options
      .filter((o) => o.id !== currentQ.correctOptionId)
      .map((o) => o.id);
    const toEliminate = wrongOpts.slice(0, 2);
    setEliminatedOptions(toEliminate);
    onUsePower('fiftyFifty');
  }

  function applySkip() {
    if (poteri.salta <= 0) return;
    onUsePower('salta');
    setSelectedOpt(null);
    setShowFeedback(false);
    setEliminatedOptions([]);
    setCurrentIdx((i) => i + 1);
  }

  const heartsDisplay = ['❤️', '❤️', '❤️']
    .map((heart, idx) => (idx < lives ? heart : '🖤'))
    .join(' ');

  if (isGameOver) {
    return (
      <GameEndCard
        icon="💀"
        title="Partita Terminata"
        desc="Hai esaurito le 3 vite a disposizione."
        scoreText={`Serie raggiunta: ${streak}`}
        previousRecordText={`Record precedente: ${record}`}
        isNewRecord={streak > record}
        newRecordBadgeText="🏆 NUOVO RECORD PERSONALE!"
        xpGained={accumulatedXp}
        primaryActionLabel="Rigioca"
        onPrimaryAction={() => {
          setLives(3);
          setStreak(0);
          setCurrentIdx((i) => i + 1);
          setSelectedOpt(null);
          setShowFeedback(false);
          setIsGameOver(false);
          setEliminatedOptions([]);
          setAccumulatedXp(0);
        }}
        secondaryActionLabel="Chiudi"
        onSecondaryAction={onClose}
      />
    );
  }

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* Intestazione */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, dark && { color: C.text }]}>🛡️ Sopravvivenza</Text>
          <Text style={[styles.desc, dark && { color: C.textMuted }]}>
            {`Record personale: ${record} corrette di fila`}
          </Text>
        </View>
        <View style={styles.vitalsBox}>
          <Text style={styles.heartsText}>{heartsDisplay}</Text>
          <Text style={styles.streakCount}>{`Serie: ${streak}`}</Text>
        </View>
      </View>

      {/* Barra poteri */}
      <View style={styles.powersToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Usa potere 50/50"
          disabled={poteri.fiftyFifty <= 0 || eliminatedOptions.length > 0 || showFeedback}
          onPress={applyFiftyFifty}
          style={[
            styles.powerBtn,
            (poteri.fiftyFifty <= 0 || eliminatedOptions.length > 0) && styles.powerBtnDisabled,
            dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
          ]}
        >
          <Text style={[styles.powerBtnText, dark && { color: C.indigoLight }]}>
            {`⚡ 50/50 (${poteri.fiftyFifty})`}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Usa potere Salta"
          disabled={poteri.salta <= 0 || showFeedback}
          onPress={applySkip}
          style={[
            styles.powerBtn,
            poteri.salta <= 0 && styles.powerBtnDisabled,
            dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
          ]}
        >
          <Text style={[styles.powerBtnText, dark && { color: C.greenText }]}>
            {`⏭️ Salta (${poteri.salta})`}
          </Text>
        </Pressable>
      </View>

      {/* Domanda corrente */}
      <View style={[styles.questionBox, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={[styles.questionPrompt, dark && { color: C.text }]}>{currentQ.prompt}</Text>

        <View style={styles.optionsList}>
          {currentQ.options.map((opt) => {
            const isEliminated = eliminatedOptions.includes(opt.id);
            if (isEliminated) return null;

            const isChosen = selectedOpt === opt.id;
            const isCorrect = opt.id === currentQ.correctOptionId;

            let optStyle = styles.optionItem;
            if (showFeedback) {
              if (isCorrect) optStyle = { ...optStyle, ...styles.optionCorrect };
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
                onPress={() => handleAnswer(opt.id)}
                style={[optStyle, dark && !showFeedback && { backgroundColor: C.surfaceDark, borderColor: C.border }]}
              >
                <Text
                  style={[
                    styles.optionText,
                    dark && { color: C.text },
                    showFeedback && isCorrect && { color: '#065f46', fontWeight: '800' },
                    showFeedback && isChosen && !isCorrect && { color: '#991b1b', fontWeight: '800' },
                  ]}
                >
                  {opt.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Feedback e pulsante avanti */}
      {showFeedback && (
        <View style={styles.feedbackContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continua"
            onPress={handleNext}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Continua →</Text>
          </Pressable>
        </View>
      )}

      {/* Pulsante di uscita */}
      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Esci da Sopravvivenza"
          onPress={onClose}
          style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
        >
          <Text style={[styles.secondaryBtnText, dark && { color: C.textMuted }]}>Abbandona sfida</Text>
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
  vitalsBox: {
    alignItems: 'flex-end',
    gap: 2,
  },
  heartsText: {
    fontSize: 18,
  },
  streakCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
  },
  powersToolbar: {
    flexDirection: 'row',
    gap: 8,
  },
  powerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  powerBtnDisabled: {
    opacity: 0.4,
  },
  powerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
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
  feedbackContainer: {
    marginTop: 6,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
