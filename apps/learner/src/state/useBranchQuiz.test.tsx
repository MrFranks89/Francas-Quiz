import React, { useEffect } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useBranchQuiz, mappaErroreQuiz } from './useBranchQuiz';
import * as api from '../api/branchQuiz';

jest.mock('../api/branchQuiz');

function HookTester({
  onHook,
}: {
  onHook: (hook: ReturnType<typeof useBranchQuiz>) => void;
}) {
  const hook = useBranchQuiz();
  useEffect(() => {
    onHook(hook);
  });
  return null;
}

describe('useBranchQuiz Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mappa correttamente i codici errore noti', () => {
    expect(mappaErroreQuiz({ status: 402 })).toBe(
      'Il budget disponibile per questo documento non basta per generare il quiz.',
    );
    expect(mappaErroreQuiz({ code: 'budget_exceeded' })).toBe(
      'Il budget disponibile per questo documento non basta per generare il quiz.',
    );
    expect(mappaErroreQuiz({ code: 'TREE_STALE' })).toBe(
      'La mappa è cambiata. Ricaricala e riprova.',
    );
    expect(mappaErroreQuiz({ code: 'TREE_NOT_READY' })).toBe(
      'La mappa non è ancora pronta. Generala e riprova.',
    );
    expect(mappaErroreQuiz({ code: 'NO_SOURCE_BLOCKS' })).toBe(
      'Non trovo il testo di questo ramo nel documento.',
    );
    expect(mappaErroreQuiz({ status: 502 })).toBe(
      'Il servizio di generazione non risponde. Riprova tra poco.',
    );
  });

  it('ignora il secondo tocco di generate quando una richiesta è in corso (doppio tocco)', async () => {
    let resolveFirst: (val: unknown) => void = () => {};
    const promise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    (api.generateBranchQuiz as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(promise);

    let currentHook!: ReturnType<typeof useBranchQuiz>;
    act(() => {
      ReactTestRenderer.create(
        <HookTester
          onHook={(h) => {
            currentHook = h;
          }}
        />,
      );
    });

    const body = {
      branchId: 'branch-1',
      treeHash: 'hash',
      questionCount: 3,
    };

    let firstCall!: Promise<unknown>;
    act(() => {
      firstCall = currentHook.generate('ext-1', body);
    });

    expect(currentHook.loading).toBe(true);
    expect(api.generateBranchQuiz).toHaveBeenCalledTimes(1);

    // Secondo tocco immediato
    let secondCall!: Promise<unknown>;
    act(() => {
      secondCall = currentHook.generate('ext-1', body);
    });

    expect(api.generateBranchQuiz).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await secondCall).toBeNull();
    });

    // Risoluzione prima chiamata
    act(() => {
      resolveFirst({
        quizId: 'quiz-1',
        extractionId: 'ext-1',
        questions: [],
      });
    });

    await act(async () => {
      const res = (await firstCall) as { quizId?: string };
      expect(res?.quizId).toBe('quiz-1');
    });

    expect(currentHook.loading).toBe(false);
  });

  it('gestisce annullamento a metà senza lasciare lo stato bloccato in loading', async () => {
    (api.previewBranchQuiz as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
      (_id: unknown, _body: unknown, signal?: AbortSignal) => {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      },
    );

    let currentHook!: ReturnType<typeof useBranchQuiz>;
    act(() => {
      ReactTestRenderer.create(
        <HookTester
          onHook={(h) => {
            currentHook = h;
          }}
        />,
      );
    });

    let estPromise!: Promise<unknown>;
    act(() => {
      estPromise = currentHook.estimate('ext-1', { branchId: 'branch-1' });
    });

    expect(currentHook.loading).toBe(true);

    // Annullamento manuale
    await act(async () => {
      currentHook.cancel();
      await estPromise;
    });

    expect(currentHook.loading).toBe(false);
    expect(currentHook.error).toBeNull();
  });
});
