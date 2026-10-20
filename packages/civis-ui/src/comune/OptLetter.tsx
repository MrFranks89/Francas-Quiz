import { usePalette } from '../ThemeProvider';
import React from 'react';
import { View, Text } from 'react-native';
import { C, TESTO } from '../tema';

// Stato di un'opzione a scelta: prima della conferma è neutro/selezionato,
// dopo diventa verde (giusta) / rosso (scelta sbagliata) / spenta.
export type OptSt = 'idle' | 'sel' | 'cor' | 'wr' | 'dim';

// Chip con la lettera A/B/C davanti a ogni opzione.
export function OptLetter({ i, state }: { i: number; state: OptSt }) {
  const C = usePalette();

  const m: any = {
    idle: { bg: '#0d1424', bd: 'rgba(255,255,255,0.14)', tx: C.textMuted },
    sel:  { bg: C.selBorder, bd: C.selBorder, tx: C.bg },
    cor:  { bg: C.green, bd: C.green, tx: '#ffffff' },
    wr:   { bg: C.red, bd: C.red, tx: '#ffffff' },
    dim:  { bg: '#0d1424', bd: C.borderSubtle, tx: C.textVeryDim },
  };
  const c = m[state];
  return (
    // La lettera è decorativa per chi usa lo schermo: la riga dell'opzione
    // (TouchableOpacity che la contiene) porta già "Opzione A: <testo>" nel
    // suo accessibilityLabel, quindi qui si nasconde per non farla leggere due volte.
    <View
      style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c.bg, borderWidth: 1, borderColor: c.bd, alignItems: 'center', justifyContent: 'center' }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={{ fontSize: TESTO.corpoPiccolo, fontWeight: '800', color: c.tx }}>{String.fromCharCode(65 + i)}</Text>
    </View>
  );
}
