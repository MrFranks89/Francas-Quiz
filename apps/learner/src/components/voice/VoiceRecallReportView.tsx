import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { VoiceRecallReport } from './types';

export interface VoiceRecallReportViewProps {
  report: VoiceRecallReport;
  onRetry: () => void;
}

export function VoiceRecallReportView({ report, onRetry }: VoiceRecallReportViewProps) {
  const C = usePalette(), { dark } = useTheme();

  const scoreLabel =
    report.score >= 85 ? 'Ottimo' : report.score >= 65 ? 'Buono' : 'Da approfondire';

  return (
    <View style={[styles.box, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
      {/* Testata del report */}
      <View style={styles.topRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.reportIcon}>📊</Text>
          <View>
            <Text style={[styles.title, dark && { color: C.text }]}>
              Esposizione registrata e analizzata
            </Text>
            <Text style={[styles.scoreText, dark && { color: C.indigoLight }]}>
              {`Punteggio: ${report.score}/100 (${scoreLabel})`}
            </Text>
          </View>
        </View>
        <View style={[styles.badge, report.score >= 65 ? styles.badgeGood : styles.badgeWarn]}>
          <Text style={[styles.badgeText, report.score >= 65 ? styles.badgeTextGood : styles.badgeTextWarn]}>
            {scoreLabel}
          </Text>
        </View>
      </View>

      {/* Trascrizione */}
      {!!report.transcript && (
        <View style={[styles.sectionBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, dark && { color: C.indigoLight }]}>Trascrizione rilevata:</Text>
          <Text style={[styles.transcriptText, dark && { color: C.text }]}>
            {`"${report.transcript}"`}
          </Text>
        </View>
      )}

      {/* Checklist punti chiave coperti e mancanti */}
      <View style={[styles.sectionBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
        <Text style={[styles.sectionTitle, dark && { color: C.indigoLight }]}>Verifica Concetti Chiave:</Text>
        <View style={styles.checklist}>
          {report.covered.map((item, idx) => (
            <View key={`cov-${idx}`} style={styles.checkRow}>
              <Text style={styles.iconGood}>✓</Text>
              <Text style={[styles.checkText, dark && { color: C.text }]}>
                {`${item} (trattato chiaramente)`}
              </Text>
            </View>
          ))}
          {report.missing.map((item, idx) => (
            <View key={`miss-${idx}`} style={styles.checkRow}>
              <Text style={styles.iconWarn}>✗</Text>
              <Text style={[styles.checkTextMissing, dark && { color: C.textMuted }]}>
                {`${item} (mancante o poco approfondito)`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Consiglio del Tutor */}
      <View style={[styles.adviceBox, dark && { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#818cf8' }]}>
        <Text style={[styles.adviceTitle, dark && { color: C.indigoLight }]}>💡 Consiglio del Tutor:</Text>
        <Text style={[styles.adviceBody, dark && { color: C.text }]}>{report.advice}</Text>
      </View>

      {/* Pulsante riprova */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Riprova esposizione"
        onPress={onRetry}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>Riprova esposizione orale</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 14,
    marginTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  reportIcon: {
    fontSize: 26,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4f46e5',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeGood: {
    backgroundColor: '#ecfdf5',
  },
  badgeWarn: {
    backgroundColor: '#fef3c7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeTextGood: {
    color: '#059669',
  },
  badgeTextWarn: {
    color: '#d97706',
  },
  sectionBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcriptText: {
    fontSize: 13,
    color: '#334155',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  checklist: {
    gap: 6,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconGood: {
    color: '#10b981',
    fontWeight: '900',
    fontSize: 14,
  },
  iconWarn: {
    color: '#ef4444',
    fontWeight: '900',
    fontSize: 14,
  },
  checkText: {
    fontSize: 13,
    color: '#1e293b',
  },
  checkTextMissing: {
    fontSize: 13,
    color: '#64748b',
  },
  adviceBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    gap: 4,
  },
  adviceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4338ca',
  },
  adviceBody: {
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
