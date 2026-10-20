import type { Course } from '@formazione/contracts';
import { mescola } from '@formazione/civis-engine';

// Generatore deterministico da una stringa: FNV-1a per il seme, mulberry32 per la sequenza.
function rngFrom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Stesso seme, stesso ordine: un tentativo ridisegnato o ricaricato non cambia.
export function seededOrder<T>(items: T[], seed: string): T[] {
  return mescola(items, rngFrom(seed));
}
// Ordine di visualizzazione delle opzioni: la posizione generata non dice quale è giusta.
// Le opzioni restano oggetti con il loro id, quindi la valutazione per id non cambia.
// `attempt` è il numero del tentativo in corso (tentativi già consegnati per quell'esame).
export function displayOptions(course: Course, examId: string, attempt: number, questionId: string) {
  const question = course.questions.find(q => q.id === questionId);
  if (!question) throw new Error(`Unknown question ${questionId}`);
  return seededOrder(question.options, `${course.id}:${course.version}:${examId}:${attempt}:${questionId}`);
}
