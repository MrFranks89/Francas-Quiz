import { CourseSchema, type Course, type Question } from '@formazione/contracts';
import { valutaEsame, type DomandaEsame } from '@formazione/civis-engine';

/**
 * Risposta dell'allievo a una domanda: un'opzione, oppure un elenco di opzioni per la risposta
 * multipla (`kind: 'multiple'`) e per l'accoppiamento (`kind: 'matching'`, dove l'elenco è
 * ordinato per coppia: optionIds[k] è la definizione assegnata al termine k). I tentativi
 * salvati prima della risposta multipla hanno solo la prima forma e restano validi.
 */
export type Answer = { questionId: string; optionId: string } | { questionId: string; optionIds: string[] };

/** Tipi la cui risposta è un elenco di opzioni (`optionIds`), non una sola. */
export const TIPI_CON_ELENCO: readonly Question['kind'][] = ['multiple', 'matching'];

/** Opzioni scelte in una risposta, in un'unica forma. */
export function opzioniScelte(answer: Answer): string[] {
  return 'optionIds' in answer ? answer.optionIds : [answer.optionId];
}

/**
 * Risposta multipla: correzione tutto-o-niente. È giusta solo se l'insieme delle opzioni scelte
 * coincide esattamente con quello delle giuste (nessuna mancata, nessuna sbagliata in più).
 * Nessun punteggio parziale: soglia, giudizio e riepilogo restano per domanda.
 */
export function multiplaGiusta(question: Question, scelte: string[]): boolean {
  const giuste = new Set(question.correctOptionIds ?? []);
  const scelto = new Set(scelte);
  return scelto.size === giuste.size && [...scelto].every(id => giuste.has(id));
}

/**
 * Accoppiamento: correzione tutto-o-niente come la multipla. `scelte` è ordinata per coppia:
 * è giusta solo se ogni termine ha la sua definizione (scelte[k] = pairs[k].rightOptionId).
 */
export function accoppiamentoGiusto(question: Question, scelte: string[]): boolean {
  const coppie = question.pairs ?? [];
  return coppie.length > 0 && scelte.length === coppie.length
    && coppie.every((c, k) => scelte[k] === c.rightOptionId);
}

// Risposta multipla e accoppiamento entrano nel motore di Civis (valutaEsame, una scelta per
// indice) come una domanda a due esiti: indice 0 «insieme esatto», 1 «insieme diverso». Così
// corrette, senza risposta e voto si contano in un solo punto, come per gli altri tipi.
const ESITI_INSIEME = ['Insieme esatto', 'Insieme diverso'];

export function adaptQuestions(course: Course, questionIds: string[]): DomandaEsame[] {
  CourseSchema.parse(course);
  if (new Set(questionIds).size !== questionIds.length) throw new Error('Duplicate question id');
  return questionIds.map(id => {
    const question = course.questions.find(q => q.id === id);
    if (!question) throw new Error(`Unknown question ${id}`);
    const insieme = TIPI_CON_ELENCO.includes(question.kind);
    return { id: question.id, lezioneId: question.lessonId, stepIdx: 0,
      moduloId: course.modules.findIndex(m => m.id === question.moduleId) + 1,
      q: question.prompt, options: insieme ? ESITI_INSIEME : question.options.map(o => o.text),
      correct: insieme ? 0 : question.options.findIndex(o => o.id === question.correctOptionId), explanation: question.explanation };
  });
}
export function gradeQuestions(course: Course, questionIds: string[], answers: Answer[]) {
  const adapted = adaptQuestions(course, questionIds);
  const seen = new Set<string>();
  for (const answer of answers) {
    if (seen.has(answer.questionId)) throw new Error('Duplicate answer');
    seen.add(answer.questionId);
    if (!questionIds.includes(answer.questionId)) throw new Error('Unknown answer question');
    const question = course.questions.find(q => q.id === answer.questionId)!;
    // La forma della risposta segue il tipo: elenco solo per la multipla, una sola opzione altrimenti.
    if (('optionIds' in answer) !== TIPI_CON_ELENCO.includes(question.kind)) throw new Error('Answer shape does not match question kind');
    const scelte = opzioniScelte(answer);
    if (!Array.isArray(scelte) || scelte.length === 0) throw new Error('Empty answer');
    if (new Set(scelte).size !== scelte.length) throw new Error('Duplicate answer option');
    if (!scelte.every(id => question.options.some(o => o.id === id))) throw new Error('Unknown answer option');
  }
  const result = valutaEsame(adapted, questionIds.map(id => {
    const answer = answers.find(a => a.questionId === id);
    if (!answer) return null;
    const question = course.questions.find(q => q.id === id)!;
    if (question.kind === 'multiple') return multiplaGiusta(question, opzioniScelte(answer)) ? 0 : 1;
    if (question.kind === 'matching') return accoppiamentoGiusto(question, opzioniScelte(answer)) ? 0 : 1;
    return question.options.findIndex(o => o.id === opzioniScelte(answer)[0]);
  }));
  return { correct: result.corrette, total: result.totale, unanswered: result.senzaRisposta,
    grade: result.voto, rows: result.righe.map(r => ({ questionId: r.domanda.id, correct: r.corretta })) };
}
