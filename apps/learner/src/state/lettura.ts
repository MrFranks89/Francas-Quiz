import { CorsoLeggibileSchema, type Course } from '@formazione/contracts';

/**
 * Un corso letto per essere mostrato: aperto dal server (pubblicato o bozza), importato da un JSON,
 * o l'esempio del lettore. Vale solo la validazione strutturale (CorsoLeggibileSchema): un corso
 * salvato prima delle regole di qualità di singola domanda si apre sempre. Le regole di qualità
 * valgono in scrittura, con CourseSchema (validaBozza in bozza.ts) e nel server. Decisione
 * dell'utente del 9 novembre 2026.
 */
export function corsoDaLeggere(dati: unknown): Course {
  return CorsoLeggibileSchema.parse(dati);
}

/** Il testo di un file JSON importato, letto come corso da mostrare. */
export function corsoImportato(testo: string): Course {
  return corsoDaLeggere(JSON.parse(testo));
}
