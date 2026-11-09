/**
 * Riaprire dal server un corso o una bozza salvati prima delle regole di qualità: il client li
 * legge con la validazione strutturale (state/lettura.ts), non con quella di scrittura.
 */
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import vecchio from '../../../../services/api/tests/fixtures/corso-prima-delle-regole.json';
import { draftRequest, recoverDraft } from './generation';

const risposta = (status: number, corpo: unknown) =>
  ({ ok: status < 400, status, json: async () => corpo }) as Response;
const originale = global.fetch;
afterEach(() => {
  global.fetch = originale;
});

describe('riapertura di un corso vecchio', () => {
  test('corso pubblicato', async () => {
    const fetch = jest.fn(async (_url: string) =>
      risposta(200, { id: 'c1', status: 'published', revision: 2, course: vecchio }),
    );
    global.fetch = fetch as unknown as typeof global.fetch;
    const corso = await recoverDraft('c1');
    expect(corso.course.id).toBe('corso-prima-delle-regole');
    expect(fetch.mock.calls[0][0]).toMatch(/\/courses\/c1$/);
  });
  test('bozza, quando il corso non è pubblicato', async () => {
    const fetch = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(risposta(404, { detail: 'Risorsa non trovata.' }))
      .mockResolvedValueOnce(
        risposta(200, { id: 'c1', status: 'draft', revision: 1, course: vecchio }),
      );
    global.fetch = fetch as unknown as typeof global.fetch;
    const bozza = await recoverDraft('c1');
    expect(bozza.status).toBe('draft');
    expect(bozza.course.questions).toHaveLength(14);
  });
  test('bozza riletta dopo un salvataggio', async () => {
    global.fetch = jest.fn(async () =>
      risposta(200, { id: 'c1', status: 'draft', revision: 2, course: vecchio }),
    ) as unknown as typeof global.fetch;
    expect((await draftRequest('/drafts/c1')).revision).toBe(2);
  });
});
