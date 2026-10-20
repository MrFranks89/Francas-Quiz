// Soglia minima di superamento degli esami. Il percento viene dall'unica fonte della scala,
// packages/contracts/fixtures/grading-scale.json (sogliaSuperamentoPercento), la stessa letta da
// packages/learning-engine/src/grade.ts e confrontata con la costante Python della pipeline.
import scala from '../fixtures/grading-scale.json';

const percento = scala.sogliaSuperamentoPercento;

/** Risposte corrette minime ammesse su n domande: ⌈percento·n/100⌉, in aritmetica intera. */
export function sogliaMinima(n: number): number {
  return Math.floor((percento * n + 99) / 100);
}

/** Messaggio per una soglia sotto il minimo (o non intera), oppure null se è ammessa. */
export function erroreSogliaMinima(passingScore: number, n: number): string | null {
  const minimo = sogliaMinima(n);
  if (Number.isInteger(passingScore) && passingScore >= minimo) return null;
  return `La soglia minima è ${minimo} ${minimo === 1 ? 'risposta' : 'risposte'} su ${n} (${percento}%)`;
}
