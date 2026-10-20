/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/comune/Emoji.tsx
 * (Civis, commit db9ff48), che disegna un'emoji o l'icona civica collegata.
 * Per decisione dell'utente il progetto per ora non ha icone né emoji: questo
 * sostituto mantiene la firma di Civis, perché src/comune/FormatPill.tsx lo
 * importa, ma non disegna nulla (passa per EmojiIcon del sostituto di
 * src/icons/AppIcon.tsx, che restituisce null).
 */
import React from 'react';
import { EmojiIcon } from '../icons/AppIcon';

export function Emoji({ emoji, size = 18, color, style }: any) {
  return <EmojiIcon emoji={emoji} size={size} color={color} style={style} />;
}
