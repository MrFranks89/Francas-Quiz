import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';

export interface GameEndCardProps {
  icon: string;
  title: string;
  desc: string;
  scoreText: string;
  previousRecordText: string;
  isNewRecord: boolean;
  newRecordBadgeText: string;
  xpGained: number;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function GameEndCard({
  icon,
  title,
  desc,
  scoreText,
  previousRecordText,
  isNewRecord,
  newRecordBadgeText,
  xpGained,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: GameEndCardProps) {
  const C = usePalette(), { dark } = useTheme();

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, dark && { color: C.text }]}>{title}</Text>
      <Text style={[styles.desc, dark && { color: C.textMuted }]}>{desc}</Text>

      <View style={[styles.statsCard, dark && { backgroundColor: C.surfaceHover }]}>
        <Text style={[styles.statsValue, dark && { color: C.text }]}>{scoreText}</Text>
        <Text style={[styles.statsSub, dark && { color: C.textMuted }]}>{previousRecordText}</Text>
        {isNewRecord && (
          <View style={styles.newRecordBadge}>
            <Text style={styles.newRecordText}>{newRecordBadgeText}</Text>
          </View>
        )}
        <Text style={styles.xpGainedText}>{`+${xpGained} XP guadagnati`}</Text>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryActionLabel}
          onPress={onPrimaryAction}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
        </Pressable>

        {secondaryActionLabel && onSecondaryAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryActionLabel}
            onPress={onSecondaryAction}
            style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
          >
            <Text style={[styles.secondaryBtnText, dark && { color: C.text }]}>{secondaryActionLabel}</Text>
          </Pressable>
        )}
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
    alignItems: 'center',
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  statsCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    gap: 6,
  },
  statsValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  statsSub: {
    fontSize: 13,
    color: '#64748b',
  },
  newRecordBadge: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  newRecordText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
  },
  xpGainedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10b981',
    marginTop: 4,
  },
  actionsRow: {
    width: '100%',
    gap: 8,
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
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
});
