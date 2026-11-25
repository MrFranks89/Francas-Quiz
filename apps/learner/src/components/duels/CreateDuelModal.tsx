import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { type CreateDuelModalProps } from './types';
import { DUELS_MICROCOPY } from './microcopy';
import { createDuel } from '../../api/duels';

export function CreateDuelModal({
  visible,
  courses,
  onClose,
  onDuelCreated,
}: CreateDuelModalProps) {
  const C = usePalette(), { dark } = useTheme();
  const primaryColor = C.indigoLight || '#4f46e5';

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    courses[0]?.extraction_id || '',
  );
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdDuelId, setCreatedDuelId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = () => {
    setError(null);
    setCreatedCode(null);
    setCreatedDuelId(null);
    setCopied(false);
    setLoading(false);
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedCourseId) {
      setError('Seleziona un corso per generare il duello.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createDuel({
        extraction_id: selectedCourseId,
        n_domande: questionCount,
      });
      setCreatedCode(res.codice_invito);
      setCreatedDuelId(res.duello_id);
      onDuelCreated(res.duello_id, res.codice_invito);
    } catch (e: any) {
      setError(e.message || 'Impossibile creare il duello.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdCode) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(createdCode);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleReset}>
      <View style={styles.overlay}>
        <View style={[styles.container, dark && { backgroundColor: C.surfaceDark, borderColor: C.border }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, dark && { color: C.text }]}>
              {createdCode ? DUELS_MICROCOPY['create.successTitle'] : DUELS_MICROCOPY['create.title']}
            </Text>
            <TouchableOpacity
              onPress={handleReset}
              accessibilityRole="button"
              accessibilityLabel="Chiudi modale creazione duello"
              style={styles.closeBtn}
            >
              <Text style={[styles.closeBtnText, dark && { color: C.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {createdCode ? (
              <View style={styles.successSection}>
                <Text style={styles.trophyIcon}>⚔️</Text>
                <Text style={[styles.successSubtitle, dark && { color: C.textMuted }]}>
                  {DUELS_MICROCOPY['create.successSubtitle']}
                </Text>

                <View style={[styles.codeBox, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}>
                  <Text style={[styles.codeDisplay, { color: primaryColor }]}>{createdCode}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
                  onPress={handleCopyCode}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryBtnText}>
                    {copied ? '✓ Codice Copiato!' : DUELS_MICROCOPY['create.ctaCopyCode']}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryBtn, dark && { backgroundColor: C.surfaceHover, borderColor: C.border }]}
                  onPress={handleReset}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryBtnText, dark && { color: C.text }]}>
                    {DUELS_MICROCOPY['create.ctaDone']}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formSection}>
                {error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <Text style={[styles.fieldLabel, dark && { color: C.text }]}>
                  {DUELS_MICROCOPY['create.selectCourse']}
                </Text>
                <View style={styles.coursesList}>
                  {courses.length === 0 ? (
                    <Text style={[styles.noCoursesText, dark && { color: C.textMuted }]}>
                      Nessun corso disponibile. Carica prima un documento per creare un duello.
                    </Text>
                  ) : (
                    courses.map((c) => {
                      const isSelected = selectedCourseId === c.extraction_id;
                      return (
                        <TouchableOpacity
                          key={c.extraction_id}
                          style={[
                            styles.courseOption,
                            isSelected && { borderColor: primaryColor, backgroundColor: dark ? C.surfaceHover : '#eff6ff' },
                            dark && !isSelected && { backgroundColor: C.surfaceHover, borderColor: C.border },
                          ]}
                          onPress={() => setSelectedCourseId(c.extraction_id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[
                              styles.courseOptionTitle,
                              isSelected && { color: primaryColor, fontWeight: '700' },
                              dark && !isSelected && { color: C.text },
                            ]}
                          >
                            {c.title}
                          </Text>
                          <Text style={[styles.courseOptionMeta, dark && { color: C.textMuted }]}>
                            {c.questionCount} domande disponibili
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                <Text style={[styles.fieldLabel, dark && { color: C.text }]}>
                  {DUELS_MICROCOPY['create.selectQuestions'](questionCount)}
                </Text>
                <View style={styles.questionButtonsRow}>
                  {[5, 10, 15, 20].map((num) => {
                    const isSelected = questionCount === num;
                    return (
                      <TouchableOpacity
                        key={num}
                        style={[
                          styles.countBtn,
                          isSelected && { backgroundColor: primaryColor, borderColor: primaryColor },
                          dark && !isSelected && { backgroundColor: C.surfaceHover, borderColor: C.border },
                        ]}
                        onPress={() => setQuestionCount(num)}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.countBtnText,
                            isSelected ? { color: '#ffffff' } : dark ? { color: C.text } : { color: '#374151' },
                          ]}
                        >
                          {num}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: primaryColor, marginTop: 12 }]}
                  onPress={handleCreate}
                  disabled={loading || courses.length === 0}
                  accessibilityRole="button"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{DUELS_MICROCOPY['create.ctaGenerate']}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '600',
  },
  body: {
    padding: 20,
  },
  formSection: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  coursesList: {
    gap: 8,
    marginBottom: 6,
  },
  courseOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  courseOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  courseOptionMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  noCoursesText: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  questionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBtnText: {
    fontSize: 15,
    fontWeight: '700',
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
  secondaryBtn: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    marginTop: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  successSection: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  trophyIcon: {
    fontSize: 48,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 20,
  },
  codeBox: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    marginVertical: 6,
  },
  codeDisplay: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
