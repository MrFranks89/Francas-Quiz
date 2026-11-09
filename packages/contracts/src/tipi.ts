// Tipi di domanda e loro regole di qualità.
//
// Tutti i tipi tranne `multiple` si correggono come una scelta singola (un'opzione giusta fra
// quelle mostrate): motore d'esame, soglia, giudizio e riepilogo non cambiano.
// La traduzione di riferimento di ogni tipo in scelta singola è
// `normalizzaPerRipasso` in packages/civis-ui/src/ripasso.ts (copiata da Civis).
// Le forme dei dati vengono dagli step di Civis (src/lezione/TrueFalseStep,
// FillBlankStep, ScenarioStep, OddOneOutStep, CorrectStatementStep).
//
// Le stesse regole, con gli stessi messaggi, sono in
// services/api/formazione_api/generation/models.py (errori_tipo); i casi
// condivisi stanno in services/api/tests/fixtures/invalid-course-cases.json.

export const TIPI_DOMANDA = ['single', 'truefalse', 'fillblank', 'scenario', 'oddOneOut', 'correctStatement', 'multiple'] as const;
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
  kind: TipoDomanda; prompt: string; options: { id: string; text: string }[];
  correctOptionId?: string | null; correctOptionIds?: string[] | null;
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
/** Tipi su cui si controlla la lunghezza della giusta. */
const TIPI_CON_LUNGHEZZA: readonly TipoDomanda[] = ['single', 'scenario', 'oddOneOut', 'correctStatement', 'multiple'];
/**
 * Testo di un'opzione per il confronto dei duplicati: NFC, spazi compressi, minuscole. Gli accenti
 * restano, perché in italiano distinguono parole diverse (papa/papà, e/è); NFC rende uguali le due
 * scritture di «è», identiche a vedersi. Stessa funzione di normalizza_opzione in regole.py.
 */
export const normalizzaOpzione = (testo: string) => testo.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Regole per tipo. Riscritte, non copiate, da C:\Civica\CivicaApp\scripts\verifica-contenuti.mjs
 * (righe 281–331), che le applica a scenario, intruso e correggi l'errore:
 * - una sola risposta giusta: qui è garantita dalla forma (un solo correctOptionId);
 * - indice della giusta valido: correctOptionId deve essere fra le opzioni (controllo del corso);
 * - nessuna opzione duplicata, su tutti i tipi, a meno di spazi e maiuscole (righe 290 e 904);
 * - la giusta non più lunga di 1,5 volte la più lunga delle altre, anche su single e multiple
 *   (righe 292–301 e 924–930; in Civis è un conteggio segnalato; qui, su richiesta, è un errore:
 *   l'indizio vale per chi risponde).
 */
export function erroriTipo(q: DomandaDaControllare): ErroreDomanda[] {
  const errori: ErroreDomanda[] = [];
  const err = (campo: string, messaggio: string) => errori.push({ campo, messaggio });
  for (const [campo, tipo] of Object.entries(CAMPI_DEL_TIPO)) {
    const valore = (q as Record<string, unknown>)[campo];
    if (q.kind !== tipo && valore !== undefined && valore !== null) err(campo, `Il campo ${campo} vale solo per il tipo ${tipo}`);
  }
  // Risposta multipla: più giuste in `correctOptionIds` (almeno 2, almeno una sbagliata), mai
  // `correctOptionId`; tutti gli altri tipi l'opposto. Decisione dell'utente del 28 ottobre 2026.
  if (q.kind === 'multiple') {
    const giuste = q.correctOptionIds ?? [];
    const ids = new Set(q.options.map(o => o.id));
    if (q.correctOptionId !== undefined && q.correctOptionId !== null) err('correctOptionId', 'Risposta multipla: le giuste vanno in correctOptionIds');
    if (giuste.length < 2) err('correctOptionIds', 'Risposta multipla: servono almeno 2 risposte giuste');
    else if (new Set(giuste).size !== giuste.length || giuste.some(g => !ids.has(g))) err('correctOptionIds', 'Risposta multipla: le giuste devono essere opzioni diverse della domanda');
    else if (giuste.length >= q.options.length) err('correctOptionIds', 'Risposta multipla: serve almeno una risposta sbagliata');
  } else {
    if (q.correctOptionIds !== undefined && q.correctOptionIds !== null) err('correctOptionIds', 'Il campo correctOptionIds vale solo per il tipo multiple');
    if (!q.correctOptionId) err('correctOptionId', 'Manca la risposta giusta');
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
  // Opzioni duplicate, su tutti i tipi, dopo normalizzaOpzione (verifica-contenuti.mjs righe 290 e
  // 904 confronta i testi così come sono; qui « prima » e «Prima» sono la stessa risposta).
  const normalizzati = q.options.map(o => normalizzaOpzione(o.text));
  if (new Set(normalizzati).size !== normalizzati.length) err('options', 'Opzioni duplicate');
  // Giusta troppo lunga (verifica-contenuti.mjs righe 292–301 e 924–930): non su fillblank (parole
  // singole) né su truefalse (opzioni fisse); su multiple ogni giusta contro la più lunga di tutte le
  // altre, la stessa definizione di Civis. Motivazioni in regole.py (violazioni_tipo).
  if (TIPI_CON_LUNGHEZZA.includes(q.kind) && q.options.length > 1) {
    const giuste = q.kind === 'multiple' ? (q.correctOptionIds ?? []) : [q.correctOptionId];
    const indici = [...new Set(giuste.map(g => q.options.findIndex(o => o.id === g)).filter(i => i >= 0))].sort((a, b) => a - b);
    for (const giusta of indici) {
      const rivale = Math.max(...q.options.filter((_, i) => i !== giusta).map(o => lunghezza(o.text)));
      // Confronto in interi: giusta > 1,5·rivale  ⇔  2·giusta > 3·rivale.
      if (2 * lunghezza(q.options[giusta].text) > 3 * rivale) {
        err('options', 'La risposta giusta è più lunga di 1,5 volte la più lunga delle altre: si riconosce senza conoscere la materia');
        break;
      }
    }
  }
  return errori;
}
