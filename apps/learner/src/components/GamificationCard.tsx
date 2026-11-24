import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Card } from './ui';
import type {
  ActiveGamifyMode,
  FlashcardItem,
  GameQuestion,
  GamificationState,
} from './gamification/types';
import { DEFAULT_FLASHCARDS, DEFAULT_QUESTIONS } from './gamification/defaults';
import { GamificationBanner } from './gamification/GamificationBanner';
import { ModesGrid } from './gamification/ModesGrid';
import { SurvivalGame } from './gamification/SurvivalGame';
import { TimeAttackGame } from './gamification/TimeAttackGame';
import { FlashcardDeck } from './gamification/FlashcardDeck';
import { RecoveryGame } from './gamification/RecoveryGame';
import { ProModesCard } from './gamification/ProModesCard';

export interface GamificationCardProps {
  initialXp?: number;
  streakDays?: number;
  topicHint?: string;
  extractionId?: string;
  questions?: GameQuestion[];
  flashcards?: FlashcardItem[];
  onXpEarned?: (xp: number) => void;
}

export function GamificationCard({
  initialXp = 740,
  streakDays = 4,
  questions = DEFAULT_QUESTIONS,
  flashcards = DEFAULT_FLASHCARDS,
  onXpEarned,
}: GamificationCardProps) {
  const C = usePalette(), { dark } = useTheme();

  const [state, setState] = useState<GamificationState>({
    xp: initialXp,
    livello: initialXp >= 1000 ? 'Oro' : 'Argento',
    streak: { days: streakDays },
    recordSopravvivenza: 5,
    recordTimeAttack: 80,
    mastery: { default: 65 },
    poteri: { fiftyFifty: 3, salta: 2 },
    erroriRecenti: [
      {
        id: 'err-1',
        prompt: 'Qual è la funzione del ripasso dinamico ad intervalli crescenti?',
        options: [
          { id: 'o1', text: 'Consolidare la traccia mnestica prima della dimenticanza' },
          { id: 'o2', text: 'Cancellare le risposte sbagliate dall’archivio' },
        ],
        correctOptionId: 'o1',
        explanation: 'Il richiamo temporizzato intercetta la curva dell’oblio di Ebbinghaus.',
      },
    ],
  });

  const [mode, setMode] = useState<ActiveGamifyMode>('idle');
  const [toastMessage, setToastMessage] = useState('');

  const nextGoal = state.xp >= 1000 ? 'Livello Oro raggiunto' : 'Prossimo Livello a 1.000 XP';

  function awardXp(amount: number, message: string) {
    setState((prev) => {
      const nextXp = prev.xp + amount;
      const nextLevel = nextXp >= 1000 ? 'Oro' : 'Argento';
      return { ...prev, xp: nextXp, livello: nextLevel };
    });
    setToastMessage(message);
    onXpEarned?.(amount);
  }

  function handleUsePower(power: 'fiftyFifty' | 'salta') {
    setState((prev) => ({
      ...prev,
      poteri: {
        ...prev.poteri,
        [power]: Math.max(0, prev.poteri[power] - 1),
      },
    }));
  }

  function handleSurvivalFinish(result: { newRecord: number; xpGained: number; failedQuestion?: GameQuestion }) {
    setState((prev) => {
      const newErrors = result.failedQuestion
        ? [...prev.erroriRecenti.filter((e) => e.id !== result.failedQuestion?.id), result.failedQuestion]
        : prev.erroriRecenti;
      return {
        ...prev,
        recordSopravvivenza: Math.max(prev.recordSopravvivenza, result.newRecord),
        erroriRecenti: newErrors,
      };
    });
    if (result.xpGained > 0) {
      awardXp(result.xpGained, `+${result.xpGained} XP da Sopravvivenza!`);
    }
    setMode('idle');
  }

  function handleTimeAttackFinish(result: { score: number; newRecord: number; xpGained: number }) {
    setState((prev) => ({
      ...prev,
      recordTimeAttack: Math.max(prev.recordTimeAttack, result.newRecord),
    }));
    awardXp(result.xpGained, `+${result.xpGained} XP dalla Corsa contro il Tempo!`);
    setMode('idle');
  }

  function handleRateFlashcard(_cardId: string, _rating: 'easy' | 'medium' | 'hard', bonus: number) {
    awardXp(bonus, `+${bonus} XP dalla sessione flashcard.`);
  }

  function handleRecoveryQuestion(questionId: string, xpGained: number) {
    setState((prev) => ({
      ...prev,
      erroriRecenti: prev.erroriRecenti.filter((e) => e.id !== questionId),
    }));
    awardXp(xpGained, `+${xpGained} XP! Concetto debole recuperato.`);
  }

  return (
    <Card>
      <GamificationBanner
        xp={state.xp}
        level={state.livello}
        streakDays={state.streak.days}
        nextGoal={nextGoal}
        masteryPercentage={state.mastery.default ?? 65}
        poteri={state.poteri}
      />

      {!!toastMessage && (
        <View style={[styles.toastBox, dark && { backgroundColor: C.greenBg, borderColor: C.green }]}>
          <Text style={[styles.toastText, dark && { color: C.greenText }]}>{toastMessage}</Text>
        </View>
      )}

      {/* Griglia modalità sempre accessibile per consentire cambio modalità e retrocompatibilità */}
      <ModesGrid
        state={state}
        flashcardCount={flashcards.length}
        onSelectMode={(m) => {
          setMode(m);
          setToastMessage('');
        }}
      />

      {mode === 'idle' && <ProModesCard />}

      {mode === 'survival' && (
        <SurvivalGame
          questions={questions}
          record={state.recordSopravvivenza}
          poteri={state.poteri}
          onUsePower={handleUsePower}
          onFinish={handleSurvivalFinish}
          onClose={() => setMode('idle')}
        />
      )}

      {mode === 'speed' && (
        <TimeAttackGame
          questions={questions}
          record={state.recordTimeAttack}
          poteri={state.poteri}
          onUsePower={handleUsePower}
          onFinish={handleTimeAttackFinish}
          onClose={() => setMode('idle')}
        />
      )}

      {mode === 'flashcard' && (
        <FlashcardDeck
          cards={flashcards}
          onRateCard={handleRateFlashcard}
          onFinishDeck={(xp) => {
            awardXp(xp, `Sessione flashcard conclusa: +${xp} XP.`);
            setMode('idle');
          }}
          onClose={() => setMode('idle')}
        />
      )}

      {mode === 'recovery' && (
        <RecoveryGame
          errors={state.erroriRecenti}
          onRecoverQuestion={handleRecoveryQuestion}
          onClose={() => setMode('idle')}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  toastBox: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  toastText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
