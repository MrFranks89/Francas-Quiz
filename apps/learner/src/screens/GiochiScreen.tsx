import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { GamificationCard } from '../components/GamificationCard';
import { VoiceRecallCard } from '../components/VoiceRecallCard';
import { colors } from '../components/ui';

export interface GiochiScreenProps {
  onNavigateDuels?: () => void;
  onNavigateReferral?: () => void;
}

export function GiochiScreen({
  onNavigateDuels,
  onNavigateReferral,
}: GiochiScreenProps) {
  const C = usePalette(),
    { dark } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.badge, dark && { backgroundColor: 'rgba(234,179,8,0.16)', borderColor: 'rgba(234,179,8,0.35)' }]}>
          <Text style={[styles.badgeText, dark && { color: '#fde047' }]}>⚡ Allenamento & Sfide</Text>
        </View>
        <Text style={[styles.title, dark && { color: C.text }]}>
          Giochi & Ripasso Dinamico
        </Text>
        <Text style={[styles.subtitle, dark && { color: C.textMuted }]}>
          Metti alla prova la tua memoria a lungo termine, scala i livelli di padronanza e sfida i colleghi con quiz a tempo e flashcard intelligenti.
        </Text>
      </View>

      <GamificationCard
        topicHint="Ripasso Generale"
        onNavigateDuels={onNavigateDuels}
        onNavigateReferral={onNavigateReferral}
      />

      <VoiceRecallCard
        topic="Esposizione Orale & Coach"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
    width: '100%',
  },
  header: {
    gap: 8,
    marginBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef9c3',
    borderColor: '#fde047',
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#854d0e',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.navy,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
});
