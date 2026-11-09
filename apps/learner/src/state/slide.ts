import type { Course } from '@formazione/contracts';

/**
 * Adattatore puro dalle slide del nostro contratto (packages/contracts) ai
 * dati che si aspetta SlideStep di Civis (packages/civis-ui/src/lezione,
 * copia identica): `{ heading, body, highlight, emoji?, color? }`.
 *
 * Il riquadro in evidenza. Il nostro `highlight` può essere vuoto (il
 * contratto lo ammette), mentre SlideStep disegna sempre il riquadro colorato:
 * passato vuoto, resterebbe un riquadro senza testo. Scelta: se `highlight` è
 * vuoto, il corpo va nel riquadro e il corpo resta vuoto. Così il riquadro
 * non è mai vuoto e nessun testo viene inventato, tagliato o ripetuto.
 *
 * `emoji` resta assente: per decisione dell'utente niente icone né emoji (il
 * sostituto di EmojiIcon comunque non disegnerebbe nulla).
 */
export type Slide = Course['modules'][number]['lessons'][number]['slides'][number];
export type SlideCivis = { heading: string; body: string; highlight: string };

export function slidePerCivis(slide: Slide): SlideCivis {
  const highlight = slide.highlight.trim();
  if (!highlight) return { heading: slide.heading, body: '', highlight: slide.body };
  return { heading: slide.heading, body: slide.body, highlight };
}
