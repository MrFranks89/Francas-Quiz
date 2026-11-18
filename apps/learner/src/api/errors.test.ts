import { ErroreGenerazione, apiErrorMessage, blocchiSalvati } from './errors';
it('shows provider and budget error messages sent as structured detail', () => {
  expect(
    apiErrorMessage(
      {
        detail: { code: 'budget_exceeded', message: 'Il documento supera il budget configurato.' },
      },
      'Generazione non riuscita.',
    ),
  ).toBe('Il documento supera il budget configurato.');
});
it('shows the readable provider cause message, not the structured cause', () => {
  expect(
    apiErrorMessage(
      {
        detail: {
          code: 'provider_error',
          message: 'Il fornitore ha rifiutato la richiesta: limite di utilizzo raggiunto (429)',
          cause: {
            classe: 'RateLimitError',
            statoHttp: 429,
            tipo: null,
            codice: '429',
            messaggio: 'Quota exceeded',
          },
        },
      },
      'Generazione non riuscita.',
    ),
  ).toBe('Il fornitore ha rifiutato la richiesta: limite di utilizzo raggiunto (429)');
});
it('keeps string errors and handles malformed or missing detail explicitly', () => {
  expect(apiErrorMessage({ detail: 'Bozza non trovata' }, 'Errore')).toBe('Bozza non trovata');
  for (const value of [
    null,
    {},
    { detail: [] },
    { detail: { code: 'failure' } },
    { detail: { message: 34 } },
    { detail: '' },
  ])
    expect(apiErrorMessage(value, 'Errore comprensibile')).toBe('Errore comprensibile');
});
it('reads the saved chunks of an interrupted generation from the error detail', () => {
  const payload = {
    detail: {
      code: 'provider_error',
      message: 'Errore AI controllato',
      savedChunks: 5,
      totalChunks: 10,
    },
  };
  expect(blocchiSalvati(payload)).toEqual({ salvati: 5, totali: 10 });
  const errore = new ErroreGenerazione(apiErrorMessage(payload, 'x'), blocchiSalvati(payload));
  expect(errore).toBeInstanceOf(Error);
  expect(errore.message).toBe('Errore AI controllato');
  expect(errore.ripresa).toEqual({ salvati: 5, totali: 10 });
  for (const value of [
    null,
    { detail: 'testo' },
    { detail: { code: 'needs_review', message: 'Verificare' } },
    { detail: { savedChunks: '5', totalChunks: 10 } },
    { detail: { savedChunks: 5 } },
    { detail: { savedChunks: -1, totalChunks: 10 } },
    { detail: { savedChunks: 11, totalChunks: 10 } },
  ])
    expect(blocchiSalvati(value)).toBeNull();
});
