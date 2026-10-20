/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/comune/OptMark.tsx
 * (Civis, commit db9ff48), che a fine riga mostra una spunta o una croce dopo
 * la conferma. Per decisione dell'utente il progetto per ora non ha icone né
 * emoji, e i due segni contano come icone: qui al loro posto ci sono le parole
 * «Giusta» e «Sbagliata». Stessa firma, stessi colori, stessa misura e stesso
 * peso di Civis: cambia solo il testo. La misura (17, pensata per un segno)
 * andrà rivista quando il lettore userà il componente.
 */
import React from 'react';
import { Text } from 'react-native';
import { usePalette } from '../ThemeProvider';
import { OptSt } from './OptLetter';

export function OptMark({ state }: { state: OptSt }) {
  const C = usePalette();

  if (state === 'cor') return <Text style={{ color: C.greenText, fontSize: 17, fontWeight: '800' }}>Giusta</Text>;
  if (state === 'wr') return <Text style={{ color: C.redText, fontSize: 17, fontWeight: '800' }}>Sbagliata</Text>;
  return null;
}
