import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';

export function ProModesCard() {
  const C = usePalette(), { dark } = useTheme();

  return (
    <View style={[styles.card, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>⚔️</Text>
        </View>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>IN ARRIVO · PRO</Text>
        </View>
      </View>

      <Text style={[styles.title, dark && { color: C.text }]}>
        Modalità di Gruppo & Sfide tra Colleghi
      </Text>

      <Text style={[styles.desc, dark && { color: C.textMuted }]}>
        La cooperazione e la competizione didattica arrivano nella versione Pro con infrastruttura multi-utente:
      </Text>

      <View style={styles.featuresList}>
        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>👑</Text>
          <View style={styles.featureTexts}>
            <Text style={[styles.featureTitle, dark && { color: C.text }]}>Live Arena</Text>
            <Text style={[styles.featureDesc, dark && { color: C.textMuted }]}>
              Sfide in tempo reale fino a 20 partecipanti con classifica live.
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>🐉</Text>
          <View style={styles.featureTexts}>
            <Text style={[styles.featureTitle, dark && { color: C.text }]}>Boss Fight Cooperativo</Text>
            <Text style={[styles.featureDesc, dark && { color: C.textMuted }]}>
              Tutti contro l'esame: sconfiggete il boss rispondendo insieme.
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>🥊</Text>
          <View style={styles.featureTexts}>
            <Text style={[styles.featureTitle, dark && { color: C.text }]}>Duello Asincrono</Text>
            <Text style={[styles.featureDesc, dark && { color: C.textMuted }]}>
              Lancia una sfida a un collega con scadenza 24 ore.
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>🎁</Text>
          <View style={styles.featureTexts}>
            <Text style={[styles.featureTitle, dark && { color: C.text }]}>Invita un Amico</Text>
            <Text style={[styles.featureDesc, dark && { color: C.textMuted }]}>
              Invita un collega: al suo accesso ottieni +1 documento/corso caricabile.
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.disabledNotice, dark && { backgroundColor: C.surfaceHover }]}>
        <Text style={[styles.disabledNoticeText, dark && { color: C.textMuted }]}>
          🔒 Funzionalità riservate all'abilitazione del modulo Pro & Cloud Sync.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    gap: 12,
    marginTop: 8,
    opacity: 0.9,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  proBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  desc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  featuresList: {
    gap: 10,
    marginTop: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureBullet: {
    fontSize: 18,
    marginTop: 1,
  },
  featureTexts: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  disabledNotice: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  disabledNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
});
