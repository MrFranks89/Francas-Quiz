import {
  type DuelloVista,
  DuelloVistaSchema,
  type DuelloCreatoRisposta,
  DuelloCreatoRispostaSchema,
  type CreaDuelloRichiesta,
  CreaDuelloRichiestaSchema,
  type AnteprimaInvitoDuello,
  AnteprimaInvitoDuelloSchema,
  type IniziaGiocataRisposta,
  IniziaGiocataRispostaSchema,
  type ConsegnaRichiesta,
  ConsegnaRichiestaSchema,
  type ConsegnaRisposta,
  ConsegnaRispostaSchema,
  type RisultatoDuelloRisposta,
  RisultatoDuelloRispostaSchema,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';
import { buildAuthHeaders } from './account';

export function normalizeDuelCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('DUE-')) return trimmed;
  if (trimmed.length === 8) return `DUE-${trimmed}`;
  return trimmed;
}

export async function createDuel(
  req: CreaDuelloRichiesta,
  signal?: AbortSignal,
): Promise<DuelloCreatoRisposta> {
  const parsed = CreaDuelloRichiestaSchema.parse(req);
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile creare il duello.'));
  }
  return DuelloCreatoRispostaSchema.parse(data);
}

export async function getDuels(
  params?: { limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<DuelloVista[]> {
  const headers = await buildAuthHeaders();
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString() ? `?${query.toString()}` : '';

  const r = await fetch(`${apiUrl}/duels${qs}`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile recuperare i duelli.'));
  }
  const items = Array.isArray(data) ? data : (data.items || []);
  return items.map((item: unknown) => DuelloVistaSchema.parse(item));
}

export async function getDuel(duelloId: string, signal?: AbortSignal): Promise<DuelloVista> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Duello non trovato o inaccessibile.'));
  }
  return DuelloVistaSchema.parse(data);
}

export async function getDuelInvite(
  codice: string,
  signal?: AbortSignal,
): Promise<AnteprimaInvitoDuello> {
  const cleanCode = normalizeDuelCode(codice);
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/invite/${cleanCode}`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Invito duello non valido o scaduto.'));
  }
  return AnteprimaInvitoDuelloSchema.parse(data);
}

export async function acceptDuel(
  duelloId: string,
  codice_invito: string,
  signal?: AbortSignal,
): Promise<DuelloVista> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}/accept`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ codice_invito }),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile accettare il duello.'));
  }
  return DuelloVistaSchema.parse(data);
}

export async function startDuel(
  duelloId: string,
  signal?: AbortSignal,
): Promise<IniziaGiocataRisposta> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}/start`, {
    method: 'POST',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile avviare la giocata.'));
  }
  return IniziaGiocataRispostaSchema.parse(data);
}

export async function submitDuel(
  duelloId: string,
  richiesta: ConsegnaRichiesta,
  signal?: AbortSignal,
): Promise<ConsegnaRisposta> {
  const parsed = ConsegnaRichiestaSchema.parse(richiesta);
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}/submit`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile consegnare le risposte del duello.'));
  }
  return ConsegnaRispostaSchema.parse(data);
}

export async function getDuelResult(
  duelloId: string,
  signal?: AbortSignal,
): Promise<RisultatoDuelloRisposta> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}/result`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Risultato duello non disponibile.'));
  }
  return RisultatoDuelloRispostaSchema.parse(data);
}

export async function cancelDuel(duelloId: string, signal?: AbortSignal): Promise<void> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/duels/${duelloId}/cancel`, {
    method: 'POST',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile annullare il duello.'));
  }
}
