import React, { useState, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { Card, colors, useUiStyles } from './ui';
import type { VoiceMode, VoiceStatus, VoiceRecallReport } from './voice/types';
import { VoiceRecorderBox } from './voice/VoiceRecorderBox';
import { VoiceRecallReportView } from './voice/VoiceRecallReportView';
import { evaluateLocalTranscript } from './voice/evaluateLocal';
import { postVoiceRecall } from '../api/voiceRecall';

export interface VoiceRecallCardProps {
  topic?: string;
  promptQuestion?: string;
  hint?: string;
  keywords?: string[];
  extractionId?: string;
  branchId?: string;
  nodeId?: string;
  onReportGenerated?: (report: VoiceRecallReport) => void;
  onRecordingComplete?: (audioUri: string) => void;
}

const DEFAULT_KEYWORDS = ['definizione', 'processo', 'esempio'];
const MAX_RECORDING_SECONDS = 300;

export function VoiceRecallCard({
  topic,
  promptQuestion,
  hint,
  keywords,
  extractionId,
  branchId,
  nodeId,
  onReportGenerated,
  onRecordingComplete,
}: VoiceRecallCardProps) {
  const C = usePalette(), { dark } = useTheme(), ui = useUiStyles();

  const [mode, setMode] = useState<VoiceMode>('voice');
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [report, setReport] = useState<VoiceRecallReport | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const activeTopic = topic?.trim() || 'il concetto principale del capitolo';
  const questionText =
    promptQuestion ||
    `Spiega con parole tue ${activeTopic}, evidenziando i passaggi chiave e le relazioni tra i concetti.`;
  const hintText =
    hint ||
    'Suggerimento: cita la definizione principale, il processo operativo e almeno un collegamento pratico.';
  const targetKeywords =
    keywords && keywords.length > 0 ? keywords.slice(0, 4) : DEFAULT_KEYWORDS;

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  function evaluateTranscript(rawText: string): VoiceRecallReport {
    return evaluateLocalTranscript(rawText, targetKeywords, activeTopic);
  }

  async function startRecording() {
    setPermissionError(null);
    setStatus('recording');
    setElapsedSeconds(0);
    setRecordedUri(null);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
        return next;
      });
    }, 1000);

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm?.granted) {
        setPermissionError('Permesso microfono non concesso. Modalità digitazione attiva.');
        setMode('text');
        setStatus('idle');
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      if (typeof recorder.prepareToRecordAsync === 'function') {
        await recorder.prepareToRecordAsync();
      }
      recorder.record();
    } catch {
      setPermissionError('Impossibile accedere al microfono. Passaggio a modalità testo.');
      setMode('text');
      setStatus('idle');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  async function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      void recorder.stop();
    } catch {
      // Ignora errori stop
    }

    const uri = recorder.uri || 'file:///mock-audio.m4a';
    setRecordedUri(uri);
    onRecordingComplete?.(uri);

    if (extractionId) {
      try {
        let audioParam: any;
        if (typeof window !== 'undefined' && uri.startsWith('blob:')) {
          const blob = await fetch(uri).then((r) => r.blob());
          audioParam = blob;
        } else {
          audioParam = { uri, name: 'recording.m4a', type: 'audio/m4a' };
        }
        const apiRes = await postVoiceRecall(extractionId, {
          audio: audioParam,
          nodeId,
          branchId,
        });
        const rep: VoiceRecallReport = {
          score: apiRes.score,
          transcript: apiRes.transcript,
          covered: apiRes.covered,
          missing: apiRes.missing,
          advice: apiRes.advice,
        };
        setTranscript(apiRes.transcript);
        setReport(rep);
        setStatus('analyzed');
        onReportGenerated?.(rep);
        return;
      } catch {
        // Fallback locale
      }
    }

    const generated = evaluateTranscript(transcript);
    setTranscript(generated.transcript);
    setReport(generated);
    setStatus('analyzed');
    onReportGenerated?.(generated);
  }

  async function handleAnalyzeText() {
    if (extractionId && transcript.trim()) {
      try {
        const apiRes = await postVoiceRecall(extractionId, {
          text: transcript.trim(),
          nodeId,
          branchId,
        });
        const rep: VoiceRecallReport = {
          score: apiRes.score,
          transcript: apiRes.transcript,
          covered: apiRes.covered,
          missing: apiRes.missing,
          advice: apiRes.advice,
        };
        setTranscript(apiRes.transcript);
        setReport(rep);
        setStatus('analyzed');
        onReportGenerated?.(rep);
        return;
      } catch {
        // Fallback locale
      }
    }

    const generated = evaluateTranscript(transcript);
    setTranscript(generated.transcript);
    setReport(generated);
    setStatus('analyzed');
    onReportGenerated?.(generated);
  }

  function handleRetry() {
    setStatus('idle');
    setTranscript('');
    setReport(null);
    setRecordedUri(null);
    setElapsedSeconds(0);
    setIsPlayingAudio(false);
  }

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
              Ripeti a parole tue con microfono o testo: l'AI valuta completezza e chiarezza
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

      {status !== 'analyzed' && (
        <View style={localStyles.modeTabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Modalità Microfono"
            onPress={() => setMode('voice')}
            style={[
              localStyles.modeTab,
              mode === 'voice' && localStyles.modeTabActive,
              dark && { borderColor: C.border },
              mode === 'voice' && dark && { backgroundColor: C.surfaceHover },
            ]}
          >
            <Text
              style={[
                localStyles.modeTabText,
                mode === 'voice' && localStyles.modeTabTextActive,
                dark && mode !== 'voice' && { color: C.textMuted },
              ]}
            >
              🎙️ Microfono
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Modalità Digita esposizione"
            onPress={() => setMode('text')}
            style={[
              localStyles.modeTab,
              mode === 'text' && localStyles.modeTabActive,
              dark && { borderColor: C.border },
              mode === 'text' && dark && { backgroundColor: C.surfaceHover },
            ]}
          >
            <Text
              style={[
                localStyles.modeTabText,
                mode === 'text' && localStyles.modeTabTextActive,
                dark && mode !== 'text' && { color: C.textMuted },
              ]}
            >
              ✍️ Digita esposizione
            </Text>
          </Pressable>
        </View>
      )}

      {!!permissionError && (
        <View style={[localStyles.alertBox, dark && { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444' }]}>
          <Text style={[localStyles.alertText, dark && { color: '#fca5a5' }]}>
            ⚠️ {permissionError}
          </Text>
        </View>
      )}

      {status !== 'analyzed' ? (
        <VoiceRecorderBox
          mode={mode}
          status={status}
          elapsedSeconds={elapsedSeconds}
          transcript={transcript}
          recordedUri={recordedUri}
          isPlayingAudio={isPlayingAudio}
          onToggleRecording={status === 'recording' ? stopRecording : startRecording}
          onChangeTranscript={setTranscript}
          onAnalyzeText={handleAnalyzeText}
          onTogglePlayAudio={() => setIsPlayingAudio(!isPlayingAudio)}
        />
      ) : (
        report && <VoiceRecallReportView report={report} onRetry={handleRetry} />
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
    marginTop: 8,
  },
  stimulusEyebrow: { fontSize: 10, fontWeight: '800', color: '#be123c', letterSpacing: 0.7 },
  stimulusQuestion: { fontSize: 15, fontWeight: '700', color: colors.navy, lineHeight: 22 },
  stimulusHint: { fontSize: 12, color: colors.muted },
  modeTabs: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  modeTabActive: { borderColor: '#e11d48', backgroundColor: '#fff1f2' },
  modeTabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  modeTabTextActive: { color: '#be123c', fontWeight: '700' },
  alertBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  alertText: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
});
