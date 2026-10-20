/**
 * Utility condivise dai componenti-domanda di src/lezione/. Estratte da
 * CivicApp.tsx insieme ai componenti che le usano: mescolamento, scelta
 * della variante di ripasso e stato visivo delle opzioni. Nessun cambiamento
 * di comportamento — stesse funzioni, stesso ordine.
 */
import { useRef } from 'react';
import { OptSt } from '../comune/OptLetter';
import { pickVariantPlain } from '../ripasso';

// Stato di un'opzione a scelta: prima della conferma è neutro/selezionato,
// dopo diventa verde (giusta) / rosso (scelta sbagliata) / spenta.
export function optState(confirmed: boolean, isChosen: boolean, isCorrect: boolean): OptSt {
  if (!confirmed) return isChosen ? 'sel' : 'idle';
  if (isCorrect) return 'cor';
  if (isChosen) return 'wr';
  return 'dim';
}

// ── Varietà: mescola un array (Fisher-Yates) ──
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Mescola una sola volta per "mount" del componente (i passi sono keyati per indice,
// quindi ogni nuova domanda = nuovo mescolamento).
export function useShuffled<T>(build: () => T): T {
  const ref = useRef<{ v: T } | null>(null);
  if (ref.current === null) ref.current = { v: build() };
  return ref.current.v;
}

// Varietà nei ripassi: uno step di domanda può portare un array `variants` con
// formulazioni alternative (override parziali della domanda). A ogni "mount" se
// ne pesca una a caso tra la base e le varianti. Niente `variants` → step invariato.
export function usePickVariant(step: any): any {
  // La scelta vera e propria (base + `variants` + `pool`) è in pickVariantPlain
  // (src/ripasso.ts): serve pura anche fuori da un componente montato, per
  // costruire i pool del ripasso. Qui si congela il risultato per "mount",
  // con lo stesso useRef di sempre.
  const ref = useRef<any>(null);
  if (ref.current === null) ref.current = pickVariantPlain(step);
  return ref.current;
}

// Trasforma options + indice corretto in oggetti che portano con sé la correttezza,
// così possiamo mescolarli senza perdere quale sia la risposta giusta.
// `perche` (opzionale) è l'array allineato per indice del "perché dell'errore"
// (Decisioni del 16/9/2026, punto 3): entra nell'oggetto-opzione così viaggia
// col resto quando le opzioni vengono mescolate.
export function toOptions(options: string[], correct: number, perche?: (string | null)[] | null) {
  return options.map((text, i) => ({ text, correct: i === correct, perche: perche?.[i] ?? null }));
}
