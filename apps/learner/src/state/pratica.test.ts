import { CorsoLeggibileSchema, CourseSchema } from '@formazione/contracts';
import { corsoDiPratica, sogliaMinima } from './pratica';
import type { BranchQuizResponse } from '@formazione/contracts';

const fakeQuizResponse: BranchQuizResponse = {
  quizId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  extractionId: 'ext-123456',
  idempotencyKey: 'idemp-key-1',
  branchId: 'branch-1',
  nodeId: 'node-1',
  treeHash: 'tree-hash-1',
  attempt: 1,
  questionCount: 4,
  costUsd: '0.0035',
  createdAt: '2026-11-19T00:00:00Z',
  questions: [
    {
      id: 'q1',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale affermazione è corretta?',
      options: [
        { id: 'opt-a', text: 'Opzione A corretta' },
        { id: 'opt-b', text: 'Opzione B errata' },
      ],
      correctOptionId: 'opt-a',
      explanation: 'La A è corretta.',
      sourceRefs: ['b1'],
    },
    {
      id: 'q2',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale affermazione è errata?',
      options: [
        { id: 'opt-a', text: 'Opzione A errata' },
        { id: 'opt-b', text: 'Opzione B corretta' },
      ],
      correctOptionId: 'opt-b',
      explanation: 'La B è corretta.',
      sourceRefs: ['b1'],
    },
    {
      id: 'q3',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale elemento descrive il principio?',
      options: [
        { id: 'opt-a', text: 'Opzione A valida' },
        { id: 'opt-b', text: 'Opzione B errata' },
      ],
      correctOptionId: 'opt-a',
      explanation: 'Descrive il principio.',
      sourceRefs: ['b1'],
    },
    {
      id: 'q4',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Cosa si deduce dal testo?',
      options: [
        { id: 'opt-a', text: 'Deduzione prima errata' },
        { id: 'opt-b', text: 'Deduzione seconda giusta' },
      ],
      correctOptionId: 'opt-b',
      explanation: 'Deduzione corretta.',
      sourceRefs: ['b1'],
    },
  ],
  sources: [{ blockId: 'b1', ref: '[1]' }],
  warnings: [],
  cached: false,
};

describe('sogliaMinima', () => {
  it('calcola correttamente la soglia minima per 3..6 domande', () => {
    expect(sogliaMinima(3)).toBe(2);
    expect(sogliaMinima(4)).toBe(3);
    expect(sogliaMinima(5)).toBe(3);
    expect(sogliaMinima(6)).toBe(4);
  });
});

describe('corsoDiPratica', () => {
  it('crea un corso sintetico conforme a CorsoLeggibileSchema e CourseSchema', () => {
    const course = corsoDiPratica(fakeQuizResponse, 'Fondamenti di Diritto');

    expect(course.id).toBe(`practice-${fakeQuizResponse.quizId}`);
    expect(course.title).toContain('Quiz: Fondamenti di Diritto');
    expect(course.modules).toHaveLength(1);

    const mod = course.modules[0];
    expect(mod.lessons).toHaveLength(1);
    expect(mod.lessons[0].id).toBe('lesson-practice');
    expect(mod.exam?.questionIds).toHaveLength(4);
    expect(mod.exam?.passingScore).toBe(3);

    expect(() => CourseSchema.parse(course)).not.toThrow();
    expect(() => CorsoLeggibileSchema.parse(course)).not.toThrow();
  });
});
