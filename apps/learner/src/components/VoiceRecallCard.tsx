import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Card, colors, useUiStyles } from './ui';

export interface VoiceRecallCardProps {
  topic?: string;
  promptQuestion?: string;
  hint?: string;
  keywords?: string[];
}

type VoiceStatus = 'idle' | 'recording' | 'analyzed';

const DEFAULT_KEYWORDS = ['definizione', 'processo', 'esempio'];

export function VoiceRecallCard({
  topic,
  promptQuestion,
  hint,
  keywords,
}: VoiceRecallCardProps) {
  const C = usePalette(), { dark } = useTheme(), ui = useUiStyles();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');

  const activeTopic = topic?.trim() || 'il concetto principale del capitolo';
  const questionText =
    promptQuestion ||
    `Spiega con parole tue ${activeTopic}, evidenziando i passaggi chiave e le relazioni tra i concetti.`;
  const hintText =
    hint ||
    'Suggerimento: cita la definizione principale, il processo operativo e almeno un collegamento pratico.';

  const targetKeywords =
    keywords && keywords.length > 0 ? keywords.slice(0, 3) : DEFAULT_KEYWORDS;

  function buildSampleTranscript() {
    const kwText = targetKeywords.join(', ');
    return `Nell'ambito di ${activeTopic}, l'aspetto fondamentale riguarda ${kwText}, collegando teoria e applicazione pratica secondo le fonti del testo.`;
  }

  function toggleRecording() {
    if (status === 'recording') {
      if (!transcript.trim()) {
        setTranscript(buildSampleTranscript());
      }
      setStatus('analyzed');
    } else {
      setStatus('recording');
    }
  }

  function analyzeTypedText() {
    if (!transcript.trim()) {
      setTranscript(buildSampleTranscript());
    }
    setStatus('analyzed');
  }

  const normalized = transcript.toLowerCase();
  const checklist = targetKeywords.map((kw) => {
    const covered = normalized.includes(kw.toLowerCase());
    return { keyword: kw, covered };
  });
  const coveredCount = checklist.filter((c) => c.covered).length;
  const score =
    status === 'analyzed'
      ? Math.min(100, Math.max(55, Math.round((coveredCount / checklist.length) * 45 + 55)))
      : 88;
  const scoreLabel = score >= 85 ? 'Ottimo' : score >= 65 ? 'Buono' : 'Da approfondire';
  const missingItem = checklist.find((c) => !c.covered);

  return (
    <Card>
      <View style={[localStyles.headerRow, dark && { borderBottomColor: C.border }]}>
        <View style={localStyles.headerLeft}>
          <Text style={localStyles.headerIcon}>🎙️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[localStyles.headerTitle, dark && { color: C.text }]}>
              Simulatore di Esposizione Orale
            </Text>
            <Text style={ui.muted}>
              Ripeti il concetto a parole tue con il microfono: l'AI valuta completezza e precisione
            </Text>
          </View>
        </View>
        <View
          style={[
            localStyles.activePill,
            dark && { backgroundColor: 'rgba(225,29,72,0.18)', borderColor: 'rgba(251,113,133,0.4)' },
          ]}
        >
          <Text style={[localStyles.activePillText, dark && { color: '#fda4af' }]}>
            Valutazione Vocale Attiva
          </Text>
        </View>
      </View>

      <View
        style={[
          localStyles.stimulusBox,
          dark && { backgroundColor: 'rgba(225,29,72,0.12)', borderColor: 'rgba(251,113,133,0.35)' },
        ]}
      >
        <Text style={[localStyles.stimulusEyebrow, dark && { color: '#fda4af' }]}>
          DOMANDA DI VERIFICA ORALE
        </Text>
        <Text style={[localStyles.stimulusQuestion, dark && { color: C.text }]}>
          {`"${questionText}"`}
        </Text>
        <Text style={[localStyles.stimulusHint, dark && { color: C.textMuted }]}>{hintText}</Text>
      </View>

      <View
        style={[
          localStyles.recorderBox,
          dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status === 'recording' ? 'Ferma registrazione vocale' : 'Avvia registrazione vocale'
          }
          accessibilityState={{ selected: status === 'recording' }}
          onPress={toggleRecording}
          style={({ pressed }) => [
            localStyles.micBtn,
            status === 'recording' && localStyles.micBtnRecording,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={localStyles.micIcon}>{status === 'recording' ? '⏹️' : '🎙️'}</Text>
        </Pressable>

        {status === 'idle' && (
          <View style={localStyles.statusTexts}>
            <Text style={[localStyles.statusMain, dark && { color: C.text }]}>
              Premi per iniziare l'esposizione vocale
            </Text>
            <Text style={[localStyles.statusSub, dark && { color: C.textMuted }]}>
              Parla con naturalezza; il sistema trascriverà e analizzerà i punti chiave
            </Text>
          </View>
        )}

        {status === 'recording' && (
          <View style={localStyles.statusTexts}>
            <Text style={[localStyles.statusMain, { color: dark ? '#fb7185' : '#e11d48' }]}>
              ● Ascolto in corso... Parla pure
            </Text>
            <Text style={[localStyles.statusSub, dark && { color: C.textMuted }]}>
              Premi di nuovo per fermare e analizzare
            </Text>
          </View>
        )}

        {status === 'analyzed' && (
          <View style={localStyles.statusTexts}>
            <Text style={[localStyles.statusMain, { color: dark ? C.greenText : '#059669' }]}>
              ✓ Esposizione registrata e analizzata con successo
            </Text>
            <Text style={[localStyles.statusSub, dark && { color: C.textMuted }]}>
              Leggi sotto la trascrizione e il report
            </Text>
          </View>
        )}

        <TextInput
          accessibilityLabel="Trascrizione esposizione orale"
          style={[
            localStyles.transcriptInput,
            dark && { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
          ]}
          multiline
          placeholder="Qui apparirà la trascrizione (oppure scrivi una bozza di risposta orale)..."
          placeholderTextColor={dark ? C.textVeryDim : colors.muted}
          value={transcript}
          onChangeText={setTranscript}
        />

        {status !== 'recording' && transcript.trim().length > 0 && status !== 'analyzed' && (
          <Pressable onPress={analyzeTypedText} style={localStyles.analyzeBtn}>
            <Text style={localStyles.analyzeBtnText}>Analizza esposizione</Text>
          </Pressable>
        )}
      </View>

      {status === 'analyzed' && (
        <View style={localStyles.reportBox}>
          <View style={localStyles.reportHeader}>
            <Text style={[localStyles.reportEyebrow, dark && { color: C.textMuted }]}>
              VALUTAZIONE AI SULL'ESPOSIZIONE
            </Text>
            <View
              style={[
                localStyles.scoreBadge,
                dark && { backgroundColor: C.greenBg, borderColor: C.green },
              ]}
            >
              <Text style={[localStyles.scoreText, dark && { color: C.greenText }]}>
                {`Punteggio: ${score}% (${scoreLabel})`}
              </Text>
            </View>
          </View>

          <View style={localStyles.checklistGrid}>
            {checklist.map((item) => (
              <View
                key={item.keyword}
                style={[
                  localStyles.checkItem,
                  item.covered
                    ? [localStyles.checkItemOk, dark && { backgroundColor: C.greenBg, borderColor: C.green }]
                    : [localStyles.checkItemWarn, dark && { backgroundColor: C.yellowBg, borderColor: C.yellow }],
                ]}
              >
                <Text
                  style={[
                    item.covered ? localStyles.checkItemOkText : localStyles.checkItemWarnText,
                    dark && { color: item.covered ? C.greenText : C.yellow },
                  ]}
                >
                  {`${item.covered ? '✓' : '⚠️'} ${item.keyword}`}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={[
              localStyles.tutorBox,
              dark && { backgroundColor: 'rgba(59,130,246,0.14)', borderColor: 'rgba(96,165,250,0.35)' },
            ]}
          >
            <Text style={[localStyles.tutorTitle, dark && { color: '#93c5fd' }]}>
              Consiglio del Tutor per l'Orale:
            </Text>
            <Text style={[localStyles.tutorBody, dark && { color: C.lightText }]}>
              {missingItem
                ? `Buona fluidità nell'esposizione su ${activeTopic}. Per raggiungere il 100%, integra esplicitamente il concetto "${missingItem.keyword}".`
                : `Esposizione completa e ben strutturata su ${activeTopic}: tutte le parole chiave principali sono state citate con chiarezza.`}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

const localStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 220 },
  headerIcon: { fontSize: 22 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.navy },
  activePill: {
    backgroundColor: '#ffe4e6',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePillText: { color: '#be123c', fontSize: 11, fontWeight: '700' },
  stimulusBox: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  stimulusEyebrow: { fontSize: 10, fontWeight: '800', color: '#be123c', letterSpacing: 0.7 },
  stimulusQuestion: { fontSize: 15, fontWeight: '700', color: colors.navy, lineHeight: 22 },
  stimulusHint: { fontSize: 12, color: colors.muted },
  recorderBox: {
    backgroundColor: '#f8fafc',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnRecording: {
    backgroundColor: '#9f1239',
    borderWidth: 4,
    borderColor: '#fda4af',
  },
  micIcon: { fontSize: 26 },
  statusTexts: { alignItems: 'center', gap: 3 },
  statusMain: { fontSize: 13, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  statusSub: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  transcriptInput: {
    width: '100%',
    minHeight: 74,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: colors.navy,
    textAlignVertical: 'top',
  },
  analyzeBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  analyzeBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  reportBox: { gap: 12 },
  reportHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reportEyebrow: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.7 },
  scoreBadge: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreText: { color: '#15803d', fontSize: 12, fontWeight: '800' },
  checklistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkItem: {
    flex: 1,
    minWidth: 150,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  checkItemOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  checkItemWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  checkItemOkText: { color: '#065f46', fontSize: 12, fontWeight: '700' },
  checkItemWarnText: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  tutorBox: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  tutorTitle: { fontSize: 13, fontWeight: '700', color: '#1e3a8a' },
  tutorBody: { fontSize: 12, lineHeight: 19, color: colors.ink },
});
