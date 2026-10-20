// Scala dei giudizi: unica fonte in packages/contracts/fixtures/grading-scale.json,
// condivisa con il default della pipeline Python (vedi services/api/tests/test_grading_scale.py).
import scala from '../../contracts/fixtures/grading-scale.json';

export type Giudizio = 'non superato' | 'discreto' | 'buono' | 'distinto' | 'ottimo' | 'perfetto' | 'superato';
export type Valutazione = { superato: boolean; percentuale: number; giudizio: Giudizio };

const giudizi = [...scala.giudizi].sort((a, b) => b.daPercento - a.daPercento) as { daPercento: number; giudizio: Giudizio }[];

/** Risposte corrette minime per raggiungere la soglia della scala su n domande: ⌈soglia·n/100⌉, in aritmetica intera. */
export function sogliaPredefinita(n: number): number {
  return Math.floor((scala.sogliaSuperamentoPercento * n + 99) / 100);
}

/**
 * Decisione di superamento e giudizio di un tentativo. Il superamento segue la soglia dell'esame
 * (`passingScore`, risposte corrette); il giudizio segue la scala. Confronti in interi: c·100 ≥ p·t.
 */
export function valutaTentativo(attempt: { correct: number; total: number }, exam: { passingScore: number }): Valutazione {
  const { correct, total } = attempt;
  const superato = correct >= exam.passingScore;
  // Percentuale mostrata troncata: 99,9% resta 99%, coerente con il giudizio «ottimo».
  const percentuale = total > 0 ? Math.floor((correct * 100) / total) : 0;
  if (!superato) return { superato, percentuale, giudizio: 'non superato' };
  const voce = giudizi.find(g => correct * 100 >= g.daPercento * total);
  // Esame superato con soglia sotto la scala: la scala non prevede un giudizio, si dice solo «superato».
  return { superato, percentuale, giudizio: voce?.giudizio ?? 'superato' };
}

/** Testo per il lettore, es. «71% · Buono» oppure «57% · Non superato». */
export function descriviValutazione(v: Valutazione): string {
  return `${v.percentuale}% · ${v.giudizio.charAt(0).toUpperCase()}${v.giudizio.slice(1)}`;
}
