import type { Question, TipoDomanda } from '@formazione/contracts';

type Difficolta = NonNullable<Question['difficulty']>;

/**
 * Regole dell'editor per tipo di domanda: quali campi mostra e come cambia
 * l'insieme delle risposte giuste. Spostate qui da DomandaEditor, che le
 * disegna soltanto.
 */
export type CampiDelTipo = {
  /** Scenario: la situazione prima della domanda. */
  situazione: boolean;
  /** Correggi l'errore: la frase con l'errore e la parte sbagliata. */
  fraseConErrore: boolean;
  /** Vero/falso: le due opzioni sono fisse, si sceglie solo quale è giusta. */
  testoRisposteModificabile: boolean;
  /** Motivazione facoltativa per ogni opzione (non per vero/falso). */
  motivazioni: boolean;
  /** Risposta multipla: un insieme di giuste invece di una sola. */
  piuGiuste: boolean;
  /** Accoppiamento: i termini della colonna sinistra, uno per coppia; la giusta di ogni opzione è la sua coppia. */
  coppie: boolean;
};

export function campiDelTipo(kind: TipoDomanda): CampiDelTipo {
  return {
    situazione: kind === 'scenario',
    fraseConErrore: kind === 'correctStatement',
    testoRisposteModificabile: kind !== 'truefalse',
    motivazioni: kind !== 'truefalse',
    piuGiuste: kind === 'multiple',
    coppie: kind === 'matching',
  };
}

/** Le giuste di una risposta multipla; vuoto se non ce ne sono. */
export function giusteDi(question: Question): string[] {
  return question.correctOptionIds ?? [];
}

/** Toccare un'opzione giusta la toglie, una sbagliata la aggiunge in fondo. */
export function alternaGiusta(giuste: string[], id: string): string[] {
  return giuste.includes(id) ? giuste.filter((g) => g !== id) : [...giuste, id];
}

/** Etichetta del pulsante di difficoltà: il valore con l'iniziale maiuscola. */
export function etichettaDifficolta(d: Difficolta): string {
  return d.charAt(0).toUpperCase() + d.slice(1);
}
