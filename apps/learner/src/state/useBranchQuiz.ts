import { useCallback, useRef, useState } from 'react';
import type {
  BranchQuizEstimate,
  BranchQuizRequest,
  BranchQuizResponse,
} from '@formazione/contracts';
import {
  deleteBranchQuiz,
  generateBranchQuiz,
  listBranchQuizzes,
  previewBranchQuiz,
} from '../api/branchQuiz';

export const ERRORI_QUIZ_RAMO: Record<string, string> = {
  '402': 'Il budget disponibile per questo documento non basta per generare il quiz.',
  budget_exceeded: 'Il budget disponibile per questo documento non basta per generare il quiz.',
  TREE_STALE: 'La mappa è cambiata. Ricaricala e riprova.',
  TREE_NOT_READY: 'La mappa non è ancora pronta. Generala e riprova.',
  NO_SOURCE_BLOCKS: 'Non trovo il testo di questo ramo nel documento.',
  '502': 'Il servizio di generazione non risponde. Riprova tra poco.',
};

export function mappaErroreQuiz(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; status?: number; message?: string };
    if (err.code && ERRORI_QUIZ_RAMO[err.code]) {
      return ERRORI_QUIZ_RAMO[err.code];
    }
    if (err.status && ERRORI_QUIZ_RAMO[String(err.status)]) {
      return ERRORI_QUIZ_RAMO[String(err.status)];
    }
    if (err.message) {
      if (err.message.includes('budget')) return ERRORI_QUIZ_RAMO['402'];
      if (err.message.includes('TREE_STALE')) return ERRORI_QUIZ_RAMO['TREE_STALE'];
      if (err.message.includes('TREE_NOT_READY')) return ERRORI_QUIZ_RAMO['TREE_NOT_READY'];
      if (err.message.includes('NO_SOURCE_BLOCKS')) return ERRORI_QUIZ_RAMO['NO_SOURCE_BLOCKS'];
      return err.message;
    }
  }
  return 'Si è verificato un errore durante la preparazione del quiz.';
}

export function useBranchQuiz() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimateData, setEstimateData] = useState<BranchQuizEstimate | null>(null);
  const [quizData, setQuizData] = useState<BranchQuizResponse | null>(null);
  const [quizzes, setQuizzes] = useState<BranchQuizResponse[]>([]);

  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    inFlightRef.current = false;
    setLoading(false);
  }, []);

  const estimate = useCallback(
    async (
      extractionId: string,
      body: {
        branchId: string;
        nodeId?: string | null;
        treeHash?: string | null;
        questionCount?: number;
      },
    ): Promise<BranchQuizEstimate | null> => {
      cancel();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const est = await previewBranchQuiz(extractionId, body, controller.signal);
        setEstimateData(est);
        return est;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return null;
        const msg = mappaErroreQuiz(err);
        setError(msg);
        return null;
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [cancel],
  );

  const generate = useCallback(
    async (
      extractionId: string,
      body: BranchQuizRequest,
    ): Promise<BranchQuizResponse | null> => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const res = await generateBranchQuiz(extractionId, body, controller.signal);
        setQuizData(res);
        return res;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return null;
        const msg = mappaErroreQuiz(err);
        setError(msg);
        return null;
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [],
  );

  const list = useCallback(
    async (extractionId: string, branchId?: string): Promise<BranchQuizResponse[]> => {
      try {
        const items = await listBranchQuizzes(extractionId, branchId);
        setQuizzes(items);
        return items;
      } catch (err: unknown) {
        const msg = mappaErroreQuiz(err);
        setError(msg);
        return [];
      }
    },
    [],
  );

  const remove = useCallback(
    async (extractionId: string, quizId: string): Promise<boolean> => {
      try {
        await deleteBranchQuiz(extractionId, quizId);
        setQuizzes((prev) => prev.filter((q) => q.quizId !== quizId));
        return true;
      } catch (err: unknown) {
        const msg = mappaErroreQuiz(err);
        setError(msg);
        return false;
      }
    },
    [],
  );

  const resetError = useCallback(() => setError(null), []);

  return {
    loading,
    error,
    estimateData,
    quizData,
    quizzes,
    estimate,
    generate,
    list,
    remove,
    cancel,
    resetError,
  };
}
