import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { colors } from '../ui';
import type { VoiceMode, VoiceStatus } from './types';

export interface VoiceRecorderBoxProps {
  mode: VoiceMode;
  status: VoiceStatus;
  elapsedSeconds: number;
  transcript: string;
  recordedUri: string | null;
  isPlayingAudio: boolean;
  onToggleRecording: () => void;
  onChangeTranscript: (text: string) => void;
  onAnalyzeText: () => void;
  onTogglePlayAudio: () => void;
}

export function VoiceRecorderBox({
  mode,
  status,
  elapsedSeconds,
  transcript,
  recordedUri,
  isPlayingAudio,
  onToggleRecording,
  onChangeTranscript,
  onAnalyzeText,
  onTogglePlayAudio,
}: VoiceRecorderBoxProps) {
  const C = usePalette(), { dark } = useTheme();

  function formatTime(totalSec: number) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  const isWarningTime = elapsedSeconds >= 270;

  return (
    <View
      style={[
        styles.recorderBox,
        dark && { backgroundColor: C.surfaceDark, borderColor: C.border },
      ]}
    >
      {mode === 'voice' ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              status === 'recording' ? 'Ferma registrazione vocale' : 'Avvia registrazione vocale'
            }
            accessibilityState={{ selected: status === 'recording' }}
            onPress={onToggleRecording}
            style={({ pressed }) => [
              styles.micBtn,
              status === 'recording' && styles.micBtnRecording,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.micIcon}>{status === 'recording' ? '⏹️' : '🎙️'}</Text>
          </Pressable>

          {status === 'idle' && (
            <View style={styles.statusTexts}>
              <Text style={[styles.statusMain, dark && { color: C.text }]}>
                Premi per iniziare l'esposizione vocale
              </Text>
              <Text style={[styles.statusSub, dark && { color: C.textMuted }]}>
                Limite massimo: 5 minuti. L'AI analizzerà i concetti chiave trattati.
              </Text>
            </View>
          )}

          {status === 'recording' && (
            <View style={styles.statusTexts}>
              <Text style={[styles.statusMain, { color: dark ? '#fb7185' : '#e11d48' }]}>
                ● Ascolto in corso... Parla pure ({formatTime(elapsedSeconds)} / 5:00)
              </Text>
              {isWarningTime && (
                <Text style={styles.warnNotice}>
                  ⚠️ Mancano meno di 30 secondi alla fine della registrazione!
                </Text>
              )}
              <Text style={[styles.statusSub, dark && { color: C.textMuted }]}>
                Premi il pulsante per fermare e avviare l'analisi del tutor
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={{ width: '100%', gap: 10 }}>
          <Text style={[styles.statusMain, dark && { color: C.text }, { textAlign: 'left' }]}>
            Scrivi la tua esposizione per esteso:
          </Text>
          <TextInput
            accessibilityLabel="Trascrizione esposizione orale"
            style={[
              styles.transcriptInput,
              dark && { backgroundColor: C.inputBg, borderColor: C.border, color: C.text },
            ]}
            multiline
            placeholder="Digita qui la risposta o sintesi del concetto..."
            placeholderTextColor={dark ? C.textVeryDim : colors.muted}
            value={transcript}
            onChangeText={onChangeTranscript}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invia per valutazione"
            onPress={onAnalyzeText}
            style={styles.analyzeBtn}
          >
            <Text style={styles.analyzeBtnText}>Invia per valutazione</Text>
          </Pressable>
        </View>
      )}

      {recordedUri && (
        <View style={[styles.playerRow, dark && { backgroundColor: C.surfaceHover }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlayingAudio ? 'Ferma riascolto' : 'Riascolta registrazione'}
            onPress={onTogglePlayAudio}
            style={styles.playBtn}
          >
            <Text style={styles.playBtnText}>{isPlayingAudio ? '⏹️ Stop' : '▶️ Riascolta'}</Text>
          </Pressable>
          <Text style={[styles.playerLabel, dark && { color: C.text }]}>
            {isPlayingAudio ? 'Riproduzione in corso...' : 'Audio registrato pronto'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recorderBox: {
    backgroundColor: '#f8fafc',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  micBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnRecording: {
    backgroundColor: '#9f1239',
    borderWidth: 4,
    borderColor: '#fda4af',
  },
  micIcon: { fontSize: 28 },
  statusTexts: { alignItems: 'center', gap: 4 },
  statusMain: { fontSize: 13, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  statusSub: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  warnNotice: { fontSize: 12, fontWeight: '800', color: '#d97706', textAlign: 'center' },
  transcriptInput: {
    width: '100%',
    minHeight: 84,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  analyzeBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f1f5f9',
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    width: '100%',
  },
  playBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  playBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  playerLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
});
