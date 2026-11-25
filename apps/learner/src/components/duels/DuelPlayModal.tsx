import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type DuelPlayModalProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';

export function DuelPlayModal({
  visible,
  duelloId,
  titoloCorso,
  playData,
  onClose,
  onSubmit,
}: DuelPlayModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const domande = playData?.domande || [];
  const totalQuestions = domande.length;
  const maxSeconds = playData?.tempo_max_giocata_s || 900;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoices, setSelectedChoices] = useState<Record<string, number | null>>({});
  const [questionElapsedMs, setQuestionElapsedMs] = useState<Record<string, number>>({});
  const [secondsRemaining, setSecondsRemaining] = useState(maxSeconds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questionStartTimeRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  // Inizializza o resetta la prova
  useEffect(() => {
    if (visible && playData) {
      setCurrentIndex(0);
      setSelectedChoices({});
      setQuestionElapsedMs({});
      setSecondsRemaining(maxSeconds);
      setSubmitting(false);
      setError(null);
      questionStartTimeRef.current = Date.now();

      timerIntervalRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [visible, playData]);

  const currentQuestion = domande[currentIndex];

  const handleSelectOption = (optionIndex: number) => {
    if (!currentQuestion) return;
    setSelectedChoices((prev) => ({
      ...prev,
      [currentQuestion.domanda_id]: optionIndex,
    }));
  };

  const recordCurrentQuestionTime = () => {
    if (!currentQuestion) return;
    const elapsed = Date.now() - questionStartTimeRef.current;
    setQuestionElapsedMs((prev) => ({
      ...prev,
      [currentQuestion.domanda_id]: (prev[currentQuestion.domanda_id] || 0) + elapsed,
    }));
    questionStartTimeRef.current = Date.now();
  };

  const handleNext = () => {
    recordCurrentQuestionTime();
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    recordCurrentQuestionTime();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleFinalSubmit = async () => {
    recordCurrentQuestionTime();
    setSubmitting(true);
    setError(null);

    const risposte = domande.map((q) => ({
      domanda_id: q.domanda_id,
      scelta: selectedChoices[q.domanda_id] !== undefined ? selectedChoices[q.domanda_id] : null,
      ms: Math.min(600000, Math.max(0, questionElapsedMs[q.domanda_id] || 1000)),
    }));

    try {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      await onSubmit(duelloId, risposte);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Errore durante la consegna del duello.');
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = () => {
    handleFinalSubmit();
  };

  if (!visible || !currentQuestion) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const isTimeCritical = secondsRemaining < 60;
  const currentChoice = selectedChoices[currentQuestion.domanda_id];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={() => {}}>
      <View style={[styles.screen, dark && { backgroundColor: C.bg }]}>
        {/* TOP BAR CON PROGRESSO E TIMER */}
        <View style={[styles.topBar, dark && { backgroundColor: C.surfaceDark, borderBottomColor: C.border }]}>
          <View style={styles.topBarLeft}>
            <Text style={[styles.courseHeading, dark && { color: C.text }]} numberOfLines={1}>
              {titoloCorso}
            </Text>
            <Text style={[styles.progressLabel, dark && { color: C.textMuted }]}>
              {DUELS_MICROCOPY['play.questionProgress'](currentIndex + 1, totalQuestions)}
            </Text>
          </View>
          <View style={[styles.timerBadge, isTimeCritical && styles.timerCritical]}>
            <Text style={styles.timerIcon}>⏱️</Text>
            <Text style={[styles.timerText, isTimeCritical && styles.timerTextCritical]}>
              {timeFormatted}
            </Text>
          </View>
        </View>

        {/* DOMANDA CORRENTE */}
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={[styles.questionCard, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
            <Text style={[styles.questionText, dark && { color: C.text }]}>
              {currentQuestion.testo}
            </Text>
          </View>

          {/* OPZIONI */}
          <View style={styles.optionsList}>
            {currentQuestion.opzioni.map((opz, idx) => {
              const isSelected = currentChoice === idx;
              return (
                <TouchableOpacity
                  key={`opt-${idx}`}
                  style={[
                    styles.optionItem,
                    isSelected && { borderColor: primaryColor, backgroundColor: dark ? C.surfaceHover : '#eff6ff' },
                    dark && !isSelected && { backgroundColor: C.surfaceDark, borderColor: C.border },
                  ]}
                  onPress={() => handleSelectOption(idx)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.optionBullet, isSelected && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                    <Text style={[styles.optionLetter, isSelected && { color: '#ffffff' }]}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && { color: primaryColor, fontWeight: '700' },
                      dark && !isSelected && { color: C.text },
                    ]}
                  >
                    {opz}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* FOOTER CON NAVIGAZIONE / CONSEGNA */}
        <View style={[styles.footer, dark && { backgroundColor: C.surfaceDark, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
            onPress={handlePrev}
            disabled={currentIndex === 0 || submitting}
            accessibilityRole="button"
          >
            <Text style={styles.navBtnText}>‹ Precedente</Text>
          </TouchableOpacity>

          {currentIndex < totalQuestions - 1 ? (
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: primaryColor }]}
              onPress={handleNext}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Prossima Domanda"
            >
              <Text style={styles.primaryActionText}>{DUELS_MICROCOPY['play.ctaNext']} ›</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: '#059669' }]}
              onPress={handleFinalSubmit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Consegna Prova"
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryActionText}>{DUELS_MICROCOPY['play.ctaSubmit']}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  topBarLeft: {
    flex: 1,
    gap: 2,
  },
  courseHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  progressLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  timerCritical: {
    backgroundColor: '#fee2e2',
  },
  timerIcon: {
    fontSize: 14,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  timerTextCritical: {
    color: '#dc2626',
  },
  body: {
    padding: 20,
    gap: 16,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
  },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  questionText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: '#111827',
  },
  optionsList: {
    gap: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    minHeight: 52,
  },
  optionBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#9ca3af',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLetter: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4b5563',
  },
  optionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1f2937',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  navBtn: {
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  primaryActionBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
