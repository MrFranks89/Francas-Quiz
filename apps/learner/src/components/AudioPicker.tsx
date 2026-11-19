import React, { useState, useEffect, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { Button } from './ui';
import type { PickedAsset } from './FotoPicker';

type AudioPickerProps = {
  onPick: (asset: PickedAsset) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

const AUDIO_MIMES = [
  'audio/*',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
];

export function AudioPicker({ onPick, onError, disabled }: AudioPickerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          if (next >= 55 * 60) {
            void stopRecording(true);
          }
          return next;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  async function startRecording() {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('Permesso microfono non concesso.');
        return;
      }
      if (typeof recorder.prepareToRecordAsync === 'function') {
        await recorder.prepareToRecordAsync();
      }
      recorder.record();
      setIsRecording(true);
      setSeconds(0);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossibile avviare la registrazione audio.');
    }
  }

  async function stopRecording(reachedMax = false) {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      await recorder.stop();
      setIsRecording(false);
      if (reachedMax) {
        onError('Raggiunto il limite massimo di registrazione (55 minuti).');
      }
      const uri = recorder.uri;
      if (uri) {
        onPick({
          uri,
          name: `audio-${Date.now()}.m4a`,
          mimeType: 'audio/m4a',
        });
      }
    } catch (err) {
      setIsRecording(false);
      onError(err instanceof Error ? err.message : 'Errore durante l’arresto della registrazione.');
    }
  }

  async function pickAudioFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIMES,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        onPick({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'audio/m4a',
        });
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Impossibile selezionare il file audio.');
    }
  }

  function formatTimer(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.row}>
        <Button
          label="Scegli un file audio"
          onPress={pickAudioFile}
          disabled={disabled}
          secondary
        />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Button
        label={isRecording ? `Ferma registrazione (${formatTimer(seconds)})` : 'Registra un audio'}
        onPress={isRecording ? () => void stopRecording(false) : startRecording}
        disabled={disabled}
        secondary
      />
      {!isRecording && (
        <Button
          label="Scegli un file audio"
          onPress={pickAudioFile}
          disabled={disabled}
          secondary
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
});
