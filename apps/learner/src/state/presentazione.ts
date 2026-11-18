import { SPAZIO, type Coppia, type Question } from '@formazione/contracts';

/**
 * Come si presenta una domanda nel test e nel riepilogo, per tipo.
 *
 * Funzione pura, separata dalla vista: la vista disegna, qui si decide che
 * cosa. Etichette e forme da Civis (src/lezione/*Step.tsx): «Vero o falso»,
 * «Completa la frase», «Scenario», «Trova l'intruso», «Correggi l'errore».
 * La scelta singola non ha etichetta, come QuizSingleStep.
 */
export type Presentazione = {
  kind: Question['kind'];
  etichetta: string | null;
  prompt: string;
  difficulty?: Question['difficulty'];
  /** Scenario: la situazione in evidenza. */
  situazione?: string;
  /** Completa la frase: testo prima e dopo lo spazio (uno solo, garantito dal contratto). */
  frase?: { prima: string; dopo: string };
  /** Correggi l'errore: la frase divisa attorno alla parte sbagliata (una sola, garantita dal contratto). */
  correggi?: { prima: string; sbagliata: string; dopo: string };
  /** Accoppiamento: le coppie termine → opzione della colonna destra. */
  coppie?: Coppia[];
};

const ETICHETTE: Record<Question['kind'], string | null> = {
  single: null,
  truefalse: 'Vero o falso',
  fillblank: 'Completa la frase',
  scenario: 'Scenario',
  oddOneOut: "Trova l'intruso",
  correctStatement: "Correggi l'errore",
  // Risposta multipla: l'indicazione che le giuste sono più d'una (decisione dell'utente).
  multiple: 'Più risposte corrette',
  matching: 'Accoppia',
};

function dividi(testo: string, parte: string) {
  const i = testo.indexOf(parte);
  return i < 0
    ? { prima: testo, dopo: '' }
    : { prima: testo.slice(0, i), dopo: testo.slice(i + parte.length) };
}

export function presentazione(q: Question): Presentazione {
  const p: Presentazione = {
    kind: q.kind,
    etichetta: ETICHETTE[q.kind],
    prompt: q.prompt,
    difficulty: q.difficulty,
  };
  if (q.kind === 'scenario') p.situazione = q.situation;
  if (q.kind === 'matching') p.coppie = q.pairs ?? [];
  if (q.kind === 'fillblank') p.frase = dividi(q.prompt, SPAZIO);
  if (q.kind === 'correctStatement' && q.sentence && q.wrong) {
    const d = dividi(q.sentence, q.wrong);
    p.correggi = { prima: d.prima, sbagliata: q.wrong, dopo: d.dopo };
  }
  return p;
}

/** Lo spazio vuoto mostrato finché non si sceglie una parola (FillBlankStep di Civis). */
export const SPAZIO_VUOTO = '__________';
