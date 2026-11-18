import type { Course } from '@formazione/contracts';
import {
  accoppiamentoGiusto,
  displayOptions,
  multiplaGiusta,
  opzioniScelte,
  type Attempt,
} from '@formazione/learning-engine';
import { optState } from '@formazione/civis-ui/src/lezione/util';
import type { OptSt } from '@formazione/civis-ui/src/comune/OptLetter';
import { presentazione, type Presentazione } from './presentazione';

type Exam = NonNullable<Course['modules'][number]['exam']>;
/** `mancata`: risposta multipla, opzione giusta non scelta (verde senza riempimento, «Mancata»). */
export type OpzioneMostrata = {
  id: string;
  text: string;
  stato: OptSt;
  rationale?: string;
  mancata?: boolean;
};
/** Riga dell'accoppiamento nel riepilogo: termine, definizione assegnata e definizione giusta. */
export type CoppiaRiepilogo = {
  left: string;
  /** Testo dell'opzione assegnata al termine; null se la coppia è rimasta senza assegnazione. */
  sceltaText: string | null;
  giustaText: string;
  corretta: boolean;
};
export type RigaRiepilogo = {
  questionId: string;
  prompt: string;
  explanation: string;
  /** Opzione scelta (scelta singola e tipi riducibili); per multipla e accoppiamento è null e valgono `scelte`. */
  scelta: string | null;
  scelte: string[];
  senzaRisposta: boolean;
  giusta: boolean;
  opzioni: OpzioneMostrata[];
  domanda: Presentazione;
  /** Testo dell'opzione scelta, per riempire lo spazio di «Completa la frase»; null se senza risposta. */
  testoScelto: string | null;
  /** Accoppiamento: riepilogo per coppia, nell'ordine delle coppie della domanda. */
  coppie?: CoppiaRiepilogo[];
};

/**
 * Stato visivo di un'opzione mentre si risponde: selezionata o neutra.
 * La correttezza non entra nemmeno nel calcolo, così prima della consegna
 * niente può rivelare la risposta giusta.
 */
export function statoInCorso(selezionata: boolean): OptSt {
  return optState(false, selezionata, false);
}

/**
 * Riepilogo dell'ultimo tentativo consegnato di un esame, domanda per domanda.
 *
 * Le opzioni sono nell'ordine in cui sono state viste durante quel tentativo:
 * `displayOptions` con l'indice del tentativo (tentativi precedenti dello
 * stesso esame), cioè `attempts.length - 1`, non `attempts.length`, che è
 * l'ordine del tentativo successivo.
 *
 * Colori con `optState` di Civis (src/lezione/util.ts): la giusta «cor»
 * (verde), la sbagliata scelta «wr» (rosso), le altre «dim». Una domanda
 * senza risposta ha `scelta: null` e nessuna opzione rossa.
 *
 * `attempts` sono i tentativi di questo esame, in ordine di consegna.
 */
export function riepilogoUltimoTentativo(
  course: Course,
  exam: Exam,
  attempts: Attempt[],
): RigaRiepilogo[] {
  const last = attempts.at(-1);
  if (!last) return [];
  if (attempts.some((a) => a.examId !== exam.id))
    throw new Error(`Tentativi di un altro esame in ${exam.id}`);
  const indice = attempts.length - 1;
  return exam.questionIds.map((id) => {
    const q = course.questions.find((q) => q.id === id);
    if (!q) throw new Error(`Domanda sconosciuta ${id}`);
    const risposta = last.answers.find((a) => a.questionId === id);
    const scelte = risposta ? opzioniScelte(risposta) : [];
    const multipla = q.kind === 'multiple';
    const matching = q.kind === 'matching';
    const scelta = multipla || matching ? null : (scelte[0] ?? null);
    const giusteIds = multipla ? (q.correctOptionIds ?? []) : [q.correctOptionId];
    // Multipla: giuste scelte in verde, scelte sbagliate in rosso, giuste non scelte «mancate».
    // Accoppiamento: l'opzione assegnata alla sua coppia in verde, assegnata altrove in rosso;
    // la correttezza si legge soprattutto nelle righe `coppie`.
    const opzioni = displayOptions(course, exam.id, indice, id).map((o) => {
      if (matching) {
        const k = (q.pairs ?? []).findIndex((p) => p.rightOptionId === o.id);
        const correttaO = k >= 0 && scelte[k] === o.id;
        const altrove = !correttaO && scelte.includes(o.id);
        return {
          id: o.id,
          text: o.text,
          stato: optState(true, altrove, correttaO),
          ...(scelte.length > 0 && !correttaO && !altrove ? { mancata: true } : {}),
          ...(o.rationale ? { rationale: o.rationale } : {}),
        };
      }
      const giustaO = giusteIds.includes(o.id),
        sceltaO = scelte.includes(o.id);
      return {
        id: o.id,
        text: o.text,
        stato: optState(true, sceltaO, giustaO),
        ...(multipla && giustaO && !sceltaO ? { mancata: true } : {}),
        ...(o.rationale ? { rationale: o.rationale } : {}),
      };
    });
    const testoScelto = q.options.find((o) => o.id === scelta)?.text ?? null;
    const giusta = multipla
      ? scelte.length > 0 && multiplaGiusta(q, scelte)
      : matching
        ? scelte.length > 0 && accoppiamentoGiusto(q, scelte)
        : scelta === q.correctOptionId;
    const coppie = matching
      ? (q.pairs ?? []).map((p, k) => ({
          left: p.left,
          sceltaText: scelte[k] ? (q.options.find((o) => o.id === scelte[k])?.text ?? null) : null,
          giustaText: q.options.find((o) => o.id === p.rightOptionId)?.text ?? '',
          corretta: scelte[k] === p.rightOptionId,
        }))
      : undefined;
    return {
      questionId: id,
      prompt: q.prompt,
      explanation: q.explanation,
      scelta,
      scelte,
      senzaRisposta: scelte.length === 0,
      giusta,
      opzioni,
      domanda: presentazione(q),
      testoScelto,
      ...(coppie ? { coppie } : {}),
    };
  });
}
