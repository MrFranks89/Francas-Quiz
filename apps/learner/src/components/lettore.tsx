import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePalette, useTheme, type ThemeMode } from '@formazione/civis-ui/src/ThemeProvider';
import { TESTO } from '@formazione/civis-ui/src/tema';

/**
 * Piccoli elementi nostri del lettore, con i colori della palette di Civis
 * (chiara o scura secondo il tema). I pulsanti d'azione restano il Btn di
 * Civis; qui ci sono solo avvisi, pillole di navigazione e interruttore del
 * tema, che in Civis non hanno un componente portabile.
 */

/** Avviso in un riquadro con il filo a sinistra, come l'evidenza delle slide. */
export function Avviso({
  testo,
  errore = false,
  colore,
}: {
  testo: string;
  errore?: boolean;
  colore?: string;
}) {
  const C = usePalette();
  const filo = errore ? C.red : (colore ?? C.teal);
  return (
    <View
      accessibilityRole={errore ? 'alert' : undefined}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: filo,
        backgroundColor: errore ? C.redBg : C.surface,
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          color: errore ? C.redText : C.textMuted,
          fontSize: TESTO.corpoPiccolo,
          lineHeight: 22,
        }}
      >
        {testo}
      </Text>
    </View>
  );
}

/** Pillola di navigazione: attiva in indaco, le altre sul fondo della superficie. */
export function Pillola({
  label,
  attiva = false,
  disabled = false,
  onPress,
}: {
  label: string;
  attiva?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const C = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: attiva, disabled }}
      style={({ pressed }) => [
        {
          maxWidth: '100%',
          minHeight: 44,
          justifyContent: 'center',
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: attiva ? C.selBorder : C.border,
          backgroundColor: attiva ? C.selBg : C.surface,
        },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={{
          flexShrink: 1,
          color: attiva ? C.text : C.textMuted,
          fontSize: TESTO.piccolo,
          fontWeight: attiva ? '800' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const MODI: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'Sistema' },
  { mode: 'light', label: 'Chiaro' },
  { mode: 'dark', label: 'Scuro' },
];

/** Interruttore del tema: segue il sistema oppure chiaro o scuro fissi. */
export function InterruttoreTema() {
  const C = usePalette();
  const { mode, setMode } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
      accessibilityLabel="Tema"
    >
      <Text style={{ color: C.textDim, fontSize: TESTO.minuscolo, marginRight: 2 }}>Tema</Text>
      {MODI.map((m) => (
        <Pillola
          key={m.mode}
          label={m.label}
          attiva={mode === m.mode}
          onPress={() => setMode(m.mode)}
        />
      ))}
    </View>
  );
}
