// Tipi di domanda e loro regole di qualità.
//
// Tutti i tipi qui si correggono come una scelta singola (un'opzione giusta fra
// quelle mostrate): motore d'esame, soglia, giudizio e riepilogo non cambiano.
// La traduzione di riferimento di ogni tipo in scelta singola è
// `normalizzaPerRipasso` in packages/civis-ui/src/ripasso.ts (copiata da Civis).
// Le forme dei dati vengono dagli step di Civis (src/lezione/TrueFalseStep,
// FillBlankStep, ScenarioStep, OddOneOutStep, CorrectStatementStep).
//
// Le stesse regole, con gli stessi messaggi, sono in
// services/api/formazione_api/generation/models.py (errori_tipo); i casi
// condivisi stanno in services/api/tests/fixtures/invalid-course-cases.json.

export const TIPI_DOMANDA = ['single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement'] as const;
export type TipoDomanda = (typeof TIPI_DOMANDA)[number];

// Livelli letti da DifficultyBadge di Civis (packages/civis-ui/src/comune/DifficultyBadge.tsx):
// le chiavi della mappa sono 'base', 'medio', 'avanzato'; ogni altro valore non viene disegnato.
export const DIFFICOLTA = ['base', 'medio', 'avanzato'] as const;

// Opzioni fisse del vero/falso, nell'ordine di Civis (TrueFalseStep e normalizzaPerRipasso:
// options: ['Vero', 'Falso']). Non si mescolano.
export const OPZIONI_VERO_FALSO = ['Vero', 'Falso'] as const;

// Segnaposto della parola mancante (FillBlankStep di Civis: "La frase usa "___" come segnaposto").
export const SPAZIO = '___';

/** Campi di presentazione propri di un tipo: su ogni altro tipo sono vietati. */
const CAMPI_DEL_TIPO: Record<string, TipoDomanda> = { situation: 'scenario', sentence: 'correctStatement', wrong: 'correctStatement' };

export type DomandaDaControllare = {
  kind: TipoDomanda; prompt: string; options: { id: string; text: string }[]; correctOptionId: string;
  situation?: string | null; sentence?: string | null; wrong?: string | null;
};
/** `campo`: percorso relativo alla domanda ('prompt', 'situation', 'options'...), per mostrare l'errore sotto il campo. */
export type ErroreDomanda = { campo: string; messaggio: string };

/** Occorrenze non sovrapposte, come str.count di Python. */
function occorrenze(testo: string, parte: string): number {
  return parte ? testo.split(parte).length - 1 : 0;
}
/** Lunghezza in punti di codice, come len() di Python (non in unità UTF-16). */
const lunghezza = (testo: string) => Array.from(testo.trim()).length;

/**
 * Regole per tipo. Riscritte, non copiate, da C:\Civica\CivicaApp\scripts\verifica-contenuti.mjs
 * (righe 281–331), che le applica a scenario, intruso e correggi l'errore:
 * - una sola risposta giusta: qui è garantita dalla forma (un solo correctOptionId);
 * - indice della giusta valido: correctOptionId deve essere fra le opzioni (controllo del corso);
 * - nessuna opzione duplicata;
 * - la giusta non più lunga di 1,5 volte la più lunga delle altre (in Civis è un conteggio
 *   segnalato; qui, su richiesta, è un errore: l'indizio vale per chi risponde).
 */
export function erroriTipo(q: DomandaDaControllare): ErroreDomanda[] {
  const errori: ErroreDomanda[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  for (const [campo, tipo] of Object.entries(CAMPI_DEL_TIPO)) {
    const valore = (q as Record<string, unknown>)[campo];
    if (q.kind !== tipo && valore !== undefined && valore !== null) err(campo, `Il campo ${campo} vale solo per il tipo ${tipo}`);
  }
  if (q.kind === 'truefalse') {
    const testi = q.options.map(o => o.text.trim());
    if (testi.length !== 2 || testi[0] !== OPZIONI_VERO_FALSO[0] || testi[1] !== OPZIONI_VERO_FALSO[1]) {
      err('options', 'Vero o falso: le opzioni sono esattamente «Vero» e «Falso», in quest\'ordine');
    }
  }
  if (q.kind === 'fillblank' && occorrenze(q.prompt, SPAZIO) !== 1) {
    err('prompt', `Completa la frase: il testo deve contenere esattamente uno spazio ${SPAZIO}`);
  }
  if (q.kind === 'scenario' && !q.situation?.trim()) err('situation', 'Scenario: la situazione è obbligatoria');
  if (q.kind === 'correctStatement') {
    if (!q.sentence?.trim()) err('sentence', 'Correggi l\'errore: la frase è obbligatoria');
    if (!q.wrong?.trim()) err('wrong', 'Correggi l\'errore: la parte sbagliata è obbligatoria');
    else if (q.sentence?.trim() && occorrenze(q.sentence, q.wrong) !== 1) {
      err('wrong', 'Correggi l\'errore: la parte sbagliata deve comparire esattamente una volta nella frase');
    }
  }
  if (q.kind === 'scenario' || q.kind === 'oddOneOut' || q.kind === 'correctStatement') {
    const testi = q.options.map(o => o.text.trim());
    if (new Set(testi).size !== testi.length) err('options', 'Opzioni duplicate');
    const giusta = q.options.findIndex(o => o.id === q.correctOptionId);
    if (giusta >= 0 && q.options.length > 1) {
      const rivale = Math.max(...q.options.filter((_, i) => i !== giusta).map(o => lunghezza(o.text)));
      // Confronto in interi: giusta > 1,5·rivale  ⇔  2·giusta > 3·rivale.
      if (2 * lunghezza(q.options[giusta].text) > 3 * rivale) {
        err('options', 'La risposta giusta è più lunga di 1,5 volte la più lunga delle altre: si riconosce senza conoscere la materia');
      }
    }
  }
  return errori;
}
