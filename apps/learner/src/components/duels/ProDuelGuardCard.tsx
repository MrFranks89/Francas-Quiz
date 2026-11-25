import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type ProDuelGuardCardProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';

export function ProDuelGuardCard({
  onUpgradePro,
  onLearnMore,
}: ProDuelGuardCardProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>⚔️</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{DUELS_MICROCOPY['guard.proBadge']}</Text>
        </View>
      </View>

      <Text style={[styles.title, dark && { color: C.text }]}>{DUELS_MICROCOPY['guard.title']}</Text>
      <Text style={[styles.desc, dark && { color: C.textMuted }]}>
        {DUELS_MICROCOPY['guard.description']}
      </Text>

      <View style={styles.featuresList}>
        <View style={styles.featureItem}>
          <Text style={styles.bullet}>🎯</Text>
          <Text style={[styles.featureText, dark && { color: C.text }]}>
            Domande estratte direttamente dai tuoi corsi senza costi aggiuntivi
          </Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.bullet}>⏳</Text>
          <Text style={[styles.featureText, dark && { color: C.text }]}>
            Modalità asincrona con 72 ore di tempo per ciascun partecipante
          </Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.bullet}>📊</Text>
          <Text style={[styles.featureText, dark && { color: C.text }]}>
            Confronto a due colonne su precisione e velocità con bonus XP
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        {onUpgradePro && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
            onPress={onUpgradePro}
            accessibilityRole="button"
            accessibilityLabel="Passa alla versione Pro per sbloccare i duelli"
          >
            <Text style={styles.primaryBtnText}>{DUELS_MICROCOPY['guard.ctaUpgrade']}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.noteText, dark && { color: C.textMuted }]}>
        {DUELS_MICROCOPY['guard.note']}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 22,
  },
  badge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4b5563',
    marginBottom: 16,
  },
  featuresList: {
    gap: 10,
    marginBottom: 18,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bullet: {
    fontSize: 16,
  },
  featureText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    lineHeight: 18,
  },
  actionsRow: {
    marginBottom: 12,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  noteText: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
  },
});
