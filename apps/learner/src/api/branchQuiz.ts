import {
  type BranchQuizEstimate,
  type BranchQuizRequest,
  type BranchQuizResponse,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';

export async function previewBranchQuiz(
  extractionId: string,
  body: {
    branchId: string;
    nodeId?: string | null;
    treeHash?: string | null;
    questionCount?: number;
  },
  signal?: AbortSignal,
): Promise<BranchQuizEstimate> {
  const r = await fetch(
    `${apiUrl}/extractions/${extractionId}/concept-tree/quiz/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Preventivo quiz non disponibile.'));
  }
  return result;
}

export async function generateBranchQuiz(
  extractionId: string,
  body: BranchQuizRequest,
  signal?: AbortSignal,
): Promise<BranchQuizResponse> {
  const r = await fetch(
    `${apiUrl}/extractions/${extractionId}/concept-tree/quiz`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  );
  const result = await r.json();
  if (!r.ok) {
    const status = r.status;
    const detail = (result as { detail?: { code?: string; message?: string } })?.detail;
    const code = detail?.code || (status === 402 ? 'budget_exceeded' : '');
    const err = new Error(apiErrorMessage(result, 'Impossibile generare il quiz.'));
    (err as unknown as { status: number; code: string }).status = status;
    (err as unknown as { status: number; code: string }).code = code;
    throw err;
  }
  return result;
}

export async function listBranchQuizzes(
  extractionId: string,
  branchId?: string,
  signal?: AbortSignal,
): Promise<BranchQuizResponse[]> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  const r = await fetch(
    `${apiUrl}/extractions/${extractionId}/concept-tree/quiz${query}`,
    { signal },
  );
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Impossibile recuperare i quiz salvati.'));
  }
  return result;
}

export async function deleteBranchQuiz(
  extractionId: string,
  quizId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const r = await fetch(
    `${apiUrl}/extractions/${extractionId}/concept-tree/quiz/${quizId}`,
    { method: 'DELETE', signal },
  );
  if (!r.ok) {
    const result = await r.json().catch(() => ({}));
    throw new Error(apiErrorMessage(result, 'Impossibile eliminare il quiz.'));
  }
  return true;
}
