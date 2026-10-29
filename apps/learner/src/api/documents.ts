import { Platform } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';
import type { PageSelection } from '@formazione/contracts';
import {apiErrorMessage} from './errors';

// Android emulator reaches the host through 10.0.2.2; devices require a reachable configured URL.
// Official emulator host-loopback alias: https://developer.android.com/studio/run/emulator-networking-address
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000')).replace(/\/$/, '');
export type Document = { id: string; name: string; kind: string; pageCount: number | null };
export type Extraction = { id: string; status: 'ready' | 'needs_review'; blocks: {id: string; text: string; page: number | null; label: string}[]; warnings: string[]; engine: string };
async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiUrl}${path}`, init); }
  catch { throw new Error(`Server non raggiungibile (${apiUrl}). Avvia l’API o configura EXPO_PUBLIC_API_URL.`); }
  const data = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(data,'Richiesta non valida. Controlla il file e la selezione.'));
  return data as T;
}
export async function uploadDocument(asset: DocumentPickerAsset): Promise<Document> {
  const body = new FormData();
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('Il browser non ha fornito il file. Selezionalo nuovamente.');
    body.append('file', asset.file, asset.name);
  } else body.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as unknown as Blob);
  return request('/documents', { method: 'POST', body });
}
export function extractDocument(id: string, selection: PageSelection, engine: 'native' | 'docling') {
  return request<Extraction>(`/documents/${id}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({selection, engine}) });
}
