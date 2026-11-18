import {
  erroreSogliaMinima,
  erroriTipo,
  type Course,
  type TipoDomanda,
} from '@formazione/contracts';
export function changeField(course: Course, path: (string | number)[], value: unknown): Course {
  // Copy only the edited path. JSON cloning coerces NaN to null, accidentally
  // turning an invalid attempt limit into the valid "unlimited" sentinel.
  function replace(current: unknown, depth: number): unknown {
    if (depth === path.length) return value;
    const original = current as Record<string | number, unknown>;
    const copy = Array.isArray(current) ? [...current] : { ...original };
    const part = path[depth];
    (copy as unknown as Record<string | number, unknown>)[part] = replace(
      original[part],
      depth + 1,
    );
    return copy;
  }
  return replace(course, 0) as Course;
}
export function strictPositive(value: string): number {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
}
/** Errori di soglia per indice di modulo. Il valore non valido resta nel corso: lo segnala, non lo corregge. */
export function erroriSoglia(course: Course): Record<number, string> {
  const errors: Record<number, string> = {};
  course.modules.forEach((module, index) => {
    const message =
      module.exam && erroreSogliaMinima(module.exam.passingScore, module.exam.questionIds.length);
    if (message) errors[index] = message;
  });
  return errors;
}
export type EditorState = {
  course: Course;
  dirty: boolean;
  reviewed: boolean;
  busy: boolean;
  error: string;
};
export type EditorAction =
  | { type: 'change'; path: (string | number)[]; value: unknown }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'error'; message: string }
  | { type: 'saved'; course: Course }
  | { type: 'reviewed'; value: boolean };
export function createEditorState(course: Course): EditorState {
  return { course, dirty: false, reviewed: false, busy: false, error: '' };
}
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'change':
      return {
        ...state,
        course: changeField(state.course, action.path, action.value),
        dirty: true,
        reviewed: false,
      };
    case 'start':
      return { ...state, busy: true, error: '' };
    case 'end':
      return { ...state, busy: false };
    case 'error':
      return { ...state, error: action.message };
    case 'saved':
      return { ...state, course: action.course, dirty: false };
    case 'reviewed':
      return { ...state, reviewed: action.value };
  }
}
/** Nome del tipo di domanda per chi rivede, con le etichette dei formati di Civis. */
export const NOMI_TIPO: Record<TipoDomanda, string> = {
  single: 'Scelta singola',
  truefalse: 'Vero o falso',
  fillblank: 'Completa la frase',
  scenario: 'Scenario',
  oddOneOut: "Trova l'intruso",
  correctStatement: "Correggi l'errore",
  multiple: 'Risposta multipla',
  matching: 'Accoppiamento',
};
/** Etichetta del campo `prompt`, che cambia significato secondo il tipo. */
export const ETICHETTA_PROMPT: Record<TipoDomanda, string> = {
  single: 'Domanda',
  truefalse: 'Affermazione',
  fillblank: 'Frase con lo spazio ___',
  scenario: 'Domanda sulla situazione',
  oddOneOut: 'Consegna',
  correctStatement: 'Consegna',
  multiple: 'Domanda',
  matching: 'Consegna',
};
/**
 * Errori per tipo di ogni domanda, per indice di domanda e campo ('prompt', 'situation', 'options'...).
 * Stesse regole di CourseSchema (erroriTipo del contratto): l'errore si mostra sotto il campo, il valore
 * non viene corretto.
 */
export function erroriDomande(course: Course): Record<number, Record<string, string[]>> {
  const errori: Record<number, Record<string, string[]>> = {};
  course.questions.forEach((q, qi) => {
    for (const e of erroriTipo(q)) {
      ((errori[qi] ??= {})[e.campo] ??= []).push(e.messaggio);
    }
  });
  return errori;
}
/** Testo facoltativo: vuoto o di soli spazi diventa assente, perché il contratto rifiuta un testo vuoto. */
export function facoltativo(text: string): string | undefined {
  return text.trim() ? text : undefined;
}
