export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/** Blocchi salvati di una generazione interrotta (services/api, ripresa_generazione.py). */
export type BlocchiSalvati = { salvati: number; totali: number };

/** `detail.savedChunks` e `detail.totalChunks` della risposta d'errore di POST /extractions/{id}/generate,
 * presenti quando fallisce un blocco; null se mancano o non sono coerenti. */
export function blocchiSalvati(payload: unknown): BlocchiSalvati | null {
  if (!payload || typeof payload !== 'object') return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return null;
  const { savedChunks, totalChunks } = detail as { savedChunks?: unknown; totalChunks?: unknown };
  if (!Number.isInteger(savedChunks) || !Number.isInteger(totalChunks)) return null;
  const salvati = savedChunks as number;
  const totali = totalChunks as number;
  if (salvati < 0 || totali < 1 || salvati > totali) return null;
  return { salvati, totali };
}

/** Errore della generazione con i blocchi salvati per la ripresa, se il server li indica. */
export class ErroreGenerazione extends Error {
  readonly ripresa: BlocchiSalvati | null;
  constructor(message: string, ripresa: BlocchiSalvati | null) {
    super(message);
    this.name = 'ErroreGenerazione';
    this.ripresa = ripresa;
  }
}
