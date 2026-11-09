import { apiUrl } from './documents';
import { apiErrorMessage } from './errors';

// Forma di GET/PUT /settings (services/api/formazione_api/impostazioni.py, stato()).
export type ModelloImpostazioni = {
  id: string;
  inputUsdPerMTok: string;
  outputUsdPerMTok: string;
  cachedInputUsdPerMTok: string;
};
export type FornitoreImpostazioni = {
  id: string;
  label: string;
  keyConfigured: boolean;
  keyLast4: string | null;
  model: string | null;
  modelPriced: boolean | null;
  models: ModelloImpostazioni[];
  perCallOverheadMeasured: boolean;
  notice: string | null;
  dataNotice: string | null;
};
export type Impostazioni = {
  configured: boolean;
  activeProvider: string | null;
  activeModel: string | null;
  providers: FornitoreImpostazioni[];
};
export type CorpoImpostazioni = {
  provider: string;
  model: string;
  apiKey?: string;
  removeKey?: true;
};

async function richiesta(init?: RequestInit): Promise<Impostazioni> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/settings`, init);
  } catch {
    throw new Error(
      `Server non raggiungibile (${apiUrl}). Avvia l’API con «Avvia Studio Formazione».`,
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(result, 'Impostazioni non disponibili.'));
  return result as Impostazioni;
}
export function leggiImpostazioni() {
  return richiesta();
}
export function salvaImpostazioni(corpo: CorpoImpostazioni) {
  return richiesta({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}
