/**
 * SOSTITUTO, non copia. Prende il posto di CivicaApp/src/glossario.ts (Civis,
 * commit db9ff48), che porta il glossario civico di Civis (dati in
 * glossarioDati.js e sigle.ts) e la sua ricerca. Quei dati riguardano le
 * lezioni di educazione civica e qui non si portano.
 *
 * src/lezione/SlideStep.tsx (copia) importa `GLOSSARIO` per calcolare i
 * termini da escludere quando riceve `lezioneId`: qui il glossario è vuoto,
 * quindi nessuna parola diventa mai toccabile. Il nostro lettore comunque non
 * passa `lezioneId`, e il sostituto di EmojiText ignora il glossario.
 *
 * I tipi ricalcano quelli di Civis, così il file copiato compila senza
 * modifiche.
 */
export type Significato = {
  senso: string;
  dove: string[];
  esempio: string;
};

export type Voce = {
  forme: string[];
  significati: Significato[];
};

export const GLOSSARIO: Record<string, Voce> = {};
