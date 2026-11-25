import {
  type VoiceRecallEstimate,
  type VoiceRecallPreviewRequest,
  type VoiceRecallResponse,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';

export interface SendVoiceRecallParams {
  audio?: Blob | { uri: string; name: string; type: string };
  text?: string;
  branchId?: string | null;
  nodeId?: string | null;
  language?: string;
}

export async function postVoiceRecall(
  extractionId: string,
  params: SendVoiceRecallParams,
  signal?: AbortSignal,
): Promise<VoiceRecallResponse> {
  const formData = new FormData();
  if (params.audio) {
    // Gestione compatibile sia React Native che Browser Web
    formData.append('audio', params.audio as any);
  }
  if (params.text) {
    formData.append('text', params.text);
  }
  if (params.branchId) {
    formData.append('branchId', params.branchId);
  }
  if (params.nodeId) {
    formData.append('nodeId', params.nodeId);
  }
  if (params.language) {
    formData.append('language', params.language);
  }

  const r = await fetch(`${apiUrl}/extractions/${extractionId}/voice-recall`, {
    method: 'POST',
    body: formData,
    signal,
  });
  const result = await r.json();
  if (!r.ok) {
    const detail = (result as { detail?: { code?: string; message?: string } })?.detail;
    const msg = detail?.message || apiErrorMessage(result, 'Impossibile valutare l’esposizione orale.');
    const err = new Error(msg);
    (err as unknown as { code?: string }).code = detail?.code;
    throw err;
  }
  return result;
}

export async function previewVoiceRecall(
  extractionId: string,
  body: VoiceRecallPreviewRequest,
  signal?: AbortSignal,
): Promise<VoiceRecallEstimate> {
  const r = await fetch(`${apiUrl}/extractions/${extractionId}/voice-recall/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Preventivo coach orale non disponibile.'));
  }
  return result;
}
