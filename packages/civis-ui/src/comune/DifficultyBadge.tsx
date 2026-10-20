import { usePalette } from '../ThemeProvider';
import React from 'react';
import { View, Text } from 'react-native';
import { C, TESTO } from '../tema';
import { useStyles } from './stili';

export function DifficultyBadge({ level }: { level?: string }) {
  const C = usePalette();
  const s = useStyles();

  const map: any = {
    base:      { label: 'Base',      color: C.greenText },
    medio:     { label: 'Medio',     color: C.yellow },
    avanzato:  { label: 'Avanzato',  color: C.orange },
  };
  const cfg = level && map[level];
  if (!cfg) return null;
  return (
    <View style={[s.diffBadge, { borderColor: cfg.color + '55', backgroundColor: cfg.color + '14' }]}>
      <Text style={{ color: cfg.color, fontSize: TESTO.occhiello, fontWeight: '700', letterSpacing: 0.5 }}>{cfg.label}</Text>
    </View>
  );
}
