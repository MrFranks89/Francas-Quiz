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
    expect(casi.map(c => c.rule)).toEqual(expect.arrayContaining(['opzioni_duplicate', 'giusta_troppo_lunga']));
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
