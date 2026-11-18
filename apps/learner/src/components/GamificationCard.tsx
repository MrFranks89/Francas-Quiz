import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Card, colors } from './ui';

type ActiveMode = 'idle' | 'speed' | 'recovery' | 'flashcard';

export interface GamificationCardProps {
  initialXp?: number;
  streakDays?: number;
  topicHint?: string;
}

const FLASHCARDS = [
  {
    front: 'Qual è l’obiettivo della verifica preventiva dei concetti chiave?',
    back: 'Individuare subito definizioni portanti e nessi logici prima di passare ai quiz.',
  },
  {
    front: 'Perché la ripetizione spaziata migliora la memoria a lungo termine?',
    back: 'Richiama il concetto vicino alla curva dell’oblio, rafforzando il recupero attivo.',
  },
];

export function GamificationCard({
  initialXp = 740,
  streakDays = 4,
  topicHint = 'materiale selezionato',
}: GamificationCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const [xp, setXp] = useState(initialXp);
  const [mode, setMode] = useState<ActiveMode>('idle');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const cardSurface = dark ? { backgroundColor: C.surfaceHover, borderColor: C.border } : null;
  const secBtn = dark ? { backgroundColor: C.surfaceDark, borderColor: C.border } : null;
  const secBtnTxt = dark ? { color: C.text } : null;
  const boxStyle = dark ? { backgroundColor: C.surfaceDark, borderColor: C.selBorder } : null;
  const titleStyle = dark ? { color: C.text } : null;
  const descStyle = dark ? { color: C.textMuted } : null;

  const level = xp >= 1000 ? 'Oro' : 'Argento';
  const nextGoal = xp >= 1000 ? 'Livello Oro raggiunto' : 'Prossimo Livello a 1.000 XP';

  useEffect(() => {
    if (mode !== 'speed') return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [mode]);

  function startSpeedChallenge() {
    setSecondsLeft(60);
    setMode('speed');
    setStatusMessage('');
  }

  function completeSpeedStep() {
    setXp((v) => v + 50);
    setStatusMessage('+50 XP guadagnati nella sfida a tempo!');
    setMode('idle');
  }

  function completeRecovery() {
    setXp((v) => v + 25);
    setStatusMessage('+25 XP! Concetto debole ripassato.');
    setMode('idle');
  }

  function rateFlashcard(bonus: number) {
    setXp((v) => v + bonus);
    setCardFlipped(false);
    setCardIndex((i) => (i + 1) % FLASHCARDS.length);
    setStatusMessage(`+${bonus} XP dalla sessione flashcard.`);
  }

  const card = FLASHCARDS[cardIndex];

  return (
    <Card>
      <View style={localStyles.banner}>
        <View style={localStyles.bannerLeft}>
          <View style={localStyles.boltBox}>
            <Text style={localStyles.boltIcon}>⚡</Text>
          </View>
          <View>
            <Text style={localStyles.levelEyebrow}>{`Livello Padronanza: ${level}`}</Text>
            <Text style={localStyles.xpTitle}>{`${xp} XP accumulati`}</Text>
          </View>
        </View>

        <View style={localStyles.badgesRow}>
          <View style={localStyles.statBadge}>
            <Text style={localStyles.statBadgeText}>{`🔥 ${streakDays} Giorni di Serie`}</Text>
          </View>
          <View style={localStyles.statBadge}>
            <Text style={localStyles.statBadgeText}>{`🏆 ${nextGoal}`}</Text>
          </View>
        </View>
      </View>

      {!!statusMessage && (
        <View style={[localStyles.toastBox, dark && { backgroundColor: C.greenBg, borderColor: C.green }]}>
          <Text style={[localStyles.toastText, dark && { color: C.greenText }]}>{statusMessage}</Text>
        </View>
      )}

      <View style={localStyles.modesGrid}>
        <View
          style={[
            localStyles.modeCard,
            localStyles.speedCard,
            dark && { backgroundColor: 'rgba(99,102,241,0.16)', borderColor: '#818cf8' },
          ]}
        >
          <View style={localStyles.modeTop}>
            <Text style={localStyles.modeIcon}>⏱️</Text>
            <View style={localStyles.xpChip}>
              <Text style={localStyles.xpChipText}>+50 XP</Text>
            </View>
          </View>
          <Text style={[localStyles.modeTitle, titleStyle]}>Sfida a Tempo (60 Secondi)</Text>
          <Text style={[localStyles.modeDesc, descStyle]}>
            Rispondi al maggior numero di domande lampo prima che scada il tempo.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Avvia Sfida Rapida"
            onPress={startSpeedChallenge}
            style={({ pressed }) => [localStyles.primaryAction, pressed && { opacity: 0.8 }]}
          >
            <Text style={localStyles.primaryActionText}>Avvia Sfida Rapida</Text>
          </Pressable>
        </View>

        <View style={[localStyles.modeCard, cardSurface]}>
          <View style={localStyles.modeTop}>
            <Text style={localStyles.modeIcon}>🩹</Text>
            <View style={[localStyles.amberChip, dark && { backgroundColor: C.yellowBg }]}>
              <Text style={[localStyles.amberChipText, dark && { color: C.yellow }]}>3 da recuperare</Text>
            </View>
          </View>
          <Text style={[localStyles.modeTitle, titleStyle]}>Recupero Concetti Deboli</Text>
          <Text style={[localStyles.modeDesc, descStyle]}>
            Rivedi solo i concetti su cui hai sbagliato nelle precedenti verifiche.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Avvia Recupero Errori"
            onPress={() => {
              setMode('recovery');
              setStatusMessage('');
            }}
            style={({ pressed }) => [localStyles.secondaryAction, secBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Avvia Recupero Errori</Text>
          </Pressable>
        </View>

        <View style={[localStyles.modeCard, cardSurface]}>
          <View style={localStyles.modeTop}>
            <Text style={localStyles.modeIcon}>🗂️</Text>
            <View style={[localStyles.blueChip, dark && { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
              <Text style={[localStyles.blueChipText, dark && { color: '#93c5fd' }]}>12 Carte</Text>
            </View>
          </View>
          <Text style={[localStyles.modeTitle, titleStyle]}>Flashcard Intelligenti</Text>
          <Text style={[localStyles.modeDesc, descStyle]}>
            Gira le carte e valuta la tua memoria (Facile, Medio, Difficile).
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apri Mazzo Flashcard"
            onPress={() => {
              setMode('flashcard');
              setCardFlipped(false);
              setStatusMessage('');
            }}
            style={({ pressed }) => [localStyles.secondaryAction, secBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Apri Mazzo Flashcard</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'speed' && (
        <View style={[localStyles.interactiveBox, boxStyle]}>
          <View style={localStyles.interactiveHeader}>
            <Text style={[localStyles.interactiveTitle, titleStyle]}>⏱️ Sfida a Tempo attiva</Text>
            <Text style={[localStyles.timerBadge, dark && { color: C.indigoLight }]}>
              {`${secondsLeft}s rimanenti`}
            </Text>
          </View>
          <Text style={[localStyles.modeDesc, descStyle]}>
            {`Domanda lampo su ${topicHint}: identifica il punto chiave principale prima dello scadere del timer.`}
          </Text>
          <View style={localStyles.interactiveActions}>
            <Pressable onPress={completeSpeedStep} style={localStyles.primaryAction}>
              <Text style={localStyles.primaryActionText}>Completa serie (+50 XP)</Text>
            </Pressable>
            <Pressable onPress={() => setMode('idle')} style={[localStyles.secondaryAction, secBtn]}>
              <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      )}

      {mode === 'recovery' && (
        <View style={[localStyles.interactiveBox, boxStyle]}>
          <Text style={[localStyles.interactiveTitle, titleStyle]}>🩹 Focus Concetti Deboli</Text>
          <Text style={[localStyles.modeDesc, descStyle]}>
            {`Rivedi le definizioni principali di ${topicHint} e confrontale con le fonti originali.`}
          </Text>
          <View style={localStyles.interactiveActions}>
            <Pressable onPress={completeRecovery} style={localStyles.primaryAction}>
              <Text style={localStyles.primaryActionText}>Segna come ripassato (+25 XP)</Text>
            </Pressable>
            <Pressable onPress={() => setMode('idle')} style={[localStyles.secondaryAction, secBtn]}>
              <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      )}

      {mode === 'flashcard' && (
        <View style={[localStyles.interactiveBox, boxStyle]}>
          <Text style={[localStyles.interactiveTitle, titleStyle]}>🗂️ Flashcard Spaziata</Text>
          <Text style={[localStyles.flashcardText, titleStyle]}>{cardFlipped ? card.back : card.front}</Text>
          <View style={localStyles.interactiveActions}>
            {!cardFlipped ? (
              <Pressable onPress={() => setCardFlipped(true)} style={localStyles.primaryAction}>
                <Text style={localStyles.primaryActionText}>Gira la carta</Text>
              </Pressable>
            ) : (
              <>
                <Pressable onPress={() => rateFlashcard(20)} style={localStyles.primaryAction}>
                  <Text style={localStyles.primaryActionText}>Facile (+20 XP)</Text>
                </Pressable>
                <Pressable onPress={() => rateFlashcard(15)} style={[localStyles.secondaryAction, secBtn]}>
                  <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Medio (+15 XP)</Text>
                </Pressable>
                <Pressable onPress={() => rateFlashcard(10)} style={[localStyles.secondaryAction, secBtn]}>
                  <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Difficile (+10 XP)</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={() => setMode('idle')} style={[localStyles.secondaryAction, secBtn]}>
              <Text style={[localStyles.secondaryActionText, secBtnTxt]}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Card>
  );
}

const localStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#4f46e5',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  boltBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boltIcon: { fontSize: 22 },
  levelEyebrow: {
    color: '#c7d2fe',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  xpTitle: { color: 'white', fontSize: 18, fontWeight: '800' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
  toastBox: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  toastText: { color: '#065f46', fontSize: 13, fontWeight: '700' },
  modesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modeCard: {
    flex: 1,
    minWidth: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
    justifyContent: 'space-between',
  },
  speedCard: { borderWidth: 2, borderColor: '#6366f1', backgroundColor: '#eef2ff' },
  modeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeIcon: { fontSize: 20 },
  xpChip: {
    backgroundColor: '#4f46e5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  xpChipText: { color: 'white', fontSize: 11, fontWeight: '700' },
  amberChip: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  amberChipText: { color: '#b45309', fontSize: 11, fontWeight: '700' },
  blueChip: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blueChipText: { color: '#1d4ed8', fontSize: 11, fontWeight: '700' },
  modeTitle: { fontSize: 14, fontWeight: '700', color: colors.navy },
  modeDesc: { fontSize: 12, lineHeight: 18, color: colors.muted },
  primaryAction: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  primaryActionText: { color: 'white', fontSize: 12, fontWeight: '700' },
  secondaryAction: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  secondaryActionText: { color: colors.navy, fontSize: 12, fontWeight: '600' },
  interactiveBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  interactiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  interactiveTitle: { fontSize: 14, fontWeight: '700', color: colors.navy },
  timerBadge: { fontSize: 12, fontWeight: '800', color: '#4f46e5' },
  flashcardText: { fontSize: 14, fontWeight: '600', color: colors.navy, lineHeight: 21 },
  interactiveActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
