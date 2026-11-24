import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { ActiveGamifyMode, GamificationState } from './types';

export interface ModesGridProps {
  state: GamificationState;
  flashcardCount: number;
  onSelectMode: (mode: ActiveGamifyMode) => void;
}

export function ModesGrid({ state, flashcardCount, onSelectMode }: ModesGridProps) {
  const C = usePalette(), { dark } = useTheme();

  const cardSurface = dark ? { backgroundColor: C.surfaceHover, borderColor: C.border } : null;
  const secBtn = dark ? { backgroundColor: C.surfaceDark, borderColor: C.border } : null;
  const secBtnTxt = dark ? { color: C.text } : null;
  const titleStyle = dark ? { color: C.text } : null;
  const descStyle = dark ? { color: C.textMuted } : null;

  return (
    <View style={styles.modesGrid}>
      {/* Modalità 1: Sopravvivenza */}
      <View style={[styles.modeCard, cardSurface]}>
        <View style={styles.modeTop}>
          <Text style={styles.modeIcon}>🛡️</Text>
          <View style={[styles.chip, { backgroundColor: '#fee2e2' }]}>
            <Text style={[styles.chipText, { color: '#991b1b' }]}>
              {`Record: ${state.recordSopravvivenza}`}
            </Text>
          </View>
        </View>
        <Text style={[styles.modeTitle, titleStyle]}>Sopravvivenza</Text>
        <Text style={[styles.modeDesc, descStyle]}>
          3 cuori a disposizione: rispondi a quante più domande consecutive possibili senza sbagliare.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avvia Sopravvivenza"
          onPress={() => onSelectMode('survival')}
          style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.primaryActionText}>Inizia Sopravvivenza</Text>
        </Pressable>
      </View>

      {/* Modalità 2: Sfida a Tempo */}
      <View
        style={[
          styles.modeCard,
          styles.speedCard,
          dark && { backgroundColor: 'rgba(99,102,241,0.16)', borderColor: '#818cf8' },
        ]}
      >
        <View style={styles.modeTop}>
          <Text style={styles.modeIcon}>⏱️</Text>
          <View style={styles.xpChip}>
            <Text style={styles.xpChipText}>{`Record: ${state.recordTimeAttack} pt`}</Text>
          </View>
        </View>
        <Text style={[styles.modeTitle, titleStyle]}>Sfida a Tempo (60 Secondi)</Text>
        <Text style={[styles.modeDesc, descStyle]}>
          Rispondi al maggior numero di domande lampo prima che scada il tempo. +2s a risposta esatta!
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avvia Sfida Rapida"
          onPress={() => onSelectMode('speed')}
          style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.primaryActionText}>Avvia Sfida Rapida</Text>
        </Pressable>
      </View>

      {/* Modalità 3: Recupero Concetti Deboli */}
      <View style={[styles.modeCard, cardSurface]}>
        <View style={styles.modeTop}>
          <Text style={styles.modeIcon}>🩹</Text>
          <View style={[styles.amberChip, dark && { backgroundColor: C.yellowBg }]}>
            <Text style={[styles.amberChipText, dark && { color: C.yellow }]}>
              {`${state.erroriRecenti.length} da recuperare`}
            </Text>
          </View>
        </View>
        <Text style={[styles.modeTitle, titleStyle]}>Recupero Concetti Deboli</Text>
        <Text style={[styles.modeDesc, descStyle]}>
          Rivedi solo i concetti su cui hai sbagliato nelle precedenti verifiche e consolidali.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avvia Recupero Errori"
          onPress={() => onSelectMode('recovery')}
          style={({ pressed }) => [styles.secondaryAction, secBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.secondaryActionText, secBtnTxt]}>Avvia Recupero Errori</Text>
        </Pressable>
      </View>

      {/* Modalità 4: Flashcard Spaziate */}
      <View style={[styles.modeCard, cardSurface]}>
        <View style={styles.modeTop}>
          <Text style={styles.modeIcon}>🗂️</Text>
          <View style={[styles.blueChip, dark && { backgroundColor: 'rgba(59,130,246,0.2)' }]}>
            <Text style={[styles.blueChipText, dark && { color: '#93c5fd' }]}>
              {`${flashcardCount} Carte`}
            </Text>
          </View>
        </View>
        <Text style={[styles.modeTitle, titleStyle]}>Flashcard Intelligenti</Text>
        <Text style={[styles.modeDesc, descStyle]}>
          Gira le carte e valuta la tua memoria (Facile, Medio, Difficile) con algoritmo Leitner.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Apri Mazzo Flashcard"
          onPress={() => onSelectMode('flashcard')}
          style={({ pressed }) => [styles.secondaryAction, secBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={[styles.secondaryActionText, secBtnTxt]}>Apri Mazzo Flashcard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modesGrid: {
    gap: 12,
    marginTop: 6,
  },
  modeCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  speedCard: {
    backgroundColor: '#f5f3ff',
    borderColor: '#c7d2fe',
  },
  modeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeIcon: {
    fontSize: 24,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  xpChip: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  xpChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4338ca',
  },
  amberChip: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  amberChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
  },
  blueChip: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  blueChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  modeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  modeDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  primaryAction: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryAction: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryActionText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
});
