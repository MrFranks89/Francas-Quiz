/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/speech.ts (Civis,
 * commit db9ff48), che legge ad alta voce con la sintesi vocale del telefono
 * tramite react-native-tts, una dipendenza nativa che questo progetto non ha.
 *
 * src/lezione/SpeakerButton.tsx (copia) importa `useSpeech`. Qui l'hook non
 * ha alcun effetto: `speaking` resta falso e `toggle` non fa nulla. Il nostro
 * lettore passa sempre `onTesti` a SlideStep, quindi il pulsante altoparlante
 * non viene disegnato (lo verifica __tests__/nostri/SlideStep.lettore.test.tsx):
 * un pulsante senza voce sarebbe un comando morto.
 */
export function useSpeech(): { speaking: boolean; toggle: (testi: string[]) => void } {
  return { speaking: false, toggle: (_testi: string[]) => {} };
}
