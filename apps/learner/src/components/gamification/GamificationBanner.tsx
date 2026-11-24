import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { PowerUps } from './types';

export interface GamificationBannerProps {
  xp: number;
  level: string;
  streakDays: number;
  nextGoal: string;
  masteryPercentage: number;
  poteri: PowerUps;
}

export function GamificationBanner({
  xp,
  level,
  streakDays,
  nextGoal,
  masteryPercentage,
  poteri,
}: GamificationBannerProps) {
  const C = usePalette(), { dark } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 600;

  const boundedMastery = Math.min(100, Math.max(0, Math.round(masteryPercentage)));

  return (
    <View style={[styles.container, dark && { borderColor: C.border, backgroundColor: C.surfaceDark }]}>
      <View style={[styles.topRow, isCompact && styles.column]}>
        <View style={styles.leftGroup}>
          <View style={styles.boltBox}>
            <Text style={styles.boltIcon}>⚡</Text>
          </View>
          <View>
            <Text style={[styles.levelEyebrow, dark && { color: C.indigoLight }]}>
              {`Livello Padronanza: ${level}`}
            </Text>
            <Text style={[styles.xpTitle, dark && { color: C.text }]}>
              {`${xp} XP accumulati`}
            </Text>
          </View>
        </View>

        <View style={[styles.badgesRow, isCompact && styles.badgesRowCompact]}>
          <View style={[styles.statBadge, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
            <Text style={[styles.statBadgeText, dark && { color: C.text }]}>
              {`🔥 ${streakDays} Giorni di Serie`}
            </Text>
          </View>
          <View style={[styles.statBadge, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
            <Text style={[styles.statBadgeText, dark && { color: C.text }]}>
              {`🏆 ${nextGoal}`}
            </Text>
          </View>
        </View>
      </View>

      {/* Barra di Padronanza (Mastery) */}
      <View style={styles.masterySection}>
        <View style={styles.masteryHeader}>
          <Text style={[styles.masteryLabel, dark && { color: C.textMuted }]}>
            Padronanza del percorso
          </Text>
          <Text style={[styles.masteryValue, dark && { color: C.indigoLight }]}>
            {`${boundedMastery}%`}
          </Text>
        </View>
        <View style={[styles.progressBarTrack, dark && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[styles.progressBarFill, { width: `${boundedMastery}%` }]} />
        </View>
      </View>

      {/* Contatori Poteri 50/50 e Salta */}
      <View style={[styles.powersRow, dark && { borderTopColor: C.border }]}>
        <Text style={[styles.powersLabel, dark && { color: C.textMuted }]}>I tuoi Poteri:</Text>
        <View style={styles.powerChipsGroup}>
          <View
            style={[
              styles.powerChip,
              poteri.fiftyFifty === 0 && styles.powerChipDisabled,
              dark && { backgroundColor: 'rgba(99,102,241,0.14)', borderColor: '#818cf8' },
            ]}
          >
            <Text style={[styles.powerChipText, dark && { color: '#c7d2fe' }]}>
              {`⚡ 50/50: ${poteri.fiftyFifty}`}
            </Text>
          </View>
          <View
            style={[
              styles.powerChip,
              poteri.salta === 0 && styles.powerChipDisabled,
              dark && { backgroundColor: 'rgba(16,185,129,0.14)', borderColor: '#34d399' },
            ]}
          >
            <Text style={[styles.powerChipText, dark && { color: '#a7f3d0' }]}>
              {`⏭️ Salta: ${poteri.salta}`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    gap: 14,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  column: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  boltBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boltIcon: {
    fontSize: 22,
  },
  levelEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  xpTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgesRowCompact: {
    width: '100%',
    marginTop: 4,
  },
  statBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  masterySection: {
    gap: 6,
  },
  masteryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masteryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  masteryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f46e5',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#4f46e5',
  },
  powersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  powersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  powerChipsGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  powerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  powerChipDisabled: {
    opacity: 0.45,
  },
  powerChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
  },
});
