import {
  type ReferralStato,
  ReferralStatoSchema,
  type RiscattoRisposta,
  RiscattoRispostaSchema,
  RiscattoRichiestaSchema,
} from '@formazione/contracts';
import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';
import { buildAuthHeaders } from './account';

export function normalizeReferralCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('REF-')) return trimmed;
  if (trimmed.length === 8) return `REF-${trimmed}`;
  return trimmed;
}

export function buildReferralShareUrl(codice: string): string {
  const clean = normalizeReferralCode(codice);
  return `https://civis.app/invite?ref=${encodeURIComponent(clean)}`;
}

export async function getReferralMe(signal?: AbortSignal): Promise<ReferralStato> {
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/referral/me`, {
    method: 'GET',
    headers,
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile recuperare lo stato referral.'));
  }
  return ReferralStatoSchema.parse(data);
}

export async function redeemReferralCode(
  rawCode: string,
  signal?: AbortSignal,
): Promise<RiscattoRisposta> {
  const cleanCode = normalizeReferralCode(rawCode);
  const body = RiscattoRichiestaSchema.parse({ codice: cleanCode });
  const headers = await buildAuthHeaders();
  const r = await fetch(`${apiUrl}/referral/redeem`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(apiErrorMessage(data, 'Impossibile riscattare il codice referral.'));
  }
  return RiscattoRispostaSchema.parse(data);
}
