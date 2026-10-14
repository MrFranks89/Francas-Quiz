// La regola che decide se una lezione è bloccata: usata sia da
// src/home/ModuleScreen.tsx (l'elenco delle lezioni di un modulo) sia da
// src/GlossarioScreen.tsx (il pulsante "Vai alla lezione"). Prima era
// duplicata a mano nei due file — estratta qui perché due schermate che
// applicano la stessa regola a mano, prima o poi, finiscono per applicarla
// in modo diverso.
//
// Puro: nessuna dipendenza da React, tutto lo stato arriva dai parametri.

export type LezioneConGate = { id: string; isBonus?: boolean };
export type ModuloConLezioni = { lessons: LezioneConGate[] };

export type StatoLezione = {
  done: boolean;
  seqLocked: boolean;   // bloccata dalla sequenza del modulo
  livesLocked: boolean; // bloccata perché le vite sono a zero
  locked: boolean;      // seqLocked || livesLocked
};

export function statoLezione(
  modulo: ModuloConLezioni,
  lezione: LezioneConGate,
  completedLessons: Set<string>,
  lives: number,
): StatoLezione {
  const done = completedLessons.has(lezione.id);
  const livesLocked = lives <= 0 && !done;
  const regular = modulo.lessons.filter((l) => !l.isBonus);
  if (lezione.isBonus) {
    const allRegularDone = regular.every((l) => completedLessons.has(l.id));
    const seqLocked = !allRegularDone;
    return { done, seqLocked, livesLocked, locked: seqLocked || livesLocked };
  }
  // Una lezione già completata non è mai bloccata dalla sequenza: altrimenti
  // inserire una lezione nuova in testa o in mezzo a un modulo già iniziato
  // ritroverebbe bloccate le lezioni successive già fatte (vedi 24-6).
  // Una lezione non completata resta bloccata solo se quella che la precede
  // non è completata.
  const idx = regular.findIndex((l) => l.id === lezione.id);
  const seqLocked = !done && idx > 0 && !completedLessons.has(regular[idx - 1].id);
  return { done, seqLocked, livesLocked, locked: seqLocked || livesLocked };
}
