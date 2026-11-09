import { CourseSchema, type Course } from '@formazione/contracts';

/**
 * Regole di salvataggio e pubblicazione della bozza nell'editor, spostate
 * qui da EditorScreen: quando sono bloccati, cosa si manda al server, quale
 * messaggio si mostra quando qualcosa non va.
 */

type Riferimento = { id: string; revision?: number };
export type Richiesta = { path: string; method: 'PUT' | 'POST'; body: Record<string, unknown> };

/**
 * Una soglia sotto il minimo o un errore di tipo di domanda bloccano
 * salvataggio e pubblicazione finché non vengono corretti.
 */
export function bozzaBloccata(
  soglie: Record<number, string>,
  domande: Record<number, unknown>,
): boolean {
  return Object.keys(soglie).length > 0 || Object.keys(domande).length > 0;
}

/** Il corso come lo accetta il contratto; altrimenti un errore con tutti i motivi. */
export function validaBozza(course: Course): Course {
  const validated = CourseSchema.safeParse(course);
  if (!validated.success)
    throw new Error(`Bozza non valida: ${validated.error.issues.map((i) => i.message).join('; ')}`);
  return validated.data;
}

/** Senza revisione la bozza è alla prima. */
function revisioneAttesa(draft: Riferimento): number {
  return draft.revision ?? 1;
}

export function richiestaSalvataggio(draft: Riferimento, course: Course): Richiesta {
  return {
    path: `/drafts/${draft.id}`,
    method: 'PUT',
    body: { expectedRevision: revisioneAttesa(draft), course },
  };
}

export function richiestaPubblicazione(draft: Riferimento, reviewed: boolean): Richiesta {
  return {
    path: `/drafts/${draft.id}/publish`,
    method: 'POST',
    body: { expectedRevision: revisioneAttesa(draft), confirmReviewed: reviewed },
  };
}

/** Il messaggio dell'errore, o quello predefinito se è stato lanciato altro. */
export function messaggioErrore(e: unknown, predefinito: string): string {
  return e instanceof Error ? e.message : predefinito;
}
