import {
  blocchiStima,
  corpoGenerazione,
  elencoPagine,
  etichettaGenerazione,
  statoRipresa,
  testoRipresa,
  percorsoPreventivo,
  messaggioConfigurazione,
  testoEsclusione,
  testoPagineNonLette,
  testoPreventivo,
} from './generazione';

it('messaggioConfigurazione does not mention API providers or keys', () => {
  const attivo = messaggioConfigurazione({
    configured: true,
    provider: 'anthropic',
    missing: [],
  });
  expect(attivo).toBe('Il servizio di generazione è attivo.');
  expect(attivo).not.toMatch(/anthropic|openai|api|token/i);

  const nonConfigurato = messaggioConfigurazione({
    configured: false,
    provider: 'openai',
    missing: ['OPENAI_API_KEY'],
  });
  expect(nonConfigurato).toBe('Il servizio di generazione non è attivo: contatta l’amministratore.');
  expect(nonConfigurato).not.toMatch(/openai|key|token|impostazioni/i);

  const nonLetto = messaggioConfigurazione(null);
  expect(nonLetto).toBe('Il servizio di generazione non è ancora pronto: attendi qualche istante.');
});

it('testoPreventivo shows status without USD amounts or models', () => {
  const pronto = testoPreventivo({
    available: true,
    allowed: true,
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    chunks: 9,
    maxCostUsd: '0.12',
  });
  expect(pronto).toEqual({ testo: 'Elaborazione pronta (9 blocchi).', bloccante: false });
  expect(pronto.testo).not.toMatch(/usd|claude|\$|costo/i);

  const sing = testoPreventivo({ available: true, allowed: true, model: 'm', chunks: 1, maxCostUsd: '0.01' });
  expect(sing.testo).toBe('Elaborazione pronta (1 blocco).');
});

it('blocks when the estimate is unavailable, refused or not loaded without revealing technical error details', () => {
  expect(testoPreventivo(null)).toEqual({ testo: 'Preparazione in corso…', bloccante: true });

  const assente = testoPreventivo({
    available: false,
    allowed: false,
    refusal: {
      code: 'estimate_unavailable',
      message: 'Preventivo non disponibile: Modello senza prezzo.',
    },
  });
  expect(assente).toEqual({
    testo: 'La generazione non è disponibile al momento: riprova più tardi.',
    bloccante: true,
  });

  const rifiutata = testoPreventivo({
    available: true,
    allowed: false,
    model: 'm',
    chunks: 2,
    maxCostUsd: '0.20',
    refusal: { code: 'over_course_limit', message: 'Oltre il limite per corso.' },
  });
  expect(rifiutata).toEqual({
    testo: 'La generazione non è disponibile al momento: riprova più tardi.',
    bloccante: true,
  });
});

it('lists unread and excluded pages', () => {
  expect(elencoPagine([3])).toBe('pagina 3');
  expect(elencoPagine([3, 1])).toBe('pagine 1 e 3');
  expect(elencoPagine([1, 3, 5])).toBe('pagine 1, 3 e 5');
  expect(testoPagineNonLette([1, 3])).toContain('Pagine non lette: pagine 1 e 3');
  expect(testoEsclusione([1, 3])).toBe(
    'Escluse dal corso su richiesta: pagine 1 e 3. Non saranno elaborate e l’esclusione resterà annotata nel corso.',
  );
  expect(testoEsclusione([1, 3])).not.toContain('fornitore');
  expect(testoEsclusione([1, 3])).not.toContain('bozza');
});

it('sends the excluded pages to the estimate and to the generation', () => {
  expect(percorsoPreventivo('e1', [])).toBe('/extractions/e1/generation-estimate');
  expect(percorsoPreventivo('e1', [1, 3])).toBe(
    '/extractions/e1/generation-estimate?excludePages=1&excludePages=3',
  );
  expect(corpoGenerazione('Corso', true, [1, 3])).toEqual({
    title: 'Corso',
    acknowledgeWarnings: true,
    excludePages: [1, 3],
    questionsPerCheck: 2,
  });
  expect(corpoGenerazione('Corso', false, [], false, 3)).toEqual({
    title: 'Corso',
    acknowledgeWarnings: false,
    excludePages: [],
    questionsPerCheck: 3,
  });
});

const conSalvati = {
  available: true,
  allowed: true,
  model: 'claude-haiku-5-5',
  chunks: 5,
  savedChunks: 5,
  totalChunks: 10,
  maxCostUsd: '0.07',
};

it('the estimate counts only the chunks still to generate', () => {
  expect(testoPreventivo(conSalvati)).toEqual({
    testo: 'Elaborazione pronta (5 blocchi da generare su 10: 5 già salvati).',
    bloccante: false,
  });
  expect(blocchiStima(conSalvati)).toBe('5 blocchi da generare su 10: 5 già salvati');
  expect(blocchiStima({ ...conSalvati, chunks: 1, savedChunks: 9 })).toBe(
    '1 blocco da generare su 10: 9 già salvati',
  );
  expect(blocchiStima({ ...conSalvati, chunks: 10, savedChunks: 0 })).toBe('10 blocchi');
  expect(blocchiStima({ available: true, allowed: true, chunks: 1 })).toBe('1 blocco');
});

it('says how many chunks are saved and where the resume starts without mentioning payment or provider', () => {
  expect(testoRipresa({ salvati: 5, totali: 10 })).toBe(
    '5 di 10 blocchi salvati: riprovando si riparte dal blocco 6 per completare il corso.',
  );
  expect(testoRipresa({ salvati: 1, totali: 4 })).toBe(
    '1 di 4 blocchi salvati: riprovando si riparte dal blocco 2 per completare il corso.',
  );
  expect(testoRipresa({ salvati: 4, totali: 4 })).toBe(
    'Tutti i 4 blocchi sono salvati: riprovando si ricompone il corso.',
  );
  expect(testoRipresa({ salvati: 1, totali: 4 })).not.toMatch(/pagano|fornitore/i);
});

it('resume state: the fresh estimate wins, the error detail covers the reload', () => {
  const dallErrore = { salvati: 2, totali: 4 };
  expect(statoRipresa(dallErrore, null)).toEqual(dallErrore);
  expect(statoRipresa(null, conSalvati)).toEqual({ salvati: 5, totali: 10 });
  expect(
    statoRipresa(dallErrore, { ...conSalvati, chunks: 10, savedChunks: 0, totalChunks: 10 }),
  ).toBeNull();
  expect(statoRipresa(dallErrore, { available: false, allowed: false })).toEqual(dallErrore);
  expect(statoRipresa(null, null)).toBeNull();
  expect(statoRipresa({ salvati: 0, totali: 4 }, null)).toBeNull();
});

it('primary button: resume after a failure with saved chunks', () => {
  expect(etichettaGenerazione(false, null)).toBe('Genera il corso');
  expect(etichettaGenerazione(false, { salvati: 5, totali: 10 })).toBe('Riprendi la generazione');
  expect(etichettaGenerazione(true, { salvati: 5, totali: 10 })).toBe('Generazione in corso…');
});

it('restart is sent only when asked, the resume body is the same as the first request', () => {
  expect(corpoGenerazione('Corso', false, [3], true)).toEqual({
    title: 'Corso',
    acknowledgeWarnings: false,
    excludePages: [3],
    restart: true,
    questionsPerCheck: 2,
  });
  expect(corpoGenerazione('Corso', false, [3], false)).toEqual(corpoGenerazione('Corso', false, [3]));
});
