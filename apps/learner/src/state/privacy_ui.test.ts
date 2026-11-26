import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { messaggioConfigurazione, testoPreventivo } from './generazione';

describe('Privacy UI Guardiano (Rilievi 3 e 5)', () => {
  const VIETATI = /\b(Groq|OpenAI|Anthropic|Gemini|USD|apiUrl|API di sviluppo|budget|token)\b/i;

  it('messaggioConfigurazione non contiene mai termini tecnici o economici', () => {
    const rami = [
      messaggioConfigurazione({ configured: true, provider: 'anthropic', missing: [] }),
      messaggioConfigurazione({ configured: false, provider: 'openai', missing: ['OPENAI_API_KEY'] }),
      messaggioConfigurazione({ configured: false, provider: 'groq', missing: [], invalid: ['GENERATION_PROVIDER'] }),
      messaggioConfigurazione(null),
    ];
    for (const testo of rami) {
      expect(testo).not.toMatch(VIETATI);
    }
  });

  it('testoPreventivo non contiene mai importi in USD o modelli', () => {
    const rami = [
      testoPreventivo(null),
      testoPreventivo({ available: false, allowed: false }),
      testoPreventivo({
        available: true,
        allowed: true,
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        chunks: 4,
        maxCostUsd: '0.10',
      }),
      testoPreventivo({
        available: true,
        allowed: false,
        model: 'gpt-4o',
        chunks: 2,
        maxCostUsd: '0.50',
        refusal: { code: 'over_limit', message: 'Limite superato' },
      }),
    ];
    for (const res of rami) {
      expect(res.testo).not.toMatch(VIETATI);
    }
  });

  it('EstimateCard.tsx non espone termini vietati né provider o USD', () => {
    const file = readFileSync(new URL('../components/EstimateCard.tsx', import.meta.url), 'utf8');
    const corpo = file
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('*') && !r.trimStart().startsWith('//'))
      .join('\n');
    expect(corpo).not.toMatch(VIETATI);
  });

  it('GenerationPanel.tsx non espone tasti AI o riferimenti vietati nel codice visibile', () => {
    const file = readFileSync(new URL('../components/GenerationPanel.tsx', import.meta.url), 'utf8');
    const corpo = file
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('*') && !r.trimStart().startsWith('//'))
      .join('\n');
    expect(corpo).not.toContain('Ricontrolla configurazione AI');
    expect(corpo).not.toMatch(/\b(Groq|OpenAI|Anthropic|Gemini|USD|API di sviluppo)\b/i);
  });

  it('ImportScreen.tsx non espone apiUrl o API di sviluppo', () => {
    const file = readFileSync(new URL('../screens/ImportScreen.tsx', import.meta.url), 'utf8');
    const corpo = file
      .split('\n')
      .filter((r) => !r.trimStart().startsWith('*') && !r.trimStart().startsWith('//'))
      .join('\n');
    expect(corpo).not.toMatch(/\b(API di sviluppo)\b/i);
    expect(corpo).not.toMatch(/\bapiUrl\b/);
  });
});
