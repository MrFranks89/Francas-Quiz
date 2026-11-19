import { describe, expect, it } from 'vitest';
import {
  BranchQuizRequestSchema,
  BranchQuizEstimateSchema,
  BranchQuizResponseSchema,
} from './branchQuiz';

describe('BranchQuiz Contracts', () => {
  it('valida una richiesta di quiz di ramo', () => {
    const req = {
      branchId: 'branch-1',
      treeHash: 'hash123',
      questionCount: 4,
    };
    const parsed = BranchQuizRequestSchema.parse(req);
    expect(parsed.branchId).toBe('branch-1');
    expect(parsed.questionCount).toBe(4);
    expect(parsed.nodeId).toBeUndefined();
  });

  it('valida una stima (preventivo)', () => {
    const estimate = {
      blockIds: ['b1', 'b2'],
      estimatedInputTokens: 1200,
      estimatedOutputTokens: 800,
      expectedCostUsd: '0.005',
      maxCostUsd: '0.012',
      fitsBudget: true,
      remainingBudgetUsd: '4.50',
      warnings: [],
    };
    const parsed = BranchQuizEstimateSchema.parse(estimate);
    expect(parsed.fitsBudget).toBe(true);
    expect(parsed.blockIds).toHaveLength(2);
  });

  it('valida una risposta completa di quiz di ramo', () => {
    const res = {
      quizId: 'quiz-1',
      extractionId: 'ext-1',
      idempotencyKey: 'idemp-key',
      branchId: 'branch-1',
      treeHash: 'thash',
      attempt: 1,
      questionCount: 1,
      questions: [
        {
          id: 'question-p1',
          moduleId: 'module-practice',
          lessonId: 'lesson-practice',
          kind: 'single',
          prompt: 'Qual è la definizione corretta?',
          options: [
            { id: 'option-0', text: 'Opzione giusta' },
            { id: 'option-1', text: 'Opzione errata' },
          ],
          correctOptionId: 'option-0',
          explanation: 'Perché sì',
          sourceRefs: ['b1'],
          difficulty: 'base',
        },
      ],
      sources: [{ blockId: 'b1', ref: 'p. 1' }],
      costUsd: '0.004',
      warnings: [],
      createdAt: '2026-11-19T01:00:00Z',
      cached: false,
      stale: false,
    };
    const parsed = BranchQuizResponseSchema.parse(res);
    expect(parsed.quizId).toBe('quiz-1');
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.sources).toHaveLength(1);
  });
});
