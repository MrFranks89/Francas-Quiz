import { z } from 'zod';
import { QuestionSchema } from './structure';

const id = z.string().trim().min(1);

export const BranchQuizRequestSchema = z.object({
  branchId: id,
  nodeId: z.string().trim().min(1).optional().nullable(),
  treeHash: z.string().trim().min(1),
  questionCount: z.number().int().min(3).max(6).default(3),
  idempotencyKey: z.string().trim().min(1).optional().nullable(),
});

export const BranchQuizEstimateSchema = z.object({
  blockIds: z.array(z.string()),
  estimatedInputTokens: z.number(),
  estimatedOutputTokens: z.number(),
  expectedCostUsd: z.string(),
  maxCostUsd: z.string(),
  fitsBudget: z.boolean(),
  remainingBudgetUsd: z.string(),
  warnings: z.array(z.string()),
});

export const BranchQuizSourceSchema = z.object({
  blockId: z.string(),
  ref: z.string().optional().nullable(),
});

export const BranchQuizValidationSchema = z.object({
  passed: z.number(),
  discarded: z.number(),
});

export const BranchQuizResponseSchema = z.object({
  quizId: id,
  extractionId: id,
  idempotencyKey: z.string(),
  branchId: id,
  nodeId: z.string().nullable().optional(),
  treeHash: z.string(),
  attempt: z.number(),
  questionCount: z.number(),
  questions: z.array(QuestionSchema),
  sources: z.array(BranchQuizSourceSchema),
  validation: BranchQuizValidationSchema.optional().nullable(),
  costUsd: z.string(),
  warnings: z.array(z.string()),
  createdAt: z.string(),
  cached: z.boolean().optional(),
  stale: z.boolean().optional(),
});

export type BranchQuizRequest = z.infer<typeof BranchQuizRequestSchema>;
export type BranchQuizEstimate = z.infer<typeof BranchQuizEstimateSchema>;
export type BranchQuizSource = z.infer<typeof BranchQuizSourceSchema>;
export type BranchQuizValidation = z.infer<typeof BranchQuizValidationSchema>;
export type BranchQuizResponse = z.infer<typeof BranchQuizResponseSchema>;
