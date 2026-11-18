import { CourseSchema, type ConceptTree, type Course } from '@formazione/contracts';
import { corsoDaLeggere } from '../state/lettura';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';
import { corpoGenerazione, percorsoPreventivo } from '../state/generazione';
export type GenerationConfig = {
  configured: boolean;
  provider: string;
  missing: string[];
  invalid?: string[];
  spending?: {
    maxUsdPerCourse?: string;
    budgetUsd?: string;
    spentUsd: string;
    reservedUsd?: string;
    remainingUsd?: string;
    error?: { code: string; message: string };
  };
};
export type GenerationEstimate = {
  available: boolean;
  allowed: boolean;
  provider?: string;
  model?: string;
  chunks?: number;
  maxCostUsd?: string;
  upperBoundUsd?: string;
  refusal?: { code: string; message: string };
  unreadPages?: number[];
  excludedPages?: number[];
};
// warnings ed excludedPages: avvisi della bozza ed esclusione delle pagine decisa dall'utente (esclusione_pagine.py).
export type Draft = {
  id: string;
  revision?: number;
  status: 'draft' | 'published';
  course: Course;
  warnings?: string[];
  excludedPages?: number[];
};
export async function generationConfig(): Promise<GenerationConfig> {
  const r = await fetch(`${apiUrl}/generation/config`);
  if (!r.ok) throw new Error('Configurazione AI non disponibile.');
  return r.json();
}
export async function generationEstimate(
  id: string,
  escluse: number[] = [],
): Promise<GenerationEstimate> {
  const r = await fetch(`${apiUrl}${percorsoPreventivo(id, escluse)}`);
  const result = await r.json();
  if (!r.ok) throw new Error(apiErrorMessage(result, 'Preventivo non disponibile.'));
  return result;
}
export async function generateDraft(
  id: string,
  title: string,
  acknowledgeWarnings: boolean,
  escluse: number[] = [],
): Promise<Draft> {
  const response = await fetch(`${apiUrl}/extractions/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpoGenerazione(title, acknowledgeWarnings, escluse)),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(result, 'Generazione non riuscita.'));
  // Generazione: la bozza appena scritta dalla pipeline deve rispettare anche le regole di qualità.
  return { ...result, course: CourseSchema.parse(result.course) };
}
export async function draftRequest(path: string, method = 'GET', body?: unknown): Promise<Draft> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(result, 'Operazione non riuscita.'));
  return { ...result, course: corsoDaLeggere(result.course) };
}
export async function recoverDraft(id: string): Promise<Draft> {
  const response = await fetch(`${apiUrl}/courses/${id}`);
  if (response.status === 404) return draftRequest(`/drafts/${id}`);
  const result = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(result, 'Corso non recuperabile.'));
  return { ...result, course: corsoDaLeggere(result.course) };
}

type RawConceptTree = {
  schemaVersion?: number;
  id?: string;
  documentId?: string;
  rootTitle: string;
  summary?: string;
  branches: {
    id?: string;
    title: string;
    description?: string;
    nodes: {
      id?: string;
      title: string;
      summary: string;
      sourceRefs: string[];
      keyTerms?: string[];
    }[];
  }[];
};

export async function fetchConceptTree(
  extractionId: string,
  excludePages: number[] = [],
): Promise<ConceptTree> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/extractions/${extractionId}/concept-tree`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludePages }),
    });
  } catch {
    throw new Error(
      `Server non raggiungibile (${apiUrl}). Avvia l’API o configura EXPO_PUBLIC_API_URL.`,
    );
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(apiErrorMessage(result, 'Generazione della mappa concettuale non riuscita.'));
  }
  const raw = result as RawConceptTree;
  return {
    schemaVersion: 1,
    id: raw.id || `tree-${extractionId}`,
    ...(raw.documentId ? { documentId: raw.documentId } : {}),
    rootTitle: raw.rootTitle,
    ...(raw.summary ? { summary: raw.summary } : {}),
    branches: (raw.branches ?? []).map((branch, branchIdx) => ({
      id: branch.id || `branch-${branchIdx + 1}`,
      title: branch.title,
      ...(branch.description ? { description: branch.description } : {}),
      nodes: (branch.nodes ?? []).map((node, nodeIdx) => ({
        id: node.id || `node-${branchIdx + 1}-${nodeIdx + 1}`,
        title: node.title,
        summary: node.summary,
        sourceRefs: node.sourceRefs ?? [],
        ...(node.keyTerms ? { keyTerms: node.keyTerms } : {}),
      })),
    })),
  };
}
