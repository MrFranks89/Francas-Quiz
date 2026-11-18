import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import { useStyles } from '@formazione/civis-ui/src/comune/stili';
import { OptLetter, type OptSt } from '@formazione/civis-ui/src/comune/OptLetter';
import { OptMark } from '@formazione/civis-ui/src/comune/OptMark';
import type { OpzioneMostrata } from '../state/riepilogo';
import { coloriOpzione, descriviStato } from './stiliOpzione';

/** `mancata`: risposta multipla, giusta non scelta: bordo verde senza riempimento e la parola «Mancata». */
export function RigaOpzione({
  i,
  text,
  stato,
  onPress,
  disabled,
  mancata,
}: {
  i: number;
  text: string;
  stato: OptSt;
  onPress?: () => void;
  disabled?: boolean;
  mancata?: boolean;
}) {
  const C = usePalette(),
    s = useStyles();
  const c = mancata
    ? { ...coloriOpzione(C, 'cor'), backgroundColor: C.surfaceDark }
    : coloriOpzione(C, stato);
  const forte = stato === 'sel' || stato === 'cor' || stato === 'wr';
  const contenuto = (
    <>
      <OptLetter i={i} state={stato} />
      <Text
        style={[
          s.quizOptionText,
          { marginLeft: 11, color: c.text },
          forte && { fontWeight: '800' },
        ]}
      >
        {text}
      </Text>
      {mancata ? (
        <Text style={{ color: C.greenText, fontSize: 17, fontWeight: '800' }}>Mancata</Text>
      ) : (
        <OptMark state={stato} />
      )}
    </>
  );
  const stile = [
    s.quizOption,
    { borderColor: c.borderColor, backgroundColor: c.backgroundColor },
    forte && { borderWidth: 2 },
  ];
  if (!onPress)
    return (
      <View
        style={stile}
        accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${text}${mancata ? ', giusta, non scelta' : descriviStato(stato)}`}
      >
        {contenuto}
      </View>
    );
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Opzione ${String.fromCharCode(65 + i)}: ${text}`}
      accessibilityState={{ selected: stato === 'sel', disabled: !!disabled }}
      style={stile}
    >
      {contenuto}
    </TouchableOpacity>
  );
}

/** Vero o falso: due pulsanti affiancati (s.tfBtn di TrueFalseStep), colori per correttezza dopo la consegna. */
export function BottoniVeroFalso({
  opzioni,
  onScegli,
  disabled,
}: {
  opzioni: OpzioneMostrata[];
  onScegli?: (id: string) => void;
  disabled?: boolean;
}) {
  const C = usePalette(),
    s = useStyles();
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
      {opzioni.map((o) => {
        const c = coloriOpzione(C, o.stato);
        const box =
          o.stato === 'idle'
            ? null
            : { backgroundColor: c.backgroundColor, borderColor: c.borderColor };
        const testo = (
          <>
            <Text
              style={[
                s.tfBtnText,
                { color: c.text },
                o.stato !== 'idle' && o.stato !== 'dim' && { fontWeight: '800' },
              ]}
            >
              {o.text}
            </Text>
            {(o.stato === 'cor' || o.stato === 'wr') && (
              <View style={{ marginTop: 6 }}>
                <OptMark state={o.stato} />
              </View>
            )}
          </>
        );
        if (!onScegli)
          return (
            <View
              key={o.id}
              style={[s.tfBtn, box]}
              accessibilityLabel={`${o.text}${descriviStato(o.stato)}`}
            >
              {testo}
            </View>
          );
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onScegli(o.id)}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={o.text}
            accessibilityState={{ selected: o.stato === 'sel', disabled: !!disabled }}
            style={[s.tfBtn, box]}
          >
            {testo}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
