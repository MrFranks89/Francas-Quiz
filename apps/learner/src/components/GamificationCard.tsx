import React, { useState, useEffect } from 'react';
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
import {
  generateEventId,
  getClientTodayDate,
  getFlashcards,
  getGamificationState,
  mappaLivelloFascia,
  postGamificationEvent,
} from '../api/gamification';

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
  extractionId,
  questions = DEFAULT_QUESTIONS,
  flashcards: initialFlashcards = DEFAULT_FLASHCARDS,
  onXpEarned,
}: GamificationCardProps) {
  const C = usePalette(), { dark } = useTheme();

  const [state, setState] = useState<GamificationState>({
    xp: initialXp,
    livello: mappaLivelloFascia(initialXp >= 1000 ? 5 : 2),
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

  const [cards, setCards] = useState<FlashcardItem[]>(initialFlashcards);
  const [mode, setMode] = useState<ActiveGamifyMode>('idle');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch dello stato reale gamification e mazzo flashcard da backend
  useEffect(() => {
    if (!extractionId) return;
    let cancel = false;

    getGamificationState(extractionId)
      .then((backendState) => {
        if (cancel) return;
        setState((prev) => ({
          ...prev,
          xp: backendState.xp,
          livello: mappaLivelloFascia(backendState.livello),
          streak: { days: backendState.streak.days },
          recordSopravvivenza: backendState.recordSopravvivenza,
          recordTimeAttack: backendState.recordTimeAttack,
          poteri: backendState.poteri,
          mastery: backendState.mastery,
        }));
      })
      .catch(() => {
        // Fallback silente ai valori predefiniti
      });

    getFlashcards(extractionId)
      .then((mazzo) => {
        if (cancel || !mazzo.carte || mazzo.carte.length === 0) return;
        const mappedCards: FlashcardItem[] = mazzo.carte.map((c) => ({
          id: c.cardId,
          front: c.fronte,
          back: c.retro,
          topic: c.fronte,
          intervalDays: c.box === 1 ? 1 : c.box === 2 ? 3 : 7,
        }));
        setCards(mappedCards);
      })
      .catch(() => {
        // Fallback silente alle carte predefinite
      });

    return () => {
      cancel = true;
    };
  }, [extractionId]);

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
    if (extractionId) {
      postGamificationEvent(extractionId, {
        tipo: 'potere_usato',
        eventId: generateEventId(),
        clientDate: getClientTodayDate(),
        potere: power,
      }).catch(() => {});
    }
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
    if (extractionId) {
      postGamificationEvent(extractionId, {
        tipo: 'sopravvivenza_fine',
        eventId: generateEventId(),
        clientDate: getClientTodayDate(),
        serie: result.newRecord,
      })
        .then((s) => {
          setState((prev) => ({
            ...prev,
            xp: s.xp,
            livello: mappaLivelloFascia(s.livello),
            recordSopravvivenza: s.recordSopravvivenza,
            poteri: s.poteri,
          }));
        })
        .catch(() => {});
    }
    setMode('idle');
  }

  function handleTimeAttackFinish(result: { score: number; newRecord: number; xpGained: number }) {
    setState((prev) => ({
      ...prev,
      recordTimeAttack: Math.max(prev.recordTimeAttack, result.newRecord),
    }));
    awardXp(result.xpGained, `+${result.xpGained} XP dalla Corsa contro il Tempo!`);
    if (extractionId) {
      postGamificationEvent(extractionId, {
        tipo: 'time_attack_fine',
        eventId: generateEventId(),
        clientDate: getClientTodayDate(),
        punteggio: result.score,
        durataSecondi: 60,
      })
        .then((s) => {
          setState((prev) => ({
            ...prev,
            xp: s.xp,
            livello: mappaLivelloFascia(s.livello),
            recordTimeAttack: s.recordTimeAttack,
            poteri: s.poteri,
          }));
        })
        .catch(() => {});
    }
    setMode('idle');
  }

  function handleRateFlashcard(cardId: string, rating: 'easy' | 'medium' | 'hard', bonus: number) {
    awardXp(bonus, `+${bonus} XP dalla sessione flashcard.`);
    if (extractionId) {
      const val = rating === 'easy' ? 'facile' : rating === 'medium' ? 'medio' : 'difficile';
      postGamificationEvent(extractionId, {
        tipo: 'flashcard_valutata',
        eventId: generateEventId(),
        clientDate: getClientTodayDate(),
        cardId,
        valutazione: val,
      })
        .then((s) => {
          setState((prev) => ({
            ...prev,
            xp: s.xp,
            livello: mappaLivelloFascia(s.livello),
          }));
        })
        .catch(() => {});
    }
  }

  function handleRecoveryQuestion(questionId: string, xpGained: number) {
    setState((prev) => ({
      ...prev,
      erroriRecenti: prev.erroriRecenti.filter((e) => e.id !== questionId),
    }));
    awardXp(xpGained, `+${xpGained} XP! Concetto debole recuperato.`);
    if (extractionId) {
      postGamificationEvent(extractionId, {
        tipo: 'recupero_completato',
        eventId: generateEventId(),
        clientDate: getClientTodayDate(),
        scopeId: 'recupero-concetti',
      })
        .then((s) => {
          setState((prev) => ({
            ...prev,
            xp: s.xp,
            livello: mappaLivelloFascia(s.livello),
          }));
        })
        .catch(() => {});
    }
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
        flashcardCount={cards.length}
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
          cards={cards}
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
