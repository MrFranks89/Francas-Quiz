import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/** Tasto Indietro di Android: se `attivo`, esegue `indietro` invece di chiudere l'app. Sul web non fa nulla. */
export function useIndietro(attivo: boolean, indietro: () => void) {
  useEffect(() => {
    if (!attivo) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      indietro();
      return true;
    });
    return () => sub.remove();
  }, [attivo, indietro]);
}
