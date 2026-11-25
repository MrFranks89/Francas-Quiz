import { describe, expect, it } from 'vitest';
import {
  VoiceRecallEstimateSchema,
  VoiceRecallPreviewRequestSchema,
  VoiceRecallResponseSchema,
} from './voiceRecall';

describe('VoiceRecall Contracts', () => {
  it('valida una risposta completa di voice recall', () => {
    const res = {
      transcript: 'La scarsita genera necessariamente la necessita di compiere scelte economiche.',
      score: 82,
      covered: ['Scarsità'],
      missing: [],
      advice: 'Ottima spiegazione con concetti chiari.',
      warnings: [],
      costUsd: '0.0020',
      inputTipo: 'audio',
      durataSecondi: 12.5,
      scope: {
        branchId: 'branch-1',
        nodeId: 'node-1-1',
      },
      valutazione: {
        modalita: 'ibrida',
        scoreCopertura: 100,
        scoreLLM: 75,
        provider: 'anthropic',
      },
      fonti: ['b1'],
    };
    const parsed = VoiceRecallResponseSchema.parse(res);
    expect(parsed.score).toBe(82);
    expect(parsed.scope.branchId).toBe('branch-1');
    expect(parsed.valutazione.modalita).toBe('ibrida');
  });

  it('valida una richiesta di preview', () => {
    const req = {
      branchId: 'branch-1',
      nodeId: 'node-1-1',
      durationSeconds: 60,
      inputTipo: 'audio',
    };
    const parsed = VoiceRecallPreviewRequestSchema.parse(req);
    expect(parsed.inputTipo).toBe('audio');
    expect(parsed.durationSeconds).toBe(60);
  });

  it('valida un preventivo (estimate) di voice recall', () => {
    const est = {
      blockIds: ['b1'],
      costoTrascrizioneUsd: '0.0010',
      costoValutazioneMaxUsd: '0.0025',
      maxCostUsd: '0.0035',
      fitsBudget: true,
      remainingBudgetUsd: '4.8000',
      valutatore: {
        enabled: true,
        provider: 'anthropic',
      },
      warnings: [],
    };
    const parsed = VoiceRecallEstimateSchema.parse(est);
    expect(parsed.fitsBudget).toBe(true);
    expect(parsed.maxCostUsd).toBe('0.0035');
    expect(parsed.valutatore.enabled).toBe(true);
  });
});
