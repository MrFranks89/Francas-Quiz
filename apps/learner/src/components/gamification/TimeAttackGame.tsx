import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { GameQuestion, PowerUps } from './types';
import { GameEndCard } from './GameEndCard';

export interface TimeAttackGameProps {
  questions: GameQuestion[];
  record: number;
  poteri: PowerUps;
  onUsePower: (power: 'fiftyFifty' | 'salta') => void;
  onFinish: (result: { score: number; newRecord: number; xpGained: number }) => void;
  onClose: () => void;
}

export function TimeAttackGame({
  questions,
  record,
  poteri,
  onUsePower,
  onFinish,
  onClose,
}: TimeAttackGameProps) {
  const C = usePalette(), { dark } = useTheme();
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [consecutive, setConsecutive] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([]);
  const [timeBonusFlash, setTimeBonusFlash] = useState(false);

  const currentQ = questions[currentIdx % questions.length];

  // Calcolo moltiplicatore: x1 di base, x2 a 3 consecutive, x3 a 5 consecutive
  const multiplier = consecutive >= 5 ? 3 : consecutive >= 3 ? 2 : 1;

  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isFinished) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(timer);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [isFinished]);

  function handleAnswer(optId: string) {
    if (isFinished) return;
    const isCorrect = optId === currentQ.correctOptionId;

    if (isCorrect) {
      setScore((s) => s + 10 * multiplier);
      setConsecutive((c) => c + 1);
      // Bonus +2 secondi per risposta esatta
      setSecondsLeft((prev) => prev + 2);
      setTimeBonusFlash(true);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setTimeBonusFlash(false), 600);
    } else {
      setConsecutive(0);
    }

    setEliminatedOptions([]);
    setCurrentIdx((i) => i + 1);
  }

  function applyFiftyFifty() {
    if (poteri.fiftyFifty <= 0 || eliminatedOptions.length > 0 || isFinished) return;
    const wrongOpts = currentQ.options
      .filter((o) => o.id !== currentQ.correctOptionId)
      .map((o) => o.id);
    const toEliminate = wrongOpts.slice(0, 2);
    setEliminatedOptions(toEliminate);
    onUsePower('fiftyFifty');
  }

  function applySkip() {
    if (poteri.salta <= 0 || isFinished) return;
    onUsePower('salta');
    setEliminatedOptions([]);
    setCurrentIdx((i) => i + 1);
  }

  function handleEndSession() {
    const finalRecord = Math.max(record, score);
    const xpGained = Math.round(score * 1.5) + (score > record ? 50 : 20);
    onFinish({ score, newRecord: finalRecord, xpGained });
  }

  if (isFinished) {
    const isNewRecord = score > record;
    const xpGained = Math.round(score * 1.5) + (isNewRecord ? 50 : 20);

    return (
      <GameEndCard
        icon="🏁"
        title="Tempo Scaduto!"
        desc="Hai completato la Corsa contro il Tempo."
        scoreText={`Punteggio Finale: ${score} pt`}
        previousRecordText={`Record precedente: ${record} pt`}
        isNewRecord={isNewRecord}
        newRecordBadgeText="🏆 NUOVO RECORD TIME ATTACK!"
        xpGained={xpGained}
        primaryActionLabel="Salva Risultato e Chiudi"
        onPrimaryAction={handleEndSession}
      />
    );
  }

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* Header compatibile con test: 'Sfida a Tempo attiva' e '60s rimanenti' */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, dark && { color: C.text }]}>⏱️ Sfida a Tempo attiva</Text>
          <Text style={[styles.desc, dark && { color: C.textMuted }]}>
            {`Punteggio: ${score} pt · Record: ${record} pt`}
          </Text>
        </View>
        <View style={styles.timerBadgeBox}>
          <Text
            style={[
              styles.timerBadge,
              timeBonusFlash && styles.timerBonusFlash,
              secondsLeft <= 10 && styles.timerWarning,
              dark && { color: C.indigoLight },
            ]}
          >
            {`${secondsLeft}s rimanenti`}
          </Text>
          <View style={styles.multiplierPill}>
            <Text style={styles.multiplierText}>{`Moltiplicatore: ×${multiplier}`}</Text>
          </View>
        </View>
      </View>

      {/* Toolbar poteri */}
      <View style={styles.powersToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Usa 50/50 Time Attack"
          disabled={poteri.fiftyFifty <= 0 || eliminatedOptions.length > 0}
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
          accessibilityLabel="Usa Salta Time Attack"
          disabled={poteri.salta <= 0}
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

      {/* Domanda lampo */}
      <View style={[styles.questionBox, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={[styles.questionPrompt, dark && { color: C.text }]}>{currentQ.prompt}</Text>

        <View style={styles.optionsList}>
          {currentQ.options.map((opt) => {
            if (eliminatedOptions.includes(opt.id)) return null;

            return (
              <Pressable
                key={opt.id}
                accessibilityRole="button"
                accessibilityLabel={opt.text}
                onPress={() => handleAnswer(opt.id)}
                style={({ pressed }) => [
                  styles.optionItem,
                  pressed && { opacity: 0.8 },
                  dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
                ]}
              >
                <Text style={[styles.optionText, dark && { color: C.text }]}>{opt.text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Termina Sfida Anticipatamente"
          onPress={() => setIsFinished(true)}
          style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
        >
          <Text style={[styles.secondaryBtnText, dark && { color: C.textMuted }]}>Termina subito</Text>
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
  timerBadgeBox: {
    alignItems: 'flex-end',
    gap: 4,
  },
  timerBadge: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4f46e5',
  },
  timerBonusFlash: {
    color: '#10b981',
  },
  timerWarning: {
    color: '#ef4444',
  },
  multiplierPill: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  multiplierText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338ca',
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
  optionText: {
    fontSize: 14,
    color: '#1e293b',
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
