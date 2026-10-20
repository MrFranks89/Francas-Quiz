/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/icons/AppIcon.tsx
 * (Civis, commit db9ff48), che qui non si porta: disegna icone SVG e PNG,
 * sostituisce le emoji con immagini, rende toccabili sigle e parole del
 * glossario. Dipende da react-native-svg, dalle immagini di Civis e dai suoi
 * dati (sigle, glossario). Per decisione dell'utente il progetto per ora non
 * ha icone né emoji.
 *
 * Espone solo ciò che i file copiati importano:
 * - `EmojiText`, usato da src/comune/Btn.tsx: qui è un semplice Text che
 *   mostra il testo così com'è (niente immagini, sigle o glossario);
 * - `EmojiIcon`, usato da src/comune/Emoji.tsx (anch'esso sostituto): qui
 *   non disegna nulla.
 *
 * Le firme ricalcano quelle di Civis nelle parti usate, così i file copiati
 * compilano senza modifiche.
 */
import React from 'react';
import { Text, TextProps } from 'react-native';

type EmojiTextProps = Omit<TextProps, 'children'> & {
  children?: string | null;
  // Accettati per compatibilità con Civis e ignorati: qui non ci sono sigle
  // toccabili né glossario.
  sigleInterattive?: boolean;
  glossario?: unknown;
};

export function EmojiText({ children, sigleInterattive: _sigle, glossario: _glossario, ...textProps }: EmojiTextProps) {
  return <Text {...textProps}>{children}</Text>;
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
