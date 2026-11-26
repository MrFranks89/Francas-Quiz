/**
 * Ripresa di una generazione interrotta, dal percorso vero del pannello: risposta d'errore della rotta
 * (`detail.savedChunks`, `detail.totalChunks`) → api/generation.ts → api/errors.ts → stato
 * (state/generazione.ts) → pulsanti. Il fetch è finto e risponde come services/api (ripresa_generazione.py).
 */
import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Extraction } from '../api/documents';
import { GenerationPanel } from './GenerationPanel';

// Il modulo nativo non c'è sotto Jest: il tema di civis-ui (letto dai componenti di ui.tsx) usa AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const risposta = (status: number, corpo: unknown) =>
  ({ ok: status < 400, status, json: async () => corpo }) as Response;

const configurazione = {
  configured: true,
  provider: 'anthropic',
  missing: [],
  spending: { spentUsd: '0', budgetUsd: '5.00', remainingUsd: '5.00' },
};
const stima = (chunks: number, savedChunks: number, maxCostUsd: string) => ({
  available: true,
  allowed: true,
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  chunks,
  savedChunks,
  totalChunks: 4,
  maxCostUsd,
  upperBoundUsd: maxCostUsd,
  unreadPages: [],
  excludedPages: [],
});
const fallita = {
  detail: { code: 'provider_error', message: 'Errore AI controllato', savedChunks: 2, totalChunks: 4 },
};

const estrazione = {
  id: 'e'.repeat(32),
  status: 'ready',
  blocks: [{ id: 'p1', text: 'Leggere il manuale.', page: 1, label: 'Pagina 1' }],
  warnings: [],
} as unknown as Extraction;

const originale = global.fetch;
afterEach(() => {
  global.fetch = originale;
});

function server() {
  let salvati = 0;
  const generazioni: unknown[] = [];
  const fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/generation/config')) return risposta(200, configurazione);
    if (url.includes('/generation-estimate'))
      return risposta(200, salvati ? stima(2, 2, '0.05') : stima(4, 0, '0.10'));
    if (url.endsWith('/generate')) {
      generazioni.push(JSON.parse(String(init?.body)));
      salvati = 2;
      return risposta(502, fallita);
    }
    throw new Error(`Richiesta inattesa: ${url}`);
  });
  global.fetch = fetch as unknown as typeof global.fetch;
  return generazioni;
}

const testi = (albero: ReactTestRenderer.ReactTestRenderer) =>
  albero.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const pulsante = (albero: ReactTestRenderer.ReactTestRenderer, etichetta: string) =>
  albero.root.findAll(
    (n) => n.props.accessibilityLabel === etichetta && typeof n.props.onPress === 'function',
  );

async function attendi() {
  for (let i = 0; i < 5; i++) await act(async () => await Promise.resolve());
}

describe('GenerationPanel, ripresa dopo un errore', () => {
  test('dopo un blocco fallito: testo, «Riprendi la generazione», preventivo ridotto e ricomincia', async () => {
    const generazioni = server();
    let albero!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      albero = ReactTestRenderer.create(<GenerationPanel extraction={estrazione} onDraft={() => {}} />);
    });
    await attendi();
    expect(pulsante(albero, 'Riprendi la generazione')).toHaveLength(0);
    expect(pulsante(albero, 'Ricomincia da capo')).toHaveLength(0);
    await act(async () => pulsante(albero, 'Genera il corso')[0].props.onPress());
    await attendi();

    const visibili = testi(albero);
    expect(visibili).toContain('Errore AI controllato');
    expect(visibili).toContain(
      '2 di 4 blocchi salvati: riprovando si riparte dal blocco 3 per completare il corso.',
    );
    expect(visibili).toContain('Fino a 2 blocchi da generare su 4: 2 già salvati');
    expect(pulsante(albero, 'Riprendi la generazione')).not.toHaveLength(0);
    expect(pulsante(albero, 'Genera il corso')).toHaveLength(0);
    expect(visibili).toContain('Riprendi la generazione');
    expect(visibili).not.toContain('Genera il corso');

    // Riprendi: stesso corpo della prima richiesta (stessa impronta sul server).
    await act(async () => pulsante(albero, 'Riprendi la generazione')[0].props.onPress());
    await attendi();
    expect(generazioni[1]).toEqual(generazioni[0]);
    expect(generazioni[0]).toEqual({
      title: 'Il mio corso',
      acknowledgeWarnings: false,
      excludePages: [],
      questionsPerCheck: 2,
    });

    await act(async () => pulsante(albero, 'Ricomincia da capo')[0].props.onPress());
    await attendi();
    expect(generazioni[2]).toEqual({ ...(generazioni[0] as object), restart: true });
  });
});
