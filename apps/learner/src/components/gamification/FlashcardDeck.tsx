import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { FlashcardItem } from './types';

export interface FlashcardDeckProps {
  cards: FlashcardItem[];
  onRateCard: (cardId: string, rating: 'easy' | 'medium' | 'hard', xpBonus: number) => void;
  onFinishDeck: (totalXp: number) => void;
  onClose: () => void;
}

export function FlashcardDeck({
  cards,
  onRateCard,
  onFinishDeck,
  onClose,
}: FlashcardDeckProps) {
  const C = usePalette(), { dark } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const card = cards[currentIdx % cards.length];
  const progressText = `Carta ${currentIdx + 1} di ${cards.length}`;

  function handleRating(rating: 'easy' | 'medium' | 'hard', bonus: number) {
    const nextXp = sessionXp + bonus;
    setSessionXp(nextXp);
    onRateCard(card.id, rating, bonus);

    setIsFlipped(false);
    if (currentIdx + 1 >= cards.length) {
      setIsCompleted(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  if (isCompleted) {
    return (
      <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
        <Text style={styles.celebrationIcon}>🎉</Text>
        <Text style={[styles.title, dark && { color: C.text }]}>Mazzo Completato!</Text>
        <Text style={[styles.desc, dark && { color: C.textMuted }]}>
          Hai ripassato tutte le flashcard previste per questa sessione.
        </Text>

        <View style={styles.statsCard}>
          <Text style={styles.xpGainedText}>{`+${sessionXp} XP guadagnati`}</Text>
          <Text style={styles.leitnerHint}>
            Gli intervalli di richiamo sono stati aggiornati secondo il metodo Leitner.
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ricomincia Mazzo"
            onPress={() => {
              setCurrentIdx(0);
              setIsFlipped(false);
              setIsCompleted(false);
              setSessionXp(0);
            }}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Ricomincia Mazzo</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Concludi Mazzo"
            onPress={() => onFinishDeck(sessionXp)}
            style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
          >
            <Text style={[styles.secondaryBtnText, dark && { color: C.text }]}>Concludi</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* Intestazione */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, dark && { color: C.text }]}>🗂️ Flashcard Spaziata</Text>
          <Text style={[styles.desc, dark && { color: C.textMuted }]}>{progressText}</Text>
        </View>
        <View style={styles.topicBadge}>
          <Text style={styles.topicBadgeText}>{card.topic || 'Concetti Chiave'}</Text>
        </View>
      </View>

      {/* Carta con flip */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFlipped ? 'Mostra fronte carta' : 'Gira la carta'}
        onPress={() => setIsFlipped((f) => !f)}
        style={[styles.cardSurface, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}
      >
        <Text style={[styles.sideIndicator, dark && { color: C.indigoLight }]}>
          {isFlipped ? 'RETRO (DEFINIZIONE / RISPOSTA)' : 'FRONTE (CONCETTO / DOMANDA)'}
        </Text>
        <Text style={[styles.flashcardText, dark && { color: C.text }]}>
          {isFlipped ? card.back : card.front}
        </Text>
        <Text style={[styles.flipHint, dark && { color: C.textMuted }]}>
          {isFlipped ? 'Tocca per girare di nuovo' : 'Tocca la carta per scoprire il retro'}
        </Text>
      </Pressable>

      {/* Azioni di valutazione Leitner */}
      <View style={styles.actionsContainer}>
        {!isFlipped ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gira la carta"
            onPress={() => setIsFlipped(true)}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Gira la carta</Text>
          </Pressable>
        ) : (
          <View style={styles.ratingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Valuta Facile"
              onPress={() => handleRating('easy', 20)}
              style={[styles.ratingBtn, styles.ratingEasy]}
            >
              <Text style={styles.ratingBtnText}>Facile (+20 XP)</Text>
              <Text style={styles.intervalText}>7 giorni</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Valuta Medio"
              onPress={() => handleRating('medium', 15)}
              style={[styles.ratingBtn, styles.ratingMedium, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
            >
              <Text style={[styles.ratingBtnText, dark && { color: C.text }]}>Medio (+15 XP)</Text>
              <Text style={[styles.intervalText, dark && { color: C.textMuted }]}>3 giorni</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Valuta Difficile"
              onPress={() => handleRating('hard', 10)}
              style={[styles.ratingBtn, styles.ratingHard, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
            >
              <Text style={[styles.ratingBtnText, dark && { color: C.text }]}>Difficile (+10 XP)</Text>
              <Text style={[styles.intervalText, dark && { color: C.textMuted }]}>1 giorno</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Footer uscita */}
      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi Mazzo Flashcard"
          onPress={onClose}
          style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
        >
          <Text style={[styles.secondaryBtnText, dark && { color: C.textMuted }]}>Sospendi sessione</Text>
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
  topicBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  topicBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
  },
  cardSurface: {
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  sideIndicator: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: 0.5,
  },
  flashcardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: 24,
  },
  flipHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
  },
  actionsContainer: {
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
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
  },
  ratingEasy: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  ratingMedium: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  ratingHard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  ratingBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065f46',
  },
  intervalText: {
    fontSize: 10,
    color: '#6b7280',
  },
  celebrationIcon: {
    fontSize: 36,
    textAlign: 'center',
  },
  statsCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    gap: 6,
  },
  xpGainedText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
  },
  leitnerHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  actionsRow: {
    gap: 8,
    marginTop: 4,
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
