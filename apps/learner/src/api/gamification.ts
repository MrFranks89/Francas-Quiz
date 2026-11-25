import {
  type EventoGamification,
  type GamificationState,
  type MazzoFlashcards,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';

export function generateEventId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let out = 'ev-';
  for (let i = 0; i < 16; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function getClientTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mappaLivelloFascia(livello: number): 'Bronzo' | 'Argento' | 'Oro' {
  if (livello <= 1) return 'Bronzo';
  if (livello <= 4) return 'Argento';
  return 'Oro';
}

export async function getGamificationState(
  extractionId: string,
  signal?: AbortSignal,
): Promise<GamificationState> {
  const r = await fetch(`${apiUrl}/extractions/${extractionId}/gamification`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Impossibile recuperare lo stato di gamification.'));
  }
  return result;
}

export async function postGamificationEvent(
  extractionId: string,
  evento: EventoGamification,
  signal?: AbortSignal,
): Promise<GamificationState> {
  const r = await fetch(`${apiUrl}/extractions/${extractionId}/gamification/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(evento),
    signal,
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Impossibile salvare l’evento di gamification.'));
  }
  return result;
}

export async function getFlashcards(
  extractionId: string,
  options?: {
    branchId?: string;
    oggi?: string;
    limit?: number;
    includeNuove?: boolean;
  },
  signal?: AbortSignal,
): Promise<MazzoFlashcards> {
  const query = new URLSearchParams();
  if (options?.branchId) query.set('branchId', options.branchId);
  if (options?.oggi) query.set('oggi', options.oggi);
  if (options?.limit) query.set('limit', String(options.limit));
  if (options?.includeNuove !== undefined) query.set('includeNuove', String(options.includeNuove));

  const url = `${apiUrl}/extractions/${extractionId}/gamification/flashcards${query.toString() ? `?${query.toString()}` : ''}`;
  const r = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  const result = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(result, 'Impossibile caricare il mazzo di flashcard.'));
  }
  return result;
}
