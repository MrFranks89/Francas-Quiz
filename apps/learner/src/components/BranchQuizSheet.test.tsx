import React from 'react';
import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { BranchQuizSheet } from './BranchQuizSheet';
import { Button } from './ui';
import * as branchQuizApi from '../api/branchQuiz';
import type { BranchQuizEstimate, BranchQuizResponse, Course } from '@formazione/contracts';

jest.mock('../api/branchQuiz');

const mockEstimate: BranchQuizEstimate = {
  blockIds: ['blk-1'],
  estimatedInputTokens: 500,
  estimatedOutputTokens: 300,
  expectedCostUsd: '0.0035',
  maxCostUsd: '0.0100',
  fitsBudget: true,
  remainingBudgetUsd: '0.0400',
  warnings: [],
};

const mockQuizResponse: BranchQuizResponse = {
  quizId: '11223344556677889900aabbccddeeff',
  extractionId: 'ext-123456',
  idempotencyKey: 'idemp-1',
  branchId: 'b-1',
  nodeId: 'n-1',
  treeHash: 'tree-1',
  attempt: 1,
  questionCount: 3,
  costUsd: '0.0035',
  createdAt: '2026-11-19T00:00:00Z',
  questions: [
    {
      id: 'q1',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale opzione è corretta?',
      options: [
        { id: 'opt-a', text: 'Opzione A corretta' },
        { id: 'opt-b', text: 'Opzione B errata' },
      ],
      correctOptionId: 'opt-a',
      explanation: 'Spiegazione corretta.',
      sourceRefs: ['blk-1'],
    },
    {
      id: 'q2',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale seconda opzione?',
      options: [
        { id: 'opt-a', text: 'Opzione A valida' },
        { id: 'opt-b', text: 'Opzione B invalida' },
      ],
      correctOptionId: 'opt-a',
      explanation: 'Spiegazione valida.',
      sourceRefs: ['blk-1'],
    },
    {
      id: 'q3',
      moduleId: 'module-practice',
      lessonId: 'lesson-practice',
      kind: 'single',
      prompt: 'Quale terza opzione?',
      options: [
        { id: 'opt-a', text: 'Opzione A vera' },
        { id: 'opt-b', text: 'Opzione B falsa' },
      ],
      correctOptionId: 'opt-a',
      explanation: 'Spiegazione vera.',
      sourceRefs: ['blk-1'],
    },
  ],
  sources: [{ blockId: 'blk-1', ref: '[1]' }],
  cached: false,
  warnings: [],
};

describe('BranchQuizSheet component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('mostra il titolo del ramo e carica il preventivo iniziale', async () => {
    jest.mocked(branchQuizApi.previewBranchQuiz).mockResolvedValue(mockEstimate);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BranchQuizSheet
          extractionId="ext-1"
          branch={{ id: 'b-1', title: 'Ramo Diritto Civile' }}
          onClose={() => {}}
          onStartPractice={() => {}}
        />,
      );
    });

    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(texts).toContain('Ramo Diritto Civile');
    expect(texts).toContain('Costo massimo stimato: circa 0.0100 $.');
  });

  test('disabilita la generazione se il budget è insufficiente', async () => {
    jest.mocked(branchQuizApi.previewBranchQuiz).mockResolvedValue({
      ...mockEstimate,
      fitsBudget: false,
      remainingBudgetUsd: '0.0000',
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BranchQuizSheet
          extractionId="ext-1"
          branch={{ id: 'b-1', title: 'Ramo Test' }}
          onClose={() => {}}
          onStartPractice={() => {}}
        />,
      );
    });

    const texts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat();
    expect(
      texts.some(
        (t) =>
          typeof t === 'string' &&
          t.includes('Il budget disponibile per questo documento non basta'),
      ),
    ).toBe(true);

    const generateBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Genera il quiz');
    expect(generateBtn).toBeDefined();
    expect(generateBtn?.props.disabled).toBe(true);
  });

  test('genera il quiz e permette di avviare la pratica', async () => {
    jest.mocked(branchQuizApi.previewBranchQuiz).mockResolvedValue(mockEstimate);
    jest.mocked(branchQuizApi.generateBranchQuiz).mockResolvedValue(mockQuizResponse);

    const onStartPractice = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BranchQuizSheet
          extractionId="ext-1"
          branch={{ id: 'b-1', title: 'Ramo Contratti' }}
          treeHash="tree-1"
          onClose={() => {}}
          onStartPractice={onStartPractice}
        />,
      );
    });

    const generateBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Genera il quiz');
    expect(generateBtn).toBeDefined();

    await act(async () => {
      generateBtn?.props.onPress();
    });

    const startBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Inizia');
    expect(startBtn).toBeDefined();

    act(() => {
      startBtn?.props.onPress();
    });

    expect(onStartPractice).toHaveBeenCalledTimes(1);
    const passedCourse = onStartPractice.mock.calls[0][0] as Course;
    expect(passedCourse.id).toBe(`practice-${mockQuizResponse.quizId}`);
  });
});
