import { usePalette } from '../ThemeProvider';
import React from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import { C } from '../tema';
import { useSpeech } from '../speech';
import { EmojiText } from '../icons/AppIcon';

// Bottone-altoparlante: legge ad alta voce `testi` (domanda + opzioni, nell'ORDINE
// in cui sono mostrate — mai un indizio sulla risposta) con la sintesi vocale del
// telefono (vedi src/speech.ts). Premuto di nuovo, si ferma. Si interrompe da solo
// al cambio di domanda o all'uscita dalla lezione (i componenti-domanda si smontano,
// key={stepIdx}/cambio schermata) e quando l'app va in background.
//
// Tocco lungo: dice dove cambiare voce e velocità (Profilo > "Impostazioni del profilo",
// accordion "Lettura ad alta voce") — senza questo, la funzione non si trova per logica.
export function mostraDoveSonoLeImpostazioni() {
  Alert.alert(
    'Voce e velocità',
    'Puoi scegliere voce e velocità di lettura in Profilo, dentro "Impostazioni del profilo", sotto "Lettura ad alta voce".',
  );
}

export function SpeakerButton({ testi, color }: { testi: string[]; color?: string }) {
  const C = usePalette();

  const { speaking, toggle } = useSpeech();
  return (
    <TouchableOpacity
      onPress={() => toggle(testi)}
      onLongPress={mostraDoveSonoLeImpostazioni}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Interrompi la lettura' : 'Leggi ad alta voce'}
      style={{ padding: 6, marginLeft: 6 }}
    >
      <EmojiText style={{ fontSize: 20, color: color || C.textDim }}>{speaking ? '⏹️' : '🔊'}</EmojiText>
    </TouchableOpacity>
  );
}
