/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/icons/AppIcon.tsx
 * (Civis, commit db9ff48), che qui non si porta: disegna icone SVG e PNG,
 * sostituisce le emoji con immagini, rende toccabili sigle e parole del
 * glossario. Dipende da react-native-svg, dalle immagini di Civis e dai suoi
 * dati (sigle, glossario). Per decisione dell'utente il progetto per ora non
 * ha icone né emoji.
 *
 * Espone solo ciò che i file copiati importano:
 * - `EmojiText`, usato da src/comune/Btn.tsx e src/lezione/SlideStep.tsx:
 *   qui è un Text che mostra il testo così com'è (niente immagini, sigle o
 *   glossario), salvo il grassetto **parola**, che riprende la regola di
 *   Civis (stessa espressione, stesso peso '700'): le slide lo usano e il
 *   test originale __tests__/lezione/SlideStep.test.tsx lo verifica;
 * - `EmojiIcon`, usato da src/comune/Emoji.tsx (anch'esso sostituto): qui
 *   non disegna nulla.
 *
 * `ContestoGlossarioTesto` è il tipo che SlideStep importa: ricalca quello di
 * Civis, ma qui il glossario non accende nulla.
 *
 * Le firme ricalcano quelle di Civis nelle parti usate, così i file copiati
 * compilano senza modifiche.
 */
import React from 'react';
import { Text, TextProps } from 'react-native';
import type { BudgetBlocco } from '../glossarioTesto';

// Stesso tipo di Civis: SlideStep lo costruisce solo quando riceve `lezioneId`.
export type ContestoGlossarioTesto = {
  lezioneId: string;
  titoloStep?: string;
  chiaviEscluse: Set<string>;
  budget: BudgetBlocco;
};

// Grassetto in convenzione Markdown minima, come in Civis: **parola**, non
// greedy; nessun altro costrutto Markdown è riconosciuto.
const BOLD_RE = /\*\*[\s\S]+?\*\*/g;
const STILE_GRASSETTO = { fontWeight: '700' as const };

type EmojiTextProps = Omit<TextProps, 'children'> & {
  children?: string | null;
  // Accettati per compatibilità con Civis e ignorati: qui non ci sono sigle
  // toccabili né glossario.
  sigleInterattive?: boolean;
  glossario?: ContestoGlossarioTesto;
};

export function EmojiText({ children, style, sigleInterattive: _sigle, glossario: _glossario, ...textProps }: EmojiTextProps) {
  const testo = children ?? '';
  const parti: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of testo.matchAll(BOLD_RE)) {
    const inizio = m.index ?? 0;
    if (inizio > ultimo) parti.push(testo.slice(ultimo, inizio));
    parti.push(<Text key={`b${i++}`} style={[style, STILE_GRASSETTO]}>{m[0].slice(2, -2)}</Text>);
    ultimo = inizio + m[0].length;
  }
  if (!parti.length) return <Text {...textProps} style={style}>{children}</Text>;
  parti.push(testo.slice(ultimo));
  return <Text {...textProps} style={style}>{parti}</Text>;
}

type EmojiIconProps = {
  emoji?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: unknown;
};

export function EmojiIcon(_props: EmojiIconProps): null {
  return null;
}
