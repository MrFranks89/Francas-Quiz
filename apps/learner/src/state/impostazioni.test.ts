import { readFileSync } from 'node:fs';
import {
  apriImpostazioniAllAvvio,
  avvisaImpostazioniSalvate,
  corpoSalvataggio,
  etichettaFornitore,
  modelloIniziale,
  seguiImpostazioni,
  testoChiave,
  testoPrezzo,
} from './impostazioni';
import type { FornitoreImpostazioni, Impostazioni } from '../api/settings';

const anthropic: FornitoreImpostazioni = {
  id: 'anthropic',
  label: 'Anthropic',
  keyConfigured: true,
  keyLast4: '1234',
  model: 'claude-haiku-5-5',
  modelPriced: true,
  perCallOverheadMeasured: true,
  notice: null,
  dataNotice: null,
  models: [
    {
      id: 'claude-sonnet-5-5',
      inputUsdPerMTok: '2',
      outputUsdPerMTok: '10',
      cachedInputUsdPerMTok: '0.10',
    },
    {
      id: 'claude-haiku-5-5',
      inputUsdPerMTok: '0.10',
      outputUsdPerMTok: '0.50',
      cachedInputUsdPerMTok: '0.01',
    },
  ],
};
const openai: FornitoreImpostazioni = {
  ...anthropic,
  id: 'openai',
  label: 'OpenAI',
  keyConfigured: false,
  keyLast4: null,
  model: null,
  modelPriced: null,
  perCallOverheadMeasured: false,
  notice: 'Quota non misurata',
  models: [
    {
      id: 'gpt-6-luna',
      inputUsdPerMTok: '0.10',
      outputUsdPerMTok: '0.50',
      cachedInputUsdPerMTok: '0.01',
    },
  ],
};

it('mostra la chiave solo come «configurata ••••1234», mai per intero', () => {
  expect(testoChiave(anthropic)).toBe('configurata ••••1234');
  expect(testoChiave({ ...anthropic, keyLast4: null })).toBe('configurata');
  expect(testoChiave(openai)).toBe('non configurata');
});

it('prezzi per milione di token in formato italiano', () => {
  expect(testoPrezzo(anthropic.models[1])).toBe(
    'ingresso 0,10 · uscita 0,50 USD per milione di token',
  );
});

const gemini: FornitoreImpostazioni = {
  ...anthropic,
  id: 'gemini',
  label: 'Gemini',
  keyConfigured: false,
  keyLast4: null,
  model: null,
  modelPriced: null,
  perCallOverheadMeasured: false,
  dataNotice:
    'Piano gratuito: i dati inviati possono essere usati dal fornitore. Usalo solo con materiale pubblico.',
  models: [
    {
      id: 'gemini-3.8-flash',
      inputUsdPerMTok: '0',
      outputUsdPerMTok: '0',
      cachedInputUsdPerMTok: '0',
    },
  ],
};

it('i fornitori gratuiti sono riconoscibili nell’elenco e nel prezzo', () => {
  expect(etichettaFornitore(gemini)).toBe('Gemini (piano gratuito) · chiave non configurata');
  expect(etichettaFornitore(anthropic)).toBe('Anthropic · chiave configurata ••••1234');
  expect(testoPrezzo(gemini.models[0])).toBe('gratuito (piano gratuito del fornitore)');
});

// Rilievo 7 del Committente (25/11): la schermata impostazioni non deve MAI
// menzionare API, provider o AI di generazione — riguardano il backend.
it('la schermata impostazioni non menziona mai API, provider o AI di generazione', () => {
  const schermata = readFileSync(new URL('../screens/SettingsScreen.tsx', import.meta.url), 'utf8');
  const corpo = schermata
    .split('\n')
    .filter((riga) => !riga.trimStart().startsWith('*') && !riga.trimStart().startsWith('//'))
    .join('\n');
  expect(corpo).not.toMatch(/\b(Groq|OpenAI|Anthropic|Gemini|provider|providers|apiKey|API key|secureTextEntry|testoChiave|etichettaFornitore|avvisaImpostazioniSalvate)\b/i);
});

it('il campo chiave vuoto non manda la chiave; rimuovere è un’azione esplicita', () => {
  expect(corpoSalvataggio('anthropic', 'claude-haiku-5-5', '  ')).toEqual({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
  });
  expect(corpoSalvataggio('anthropic', 'claude-haiku-5-5', ' sk-ant-prova-0000 ')).toEqual({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    apiKey: 'sk-ant-prova-0000',
  });
  expect(corpoSalvataggio('anthropic', 'claude-haiku-5-5', '', true)).toEqual({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    removeKey: true,
  });
});

it('modello iniziale: quello configurato se ha un prezzo, altrimenti il più economico', () => {
  expect(modelloIniziale(anthropic)).toBe('claude-haiku-5-5');
  expect(modelloIniziale({ ...anthropic, model: 'vecchio', modelPriced: false })).toBe(
    'claude-haiku-5-5',
  );
  expect(modelloIniziale({ ...anthropic, models: [] })).toBe('');
});

it('apre le impostazioni per prime solo se nessun fornitore è configurato', () => {
  const stato: Impostazioni = {
    configured: false,
    activeProvider: 'openai',
    activeModel: null,
    providers: [openai, anthropic],
  };
  expect(apriImpostazioniAllAvvio(stato)).toBe(true);
  expect(apriImpostazioniAllAvvio({ ...stato, configured: true })).toBe(false);
});

it('avvisa chi segue le impostazioni e smette dopo l’annullamento', () => {
  const ricevuti: number[] = [];
  const smetti = seguiImpostazioni(() => ricevuti.push(1));
  avvisaImpostazioniSalvate();
  smetti();
  avvisaImpostazioniSalvate();
  expect(ricevuti).toEqual([1]);
});

it('l’app apre le impostazioni all’avvio e le rende raggiungibili', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  expect(app).toMatch(/apriImpostazioniAllAvvio\(/);
  expect(app).toMatch(/label="Impostazioni"/);
  expect(app).toMatch(/<SettingsScreen/);
});
