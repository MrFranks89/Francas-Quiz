import { z } from 'zod';

export const VoiceRecallScopeSchema = z.object({
  branchId: z.string(),
  nodeId: z.string().nullable().optional(),
});
export type VoiceRecallScope = z.infer<typeof VoiceRecallScopeSchema>;

export const ValutazioneDettaglioSchema = z.object({
  modalita: z.enum(['ibrida', 'solo_copertura', 'solo_llm']),
  scoreCopertura: z.number().int().nullable().optional(),
  scoreLLM: z.number().int().nullable().optional(),
  provider: z.string().nullable().optional(),
});
export type ValutazioneDettaglio = z.infer<typeof ValutazioneDettaglioSchema>;

export const VoiceRecallResponseSchema = z.object({
  transcript: z.string(),
  score: z.number().int().min(0).max(100),
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  advice: z.string(),
  warnings: z.array(z.string()),
  costUsd: z.string(),
  inputTipo: z.enum(['audio', 'testo']),
  durataSecondi: z.number().nullable().optional(),
  scope: VoiceRecallScopeSchema,
  valutazione: ValutazioneDettaglioSchema,
  fonti: z.array(z.string()),
});
export type VoiceRecallResponse = z.infer<typeof VoiceRecallResponseSchema>;

export const VoiceRecallPreviewRequestSchema = z.object({
  branchId: z.string().optional(),
  nodeId: z.string().optional(),
  durationSeconds: z.number().int().min(1).max(300).optional(),
  inputTipo: z.enum(['audio', 'testo']).default('audio'),
});
export type VoiceRecallPreviewRequest = z.infer<typeof VoiceRecallPreviewRequestSchema>;

export const VoiceRecallEstimateSchema = z.object({
  blockIds: z.array(z.string()),
  costoTrascrizioneUsd: z.string(),
  costoValutazioneMaxUsd: z.string(),
  maxCostUsd: z.string(),
  fitsBudget: z.boolean(),
  remainingBudgetUsd: z.string(),
  valutatore: z.object({ enabled: z.boolean(), provider: z.string().nullable() }),
  warnings: z.array(z.string()),
});
export type VoiceRecallEstimate = z.infer<typeof VoiceRecallEstimateSchema>;
