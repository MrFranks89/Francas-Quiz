import { usePalette } from '../ThemeProvider';
import React from 'react';
import { View, Text } from 'react-native';
import { C, TESTO } from '../tema';
import { Emoji } from './Emoji';

// Etichetta del formato come pillola piena colorata.
export function FormatPill({ icon, text, color = C.indigo }: { icon?: string; text: string; color?: string }) {
  const C = usePalette();

  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 }}>
      {icon ? <Emoji emoji={icon} size={13} color={C.bg} /> : null}
      <Text style={{ color: C.bg, fontSize: TESTO.minuscolo, fontWeight: '800', letterSpacing: 0.5 }}>{text.toUpperCase()}</Text>
    </View>
  );
}
