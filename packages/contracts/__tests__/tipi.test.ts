import { readFileSync } from 'node:fs';
import { CourseSchema, TIPI_DOMANDA, erroriTipo } from '@formazione/contracts';

const sample = () => JSON.parse(readFileSync(new URL('../fixtures/sample-course.json', import.meta.url), 'utf8'));
const domanda = (c: any, kind: string) => c.questions.find((q: any) => q.kind === kind);
const messaggi = (c: any) => {
  const r = CourseSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

describe('tipi di domanda', () => {
  it('il corso campione ha un esempio valido di ogni tipo', () => {
    const course = CourseSchema.parse(sample());
    expect(new Set(course.questions.map(q => q.kind))).toEqual(new Set(TIPI_DOMANDA));
    for (const q of course.questions) expect(erroriTipo(q)).toEqual([]);
  });

  it('senza kind una domanda è a scelta singola: i corsi già scritti restano validi', () => {
    const c = sample();
    expect(c.questions[0].kind).toBeUndefined();
    expect(CourseSchema.parse(c).questions[0].kind).toBe('single');
  });

  it.each([
    ['tipo sconosciuto', (c: any) => { c.questions[0].kind = 'match'; }, null],
    ['difficoltà fuori scala', (c: any) => { c.questions[0].difficulty = 'facile'; }, null],
    ['motivazione vuota', (c: any) => { domanda(c, 'fillblank').options[1].rationale = '  '; }, null],
    ['situazione su un tipo diverso', (c: any) => { c.questions[0].situation = 'Contesto'; }, 'vale solo per il tipo scenario'],
    ['vero/falso con opzioni invertite', (c: any) => { const q = domanda(c, 'truefalse'); q.options[0].text = 'Falso'; q.options[1].text = 'Vero'; }, '«Vero» e «Falso»'],
    ['completa la frase senza spazio', (c: any) => { domanda(c, 'fillblank').prompt = 'Il referente accoglie il collega.'; }, 'esattamente uno spazio'],
    ['completa la frase con due spazi', (c: any) => { domanda(c, 'fillblank').prompt = 'Il ___ accoglie il ___.'; }, 'esattamente uno spazio'],
    ['scenario senza situazione', (c: any) => { delete domanda(c, 'scenario').situation; }, 'la situazione è obbligatoria'],
    ['intruso con opzioni duplicate', (c: any) => { const q = domanda(c, 'oddOneOut'); q.options[1].text = q.options[0].text; }, 'Opzioni duplicate'],
    ['intruso con la giusta troppo lunga', (c: any) => { domanda(c, 'oddOneOut').options[2].text = 'Assegnare le ferie e decidere i turni di tutto il reparto'; }, 'più lunga di 1,5 volte'],
    ['correggi senza parte sbagliata', (c: any) => { delete domanda(c, 'correctStatement').wrong; }, 'la parte sbagliata è obbligatoria'],
    ['parte sbagliata assente dalla frase', (c: any) => { domanda(c, 'correctStatement').wrong = 'cliente'; }, 'esattamente una volta'],
    ['multipla con una sola giusta', (c: any) => { domanda(c, 'multiple').correctOptionIds = ['option-2-mu-0']; }, 'almeno 2 risposte giuste'],
    ['multipla tutta giusta', (c: any) => { domanda(c, 'multiple').correctOptionIds = ['option-2-mu-0', 'option-2-mu-1', 'option-2-mu-2', 'option-2-mu-3']; }, 'almeno una risposta sbagliata'],
    ['multipla con giuste ripetute', (c: any) => { domanda(c, 'multiple').correctOptionIds = ['option-2-mu-0', 'option-2-mu-0']; }, 'opzioni diverse'],
    ['multipla con giusta inventata', (c: any) => { domanda(c, 'multiple').correctOptionIds = ['option-2-mu-0', 'inventata']; }, 'opzioni diverse'],
    ['multipla con correctOptionId', (c: any) => { domanda(c, 'multiple').correctOptionId = 'option-2-mu-0'; }, 'vanno in correctOptionIds'],
    ['scelta singola con correctOptionIds', (c: any) => { c.questions[0].correctOptionIds = ['option-1-a', 'option-1-b']; }, 'vale solo per il tipo multiple'],
    ['scelta singola senza giusta', (c: any) => { delete c.questions[0].correctOptionId; }, 'Manca la risposta giusta'],
    ['parte sbagliata due volte', (c: any) => { domanda(c, 'correctStatement').sentence = 'Il fornitore e il fornitore accolgono.'; }, 'esattamente una volta'],
  ])('rifiuta: %s', (_, muta, atteso) => {
    const c = sample(); muta(c);
    const m = messaggi(c);
    expect(m.length).toBeGreaterThan(0);
    if (atteso) expect(m.join(' | ')).toContain(atteso);
  });

  it('1,5 volte esatte sono ammesse, un carattere in più no (punti di codice, come Python)', () => {
    const base = { kind: 'oddOneOut' as const, prompt: 'Intruso?', correctOptionId: 'a' };
    const opts = (giusta: string) => [{ id: 'a', text: giusta }, { id: 'b', text: 'xxxx' }, { id: 'c', text: 'yy' }];
    expect(erroriTipo({ ...base, options: opts('aaaaaa') })).toEqual([]);
    expect(erroriTipo({ ...base, options: opts('aaaaaaa') })).toHaveLength(1);
    // Un'emoji è un punto di codice ma due unità UTF-16: conta 1, come len() di Python.
    expect(erroriTipo({ ...base, options: opts('aaaaa\u{1F600}') })).toEqual([]);
  });

  it('la lunghezza si controlla anche sulla scelta singola, come le domande del quiz in Civis', () => {
    // verifica-contenuti.mjs righe 924–930.
    const q = { kind: 'single' as const, prompt: 'Domanda?', correctOptionId: 'a', options: [{ id: 'a', text: 'giusta molto molto lunga' }, { id: 'b', text: 'no' }] };
    expect(erroriTipo(q)).toHaveLength(1);
  });
});
