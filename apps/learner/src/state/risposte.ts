import type { Answer } from '@formazione/learning-engine';
import type { Question } from '@formazione/contracts';
import type { AccoppiamentoInCorso } from '../components/AccoppiamentoView';

/**
 * Risposte in corso a un esame, per domanda: un elenco di opzioni scelte.
 * Al più una per la scelta singola e i tipi riducibili, un insieme per la
 * risposta multipla; per l'accoppiamento l'elenco è ordinato per coppia e può
 * avere buchi (null) finché una coppia non ha una definizione — gli altri
 * tipi non hanno mai null. Funzioni pure, fuori dalla vista (CourseScreen).
 */
export type RisposteInCorso = Record<string, (string | null)[]>;
export type CoppieAttive = Record<string, number>;

/** Risposta multipla: ogni tocco aggiunge o toglie l'opzione; negli altri tipi la sostituisce. */
export function scegli(
  q: Question,
  attuali: (string | null)[],
  optionId: string,
): (string | null)[] {
  return q.kind !== 'multiple'
    ? [optionId]
    : attuali.includes(optionId)
      ? attuali.filter((x) => x !== optionId)
      : [...attuali, optionId];
}

/** Accoppiamento: la definizione toccata va alla coppia attiva; se era assegnata a
 * un'altra coppia si sposta (una definizione per coppia), se era già lì si toglie. */
export function assegna(
  q: Question,
  attuali: (string | null)[],
  coppia: number,
  optionId: string,
): (string | null)[] {
  const prossime = Array.from({ length: (q.pairs ?? []).length }, (_, k) => attuali[k] ?? null);
  const altrove = prossime.indexOf(optionId);
  if (altrove >= 0) prossime[altrove] = null;
  prossime[coppia] = altrove === coppia ? null : optionId;
  return prossime;
}

/** Una domanda conta come risposta solo se completa: per l'accoppiamento servono
 * tutte le coppie assegnate, per gli altri tipi almeno una scelta. */
export function completa(q: Question, a: (string | null)[] | undefined): boolean {
  if (!a?.length) return false;
  return q.kind === 'matching' ? a.length === (q.pairs ?? []).length && a.every(Boolean) : true;
}

/** La risposta da consegnare: elenco per multipla e accoppiamento, opzione singola altrimenti. */
export function risposta(q: Question, scelte: (string | null)[]): Answer {
  return q.kind === 'multiple' || q.kind === 'matching'
    ? { questionId: q.id, optionIds: scelte.filter((x): x is string => x !== null) }
    : { questionId: q.id, optionId: scelte[0]! };
}

/** Gestori dell'accoppiamento per una domanda in corso: la vista non tocca lo stato. */
export function gestoriAccoppiamento(
  q: Question,
  answers: RisposteInCorso,
  coppiaAttiva: CoppieAttive,
  setAnswers: (aggiorna: (current: RisposteInCorso) => RisposteInCorso) => void,
  setCoppiaAttiva: (aggiorna: (current: CoppieAttive) => CoppieAttive) => void,
): AccoppiamentoInCorso {
  return {
    assegnazioni: answers[q.id] ?? [],
    coppiaAttiva: coppiaAttiva[q.id] ?? null,
    onSelezionaCoppia: (k) =>
      setCoppiaAttiva((current) => {
        const prossime = { ...current };
        if (prossime[q.id] === k) delete prossime[q.id];
        else prossime[q.id] = k;
        return prossime;
      }),
    onAssegna: (optionId) => {
      const k = coppiaAttiva[q.id];
      if (k === undefined) return;
      setAnswers((current) => ({ ...current, [q.id]: assegna(q, current[q.id] ?? [], k, optionId) }));
    },
  };
}

/** Aggiorna solo la voce della domanda: le altre conservano lo stesso riferimento (serve al memo). */
export function impostaScelta(
  corrente: RisposteInCorso,
  q: Question,
  optionId: string,
): RisposteInCorso {
  return { ...corrente, [q.id]: scegli(q, corrente[q.id] ?? [], optionId) };
}
