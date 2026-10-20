import { usePalette } from '../ThemeProvider';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { s, useStyles } from '../comune/stili';
import { Btn } from '../comune/Btn';
import { EmojiIcon, EmojiText, ContestoGlossarioTesto } from '../icons/AppIcon';
import { SpeakerButton } from './SpeakerButton';
import { GLOSSARIO } from '../glossario';
import { chiaviDefiniteIn, nuovoBudgetBlocco } from '../glossarioTesto';

// `onTesti`: se passato, chi contiene questo step ha un altoparlante proprio in alto
// a destra (es. la barra della lezione) e legge lì — questo componente non ne
// disegna uno suo, gli passa solo cosa leggere. Se assente (es. dentro il ripasso,
// che non ha quella riga), il pulsante resta qui come prima.
//
// `lezioneId`: presente SOLO quando la lezione è al modello 2 (vedi
// CivicApp.tsx/LezioneAttualita.tsx) — accende il glossario in body/highlight
// (mai nell'heading, regola 4: se l'heading definisce il termine, non si
// sottolinea qui). Il blocco è QUESTA slide: budget e chiaviEscluse si
// ricalcolano solo quando cambia lo step (useMemo), non a ogni render.
export function SlideStep({ step, onNext, moduleColor, onTesti, lezioneId }: any) {
  const s = useStyles();

  const col = step.color || moduleColor;
  const testi = [step.heading, step.body, step.highlight];
  useEffect(() => { onTesti?.(testi); });

  const glossario: ContestoGlossarioTesto | undefined = useMemo(() => {
    if (!lezioneId) return undefined;
    return {
      lezioneId,
      titoloStep: step.heading,
      chiaviEscluse: chiaviDefiniteIn(step.heading, GLOSSARIO),
      budget: nuovoBudgetBlocco(3),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lezioneId]);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <EmojiIcon emoji={step.emoji} size={30} color={col} />
        <EmojiText style={[s.slideHeading, { flex: 1, textAlign: 'left', marginBottom: 0 }]}>{step.heading}</EmojiText>
        {!onTesti && <SpeakerButton testi={testi} color={col} />}
      </View>
      <EmojiText style={s.slideBody} glossario={glossario}>{step.body}</EmojiText>
      <View style={[s.highlight, { borderLeftColor: col, backgroundColor: col + '14' }]}>
        <EmojiText style={s.highlightText} glossario={glossario}>{step.highlight}</EmojiText>
      </View>
      <Btn onPress={onNext} label="Continua →" primary color={col} />
    </View>
  );
}
