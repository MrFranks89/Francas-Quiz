import type { GenerationConfig, GenerationEstimate } from '../api/generation';
import type { BlocchiSalvati } from '../api/errors';

/** Testo della configurazione del servizio di generazione. */
export function messaggioConfigurazione(config: GenerationConfig | null): string {
  if (config?.configured) {
    return 'Il servizio di generazione è attivo.';
  }
  if (!config) {
    return 'Il servizio di generazione non è ancora pronto: attendi qualche istante.';
  }
  return 'Il servizio di generazione non è attivo: contatta l’amministratore.';
}

/** Riga informativa del preventivo sopra la generazione; `bloccante` se il server rifiuta la richiesta. */
export function testoPreventivo(stima: GenerationEstimate | null): {
  testo: string;
  bloccante: boolean;
} {
  if (!stima) return { testo: 'Preparazione in corso…', bloccante: true };
  if (!stima.available || !stima.maxCostUsd) {
    return {
      testo: 'La generazione non è disponibile al momento: riprova più tardi.',
      bloccante: true,
    };
  }
  if (!stima.allowed) {
    return {
      testo: 'La generazione non è disponibile al momento: riprova più tardi.',
      bloccante: true,
    };
  }
  return { testo: `Elaborazione pronta (${blocchiStima(stima)}).`, bloccante: false };
}

/** [1,3] → «pagine 1 e 3». */
export function elencoPagine(pagine: number[]): string {
  const t = [...pagine].sort((a, b) => a - b).map(String);
  return t.length === 1
    ? `pagina ${t[0]}`
    : `pagine ${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}

/** Avviso per le pagine non lette che il server segnala nel preventivo (`unreadPages`). */
export function testoPagineNonLette(pagine: number[]): string {
  return `Pagine non lette: ${elencoPagine(pagine)} (scansioni senza testo o OCR senza testo utile). Il corso non si genera finché restano: estrai di nuovo con l’OCR, cambia intervallo oppure escludile.`;
}

export function testoEsclusione(pagine: number[]): string {
  return `Escluse dal corso su richiesta: ${elencoPagine(pagine)}. Non saranno elaborate e l’esclusione resterà annotata nel corso.`;
}

/** Preventivo sulle stesse pagine che la generazione manderebbe: le escluse non contano. */
export function percorsoPreventivo(id: string, escluse: number[]): string {
  const query = escluse.map((p) => `excludePages=${p}`).join('&');
  return `/extractions/${id}/generation-estimate${query ? `?${query}` : ''}`;
}

/** Corpo di POST /extractions/{id}/generate. Titolo e `acknowledgeWarnings` non entrano nell'impronta
 * dei blocchi salvati (ripresa_generazione.py), le pagine escluse sì: riprovando con lo stesso corpo si
 * riparte dal primo blocco mancante. `restart` solo quando si ricomincia da capo. */
export function corpoGenerazione(
  title: string,
  acknowledgeWarnings: boolean,
  escluse: number[],
  ricomincia = false,
  questionsPerCheck = 2,
  passingScoreCheck?: number,
  passingScoreGate?: number | null,
) {
  return {
    title,
    acknowledgeWarnings,
    excludePages: escluse,
    questionsPerCheck,
    ...(passingScoreCheck ? { passingScoreCheck } : {}),
    ...(passingScoreGate !== undefined && passingScoreGate !== null ? { passingScoreGate } : {}),
    ...(ricomincia ? { restart: true } : {}),
  };
}

/** Blocchi del preventivo: «4 blocchi», oppure con blocchi salvati («2 blocchi da generare su 4: 2 già salvati»). */
export function blocchiStima(stima: GenerationEstimate): string {
  const n = stima.chunks ?? 0;
  const blocchi = n === 1 ? '1 blocco' : `${n} blocchi`;
  if (!stima.savedChunks || !stima.totalChunks) return blocchi;
  return `${blocchi} da generare su ${stima.totalChunks}: ${stima.savedChunks} già salvati`;
}

/** Blocchi salvati da riprendere. */
export function statoRipresa(
  dallErrore: BlocchiSalvati | null,
  stima: GenerationEstimate | null,
): BlocchiSalvati | null {
  const ripresa =
    stima && typeof stima.savedChunks === 'number' && typeof stima.totalChunks === 'number'
      ? { salvati: stima.savedChunks, totali: stima.totalChunks }
      : dallErrore;
  return ripresa && ripresa.salvati > 0 ? ripresa : null;
}

export function testoRipresa({ salvati, totali }: BlocchiSalvati): string {
  if (salvati >= totali) {
    return `Tutti i ${totali} blocchi sono salvati: riprovando si ricompone il corso.`;
  }
  return `${salvati} di ${totali} blocchi salvati: riprovando si riparte dal blocco ${salvati + 1} per completare il corso.`;
}

export function etichettaGenerazione(busy: boolean, ripresa: BlocchiSalvati | null): string {
  if (busy) return 'Generazione in corso…';
  return ripresa ? 'Riprendi la generazione' : 'Genera il corso';
}
