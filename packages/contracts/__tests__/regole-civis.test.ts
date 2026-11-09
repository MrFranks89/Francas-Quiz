// Regole di singola domanda portate da Civis (C:\Civica\CivicaApp\scripts\verifica-contenuti.mjs).
// Stesse regole e stessi messaggi in services/api/formazione_api/generation/regole.py
// (services/api/tests/test_regole_civis.py); i casi condivisi stanno in invalid-course-cases.json.
import { readFileSync } from 'node:fs';
import { erroriTipo, normalizzaOpzione, type TipoDomanda } from '@formazione/contracts';

const DUPLICATE = 'Opzioni duplicate';
const LUNGA = 'La risposta giusta è più lunga di 1,5 volte la più lunga delle altre: si riconosce senza conoscere la materia';

const messaggi = (kind: TipoDomanda, opzioni: string[], giusta: string | null = 'a', giuste?: string[], prompt = 'Domanda?') =>
  erroriTipo({
    kind, prompt, correctOptionId: giusta, correctOptionIds: giuste,
    options: opzioni.map((text, k) => ({ id: String.fromCharCode(97 + k), text })),
  }).map(e => e.messaggio);

describe('regole portate da Civis', () => {
  it('opzioni duplicate a meno di spazi e maiuscole, su ogni tipo', () => {
    expect(messaggi('single', ['Prima', '  prima  '])).toEqual([DUPLICATE]);
    expect(messaggi('single', ['Il  referente', 'il referente'])).toEqual([DUPLICATE]);
    expect(messaggi('fillblank', ['secondo', 'Secondo'], 'a', undefined, 'Il ___ paragrafo.')).toEqual([DUPLICATE]);
    expect(messaggi('oddOneOut', ['Uno', 'UNO', 'Tre'], 'c')).toEqual([DUPLICATE]);
    expect(messaggi('multiple', ['Uno', 'Due', 'uno ', 'Tre'], null, ['a', 'b'])).toEqual([DUPLICATE]);
  });

  it('gli accenti distinguono le opzioni, la loro scrittura no', () => {
    expect(messaggi('fillblank', ['papa', 'papà'], 'a', undefined, 'Il ___ arriva.')).toEqual([]);
    expect(normalizzaOpzione('\u00e8')).toBe(normalizzaOpzione('e\u0300'));
    expect(messaggi('fillblank', ['\u00e8', 'e\u0300'], 'a', undefined, 'Il cielo ___ blu.')).toEqual([DUPLICATE]);
  });

  it('giusta troppo lunga anche sulla scelta singola', () => {
    expect(messaggi('single', ['giusta molto molto lunga', 'no'])).toEqual([LUNGA]);
    expect(messaggi('single', ['aaaaaa', 'xxxx'])).toEqual([]);
    expect(messaggi('single', ['aaaaaaa', 'xxxx'])).toEqual([LUNGA]);
  });

  it('giusta troppo lunga: non su fillblank né su truefalse', () => {
    expect(messaggi('fillblank', ['amministrazione', 'ente'], 'a', undefined, 'La ___ decide.')).toEqual([]);
    expect(messaggi('truefalse', ['Vero', 'Falso'], 'b')).toEqual([]);
  });

  it('giusta troppo lunga sulla multipla, opzione per opzione', () => {
    const lunga = 'Testo di formazione con molti dettagli aggiuntivi';
    expect(messaggi('multiple', [lunga, 'Secondo paragrafo', 'Una tabella', 'Un grafico'], null, ['a', 'b'])).toEqual([LUNGA]);
    expect(messaggi('multiple', ['Testo di formazione', 'Secondo paragrafo', 'Una tabella', 'Un grafico'], null, ['a', 'b'])).toEqual([]);
    expect(messaggi('multiple', ['Uno', 'Due', 'Una sbagliata molto più lunga', 'Tre'], null, ['a', 'b'])).toEqual([]);
  });

  it('i casi condivisi sono rifiutati per la regola dichiarata', () => {
    // Esclude che un caso sia rifiutato per un motivo diverso da quello che vuole provare.
    const base = new URL('../../../services/api/tests/fixtures/', import.meta.url);
    const corso = JSON.parse(readFileSync(new URL('generated-course.json', base), 'utf8'));
    type Change = { path: (string | number)[]; value: unknown };
    type Caso = (Change | { changes: Change[] }) & { rule?: string; messaggio?: string };
    const casi = (JSON.parse(readFileSync(new URL('invalid-course-cases.json', base), 'utf8')) as Caso[]).filter(c => c.rule);
    expect(casi.map(c => c.rule)).toEqual(expect.arrayContaining(['opzioni_duplicate', 'giusta_troppo_lunga', 'autoreferenziale', 'contesto_non_viaggia', 'tempo_relativo']));
    for (const caso of casi) {
      const invalido = structuredClone(corso);
      for (const change of 'changes' in caso ? caso.changes : [caso]) {
        let target = invalido;
        for (const key of change.path.slice(0, -1)) target = target[key];
        target[change.path.at(-1)!] = change.value;
      }
      const trovati = invalido.questions.flatMap((q: any) => erroriTipo(q).map(e => e.messaggio));
      expect(trovati, caso.rule).toContain(caso.messaggio);
    }
  });
});

// --- formulazioni che non reggono fuori dalla lezione (verifica-contenuti.mjs righe 94, 100, 106) ---
const CODICI: [string, string][] = [
  ['Formulazione autoreferenziale', 'autoreferenziale'],
  ['Rimanda a un contesto', 'contesto_non_viaggia'],
  ['Riferimento temporale', 'tempo_relativo'],
];
type Formule = { kind?: TipoDomanda; prompt?: string; opzioni?: string[]; spiegazione?: string; motivazioni?: string[]; situation?: string; sentence?: string; wrong?: string };
const formule = ({ kind = 'single', prompt = 'Quale ente decide?', opzioni = ['Il comune', 'La regione'], spiegazione = 'Decide il comune.', motivazioni, situation, sentence, wrong }: Formule) =>
  erroriTipo({
    kind, prompt, correctOptionId: 'a', explanation: spiegazione, situation, sentence, wrong,
    options: opzioni.map((text, k) => ({ id: String.fromCharCode(97 + k), text, rationale: motivazioni?.[k] })),
  }).map(e => [e.campo, CODICI.find(([inizio]) => e.messaggio.startsWith(inizio))?.[1] ?? e.messaggio]);

describe('formule che non reggono fuori dalla lezione', () => {
  it('autoreferenziale in ogni campo, come in Civis', () => {
    expect(formule({ prompt: 'Come hai visto, quale ente decide?' })).toEqual([['prompt', 'autoreferenziale']]);
    expect(formule({ opzioni: ['Il comune, come spiegato sopra', 'La regione, come in ogni caso simile'] })).toEqual([['options', 'autoreferenziale']]);
    expect(formule({ motivazioni: ['', 'La lezione dice che non decide.'] })).toEqual([['options', 'autoreferenziale']]);
    expect(formule({ spiegazione: 'Il primo gruppo comprende 121 SLL, come indicato nel testo.' })).toEqual([['explanation', 'autoreferenziale']]);
    expect(formule({ kind: 'scenario', situation: 'Nel modulo precedente Marta ha letto il manuale.' })).toEqual([['situation', 'autoreferenziale']]);
  });

  it('contesto e tempo solo nel testo della domanda', () => {
    expect(formule({ prompt: 'Quale ente decide, secondo il grafico?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
    expect(formule({ prompt: 'Quale ente decide, nell’immagine?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
    expect(formule({ prompt: 'Quale ente decide attualmente?' })).toEqual([['prompt', 'tempo_relativo']]);
    expect(formule({ kind: 'scenario', situation: 'Di recente Marta è stata assunta.' })).toEqual([['situation', 'tempo_relativo']]);
    expect(formule({ spiegazione: 'Come mostrato qui sopra, attualmente decide il comune.' })).toEqual([]);
    expect(formule({ opzioni: ['Il comune, attualmente', 'La regione qui sopra'] })).toEqual([]);
  });

  it('falsi positivi italiani esclusi', () => {
    expect(formule({ prompt: 'Che cosa si verifica al momento della firma?' })).toEqual([]);
    expect(formule({ prompt: 'Che cosa si verifica al momento dell\'assunzione?' })).toEqual([]);
    expect(formule({ prompt: 'Quale ente decide al momento?' })).toEqual([['prompt', 'tempo_relativo']]);
    expect(formule({ spiegazione: 'Decide il comune, come indicato dall\'articolo 5.' })).toEqual([]);
    expect(formule({ prompt: 'Come mostrato dai dati Istat, quale ente decide?' })).toEqual([]);
    expect(formule({ prompt: 'Come mostrato, quale ente decide?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
    expect(formule({ kind: 'scenario', prompt: 'Che cosa fa Marta in questa situazione?', situation: 'Marta arriva.' })).toEqual([]);
    expect(formule({ prompt: 'Che cosa fa Marta in questa situazione?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
    expect(formule({ kind: 'correctStatement', prompt: 'Quale parola è sbagliata in questa frase?', sentence: 'Il comune decide.', wrong: 'comune' })).toEqual([]);
    expect(formule({ prompt: 'Quale ente decide oggi? Che cosa fa il modulista?' })).toEqual([]);
  });

  it('apostrofo tipografico come quello dritto', () => {
    expect(formule({ prompt: 'Che cosa mostra l’esempio sopra?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
    expect(formule({ prompt: 'Che cosa fa l’apparato?' })).toEqual([]);
    expect(formule({ prompt: 'Che cosa ti suggerisce l’app consiglia?' })).toEqual([['prompt', 'autoreferenziale']]);
  });

  it('il messaggio cita la formula trovata', () => {
    const [e] = erroriTipo({ kind: 'single', prompt: 'Quale ente decide attualmente?', correctOptionId: 'a', options: [{ id: 'a', text: 'Il comune' }, { id: 'b', text: 'La regione' }] });
    expect(e.messaggio).toContain('«attualmente»');
  });
});

it('il rimando alla slide non viaggia (non è in Civis: qui il test sta staccato dalle slide)', () => {
  expect(formule({ prompt: 'Che cosa dice la slide sul comune?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
  expect(formule({ prompt: 'Quale ente, nelle slide, decide?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
  expect(formule({ prompt: 'Che cosa riporta questa slide?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
  expect(formule({ prompt: 'Che cosa riporta quest’slide?' })).toEqual([['prompt', 'contesto_non_viaggia']]);
  expect(formule({ prompt: 'Quale ente decide sullo slideshow?' })).toEqual([]);
});

// Rimandi al materiale da cui nasce il corso: non in Civis, che non genera da documenti. Stessi casi di
// test_regole_civis.py; decisione dell'utente del 9 novembre 2026.
describe('rimandi al materiale', () => {
  it('sono autoreferenziali in ogni campo', () => {
    expect(formule({ spiegazione: 'Il testo indica che decide il comune.' })).toEqual([['explanation', 'autoreferenziale']]);
    expect(formule({ spiegazione: 'Il materiale riporta che decide il comune.' })).toEqual([['explanation', 'autoreferenziale']]);
    expect(formule({ spiegazione: 'Il documento afferma che decide il comune.' })).toEqual([['explanation', 'autoreferenziale']]);
    expect(formule({ prompt: 'Quale ente decide, secondo il materiale?' })).toEqual([['prompt', 'autoreferenziale']]);
    expect(formule({ prompt: 'Quale variazione riporta il materiale?' })).toEqual([['prompt', 'autoreferenziale']]);
    expect(formule({ prompt: 'Quale ente indica il documento?' })).toEqual([['prompt', 'autoreferenziale']]);
    expect(formule({ motivazioni: ['', 'Lo afferma il testo, ma per un altro ente.'] })).toEqual([['options', 'autoreferenziale']]);
    expect(formule({ opzioni: ['Il comune, come riportato nel documento', 'La regione, per ogni caso simile'] })).toEqual([['options', 'autoreferenziale']]);
    expect(formule({ kind: 'scenario', situation: 'Marta legge che, secondo il documento, decide il comune.' })).toEqual([['situation', 'autoreferenziale']]);
  });

  it('«secondo il testo» è autoreferenziale, non contesto', () => {
    expect(formule({ prompt: 'Di quanto sono cresciuti gli occupati, secondo il testo?' })).toEqual([['prompt', 'autoreferenziale']]);
    expect(formule({ spiegazione: 'Secondo il testo, decide il comune.' })).toEqual([['explanation', 'autoreferenziale']]);
  });

  it('falsi positivi esclusi', () => {
    expect(formule({ prompt: 'Secondo il documento di valutazione dei rischi, chi decide?' })).toEqual([]);
    expect(formule({ prompt: 'Secondo il testo unico sulla sicurezza, chi decide?' })).toEqual([]);
    expect(formule({ prompt: 'Quale articolo riporta il testo della norma?' })).toEqual([]);
    expect(formule({ spiegazione: 'Decide il comune, come riportato nel documento di sintesi della regione.' })).toEqual([]);
    expect(formule({ prompt: "Che cosa indica il documento d'identità?" })).toEqual([]);
    expect(formule({ prompt: 'Il documento di identità indica la scadenza?' })).toEqual([]);
    expect(formule({ spiegazione: 'Il testo indicato in bolletta è il totale.' })).toEqual([]);
  });
});
