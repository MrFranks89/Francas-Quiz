// Motore del ripasso: tre livelli a scalare (specifica in
// C:\Civica\Civis_Ripasso_Specifica.md).
//   1. Domande che l'utente ha sbagliato — si ripropongono finché non le
//      indovina (una volta).
//   2. Domande da moduli dove la telemetria dice che fatica.
//   3. Moduli già fatti, senza altro criterio.
// Composizione: due dal primo livello e una dal terzo (non tre dal primo).
//
// Tutto qui dentro è puro (niente React, niente rete, niente storage): lo
// stato vero — l'elenco delle domande sbagliate, salvato in locale — vive in
// CivicApp.tsx insieme al resto del progresso, con lo stesso meccanismo
// (AsyncStorage, offline-first). Qui ci sono solo le regole.

// ═══════════════════════════════════════════════════════════════════
// IDENTIFICARE "QUELLA DOMANDA"
//
// Le domande sono pescate a caso da varianti/pool (vedi usePickVariant in
// CivicApp.tsx) e non hanno un id stabile — per questo la telemetria in
// src/auth/difficolta.ts registra lezione+step, non la domanda.
//
// Per il livello 1 però serve ritrovare ESATTAMENTE quella domanda lì, non
// una a caso della stessa lezione. La soluzione: quando una domanda viene
// sbagliata, si salva uno SNAPSHOT del suo contenuto già risolto (testo,
// opzioni, indice della risposta giusta, spiegazione) — non un riferimento
// da ricostruire. La chiave (lezione+step+testo) serve solo a riconoscere
// "la stessa domanda" per aggiornarla/rimuoverla, non a ricalcolarne il
// contenuto: quello è già congelato nello snapshot.
// ═══════════════════════════════════════════════════════════════════

export type DomandaSbagliata = {
  chiave: string;
  lezioneId: string;
  moduloId: number;
  domanda: string;
  opzioni: string[];
  correctIndex: number;
  spiegazione?: string;
  // Perché dell'errore (Decisioni del 16/9/2026, punto 3): allineato per
  // indice a `opzioni`, null dove non serve.
  perche?: (string | null)[];
  emoji?: string;
  difficulty?: string;
  quando: string; // ISO
  // Ripetizione distanziata (1/10/2026): livello 1..5 e giorno di calendario
  // locale ("AAAA-MM-GG") in cui la domanda torna. OPZIONALI per i salvataggi
  // di prima e per le righe scaricate dal server, che non li hanno: chi legge
  // passa da migraDomandaSbagliata (livello 1, scaduta oggi).
  livello?: number;
  prossimaIl?: string;
};

// ═══════════════════════════════════════════════════════════════════
// RIPETIZIONE DISTANZIATA delle domande sbagliate
//
// Una domanda appena sbagliata resta disponibile subito. Dopo una risposta
// giusta sale di un livello (prossimaIl = oggi + intervallo del nuovo livello);
// giusta al livello 5 esce dal ripasso. La programmazione distanziata parte
// solo dopo la prima correzione (steering Federico, 10/10/2026).
// I giorni sono di CALENDARIO LOCALE, non blocchi di 24 ore: si calcolano
// con il costruttore Date(anno, mese, giorno) e non sommando millisecondi,
// così il cambio dell'ora legale non sposta la scadenza di un giorno.
// ═══════════════════════════════════════════════════════════════════
export const LIVELLO_MAX = 5;
export const INTERVALLI_GIORNI: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

// "AAAA-MM-GG" nel fuso locale del telefono.
export function giornoLocale(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${g}`;
}

// Somma `n` giorni di calendario a un "AAAA-MM-GG" (negativi ammessi).
export function aggiungiGiorni(giorno: string, n: number): string {
  const [a, m, g] = giorno.split('-').map(Number);
  return giornoLocale(new Date(a, m - 1, g + n));
}

// Giorni di calendario fra due "AAAA-MM-GG" (a → b), per il testo «fra N giorni».
export function giorniTra(a: string, b: string): number {
  const [a1, m1, g1] = a.split('-').map(Number);
  const [a2, m2, g2] = b.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, g2) - Date.UTC(a1, m1 - 1, g1)) / 86400000);
}

const GIORNO_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

// Salvataggi vecchi (niente livello/prossimaIl): livello 1, scaduta oggi —
// nessuno perde le sue domande. Anche i valori illeggibili ricadono qui.
export function migraDomandaSbagliata(d: DomandaSbagliata, oggi: string = giornoLocale()): DomandaSbagliata {
  const livelloOk = typeof d.livello === 'number' && Number.isInteger(d.livello) && d.livello >= 1 && d.livello <= LIVELLO_MAX;
  const giornoOk = typeof d.prossimaIl === 'string' && GIORNO_VALIDO.test(d.prossimaIl);
  if (livelloOk && giornoOk) {
    // Le prime build con i livelli rinviavano al futuro anche il livello 1:
    // era un errore, perché un nuovo sbaglio deve essere disponibile subito.
    // Oggi vuoto è la sola verifica strutturale usata dalla fusione: non
    // deve invalidare il livello 1 locale e far vincere un record remoto.
    if (oggi !== '' && d.livello === 1 && (d.prossimaIl as string) > oggi) return { ...d, prossimaIl: oggi };
    return d;
  }
  return { ...d, livello: livelloOk ? d.livello : 1, prossimaIl: livelloOk && giornoOk ? d.prossimaIl : oggi };
}

export function migraDomandeSbagliate(lista: DomandaSbagliata[], oggi: string = giornoLocale()): DomandaSbagliata[] {
  return lista.map((d) => migraDomandaSbagliata(d, oggi));
}

export type EsitoRisposta = {
  // true: era al livello 5 e l'ha indovinata, esce dal ripasso.
  padroneggiata: boolean;
  livello: number;
  prossimaIl: string | null;
  // Giorni da oggi alla prossima volta (null se padroneggiata).
  giorni: number | null;
};

// Cosa succede a UNA domanda dopo una risposta. Pura: non tocca la lista.
export function esitoRisposta(d: DomandaSbagliata, giusta: boolean, oggi: string = giornoLocale()): EsitoRisposta {
  const liv = migraDomandaSbagliata(d, oggi).livello as number;
  if (!giusta) return { padroneggiata: false, livello: 1, prossimaIl: oggi, giorni: 0 };
  if (liv >= LIVELLO_MAX) return { padroneggiata: true, livello: LIVELLO_MAX, prossimaIl: null, giorni: null };
  const nuovo = liv + 1;
  return { padroneggiata: false, livello: nuovo, prossimaIl: aggiungiGiorni(oggi, INTERVALLI_GIORNI[nuovo]), giorni: INTERVALLI_GIORNI[nuovo] };
}

// Applica la risposta alla voce `chiave` della lista: sale, scende o esce.
// Chiave assente: lista invariata.
export function registraRispostaRipasso(lista: DomandaSbagliata[], chiave: string, giusta: boolean, oggi: string = giornoLocale()): DomandaSbagliata[] {
  const out: DomandaSbagliata[] = [];
  for (const d of lista) {
    if (d.chiave !== chiave) { out.push(d); continue; }
    const e = esitoRisposta(d, giusta, oggi);
    if (e.padroneggiata) continue;
    out.push({ ...d, livello: e.livello, prossimaIl: e.prossimaIl as string });
  }
  return out;
}

// Le domande da proporre ORA: `prossimaIl <= oggi`, la scadenza più vecchia
// prima (a parità, la domanda sbagliata da più tempo).
export function domandeScadute(lista: DomandaSbagliata[], oggi: string = giornoLocale()): DomandaSbagliata[] {
  return migraDomandeSbagliate(lista, oggi)
    .filter((d) => (d.prossimaIl as string) <= oggi)
    .sort((a, b) => (a.prossimaIl as string).localeCompare(b.prossimaIl as string) || a.quando.localeCompare(b.quando));
}

// «Livello 3 di 5 · prossima volta fra 7 giorni» (o la frase della padronanza).
export function descriviProssimaVolta(e: EsitoRisposta): string {
  if (e.padroneggiata) return 'Livello 5 di 5 · domanda padroneggiata: esce dal ripasso';
  const g = e.giorni as number;
  return `Livello ${e.livello} di ${LIVELLO_MAX} · prossima volta ${g === 0 ? 'subito' : g === 1 ? 'domani' : `fra ${g} giorni`}`;
}

export function chiaveDomandaSbagliata(lezioneId: string, stepIdx: number, domanda: string): string {
  return `${lezioneId}#${stepIdx}#${domanda}`;
}

export function creaDomandaSbagliata(input: {
  lezioneId: string;
  stepIdx: number;
  moduloId: number;
  domanda: string;
  opzioni: string[];
  correctIndex: number;
  spiegazione?: string;
  perche?: (string | null)[];
  emoji?: string;
  difficulty?: string;
}, adesso: Date = new Date()): DomandaSbagliata {
  return {
    chiave: chiaveDomandaSbagliata(input.lezioneId, input.stepIdx, input.domanda),
    lezioneId: input.lezioneId,
    moduloId: input.moduloId,
    domanda: input.domanda,
    opzioni: input.opzioni,
    correctIndex: input.correctIndex,
    spiegazione: input.spiegazione,
    perche: input.perche,
    emoji: input.emoji,
    difficulty: input.difficulty,
    quando: adesso.toISOString(),
    // Appena sbagliata: livello 1, disponibile subito. La distanza parte
    // dopo la prima risposta corretta (steering Federico, 10/10/2026).
    livello: 1,
    prossimaIl: giornoLocale(adesso),
  };
}

// Upsert per chiave: una domanda sbagliata più volte resta una voce sola
// (si aggiorna lo snapshot e la data, e torna al livello 1), non si accumula.
export function aggiungiDomandaSbagliata(lista: DomandaSbagliata[], nuova: DomandaSbagliata): DomandaSbagliata[] {
  return [...lista.filter((d) => d.chiave !== nuova.chiave), nuova];
}

// Toglie la voce (usata quando la domanda esce dal ripasso).
export function rimuoviDomandaSbagliata(lista: DomandaSbagliata[], chiave: string): DomandaSbagliata[] {
  return lista.filter((d) => d.chiave !== chiave);
}

// ═══════════════════════════════════════════════════════════════════
// RISOLUZIONE DELLA VARIANTE (fuori da un componente React)
//
// Stessa logica di usePickVariant in CivicApp.tsx (che la usa dentro un
// useRef per farla una volta sola per "mount"): qui serve la versione pura,
// per poter costruire i pool del livello 2/3 fuori da un componente montato.
// ═══════════════════════════════════════════════════════════════════
export function pickVariantPlain(step: any): any {
  if (!step) return step;
  const isQuiz = step.type === 'quiz' || step.type === 'quiz_single';
  const extras = [
    ...(Array.isArray(step.variants) ? step.variants : []),
    ...(!isQuiz && Array.isArray(step.pool) ? step.pool : []),
  ];
  if (!extras.length) return step;
  const CONTENT = ['question', 'text', 'sentence', 'situation', 'prompt'];
  const baseHasContent = CONTENT.some((k) => step[k] != null);
  const candidates = (baseHasContent ? [step] : []).concat(extras.map((v: any) => ({ ...step, ...v })));
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : step;
}

// ═══════════════════════════════════════════════════════════════════
// NORMALIZZAZIONE A DOMANDA A SCELTA MULTIPLA
//
// Il ripasso mostra sempre lo stesso formato (domanda + opzioni mescolabili),
// qualunque sia il tipo originale dello step: più semplice del contenuto di
// partenza, mai più difficile — coerente con "il ripasso non deve diventare
// un esame". I tipi a più passaggi (match/sort/order) e chi non ha davvero
// opzioni mescolabili non si riducono a questo formato: si saltano, non si
// ripropongono identici (vedi "Cosa NON fare" nella specifica).
// ═══════════════════════════════════════════════════════════════════
export type DomandaRipasso = {
  type: 'quiz_single';
  q: string;
  options: string[];
  correct: number;
  emoji?: string;
  difficulty?: string;
  explanation?: string;
  // Perché dell'errore (Decisioni del 16/9/2026, punto 3): allineato per
  // indice a `options`, null dove non serve.
  perche?: (string | null)[];
};

export function normalizzaPerRipasso(step: any): DomandaRipasso | null {
  if (!step) return null;
  const conOpzioni = (q: string, opts: any[], explanation?: string): DomandaRipasso | null => {
    if (!q || !Array.isArray(opts) || opts.length < 2) return null;
    const correct = opts.findIndex((o) => o && o.correct === true);
    if (correct < 0) return null;
    return {
      type: 'quiz_single',
      q,
      options: opts.map((o) => o.text),
      correct,
      emoji: step.emoji,
      difficulty: step.difficulty,
      explanation,
      perche: opts.map((o) => (o && o.perche) || null),
    };
  };
  switch (step.type) {
    case 'truefalse':
      if (!step.question || typeof step.correct !== 'boolean') return null;
      return {
        type: 'quiz_single',
        q: step.question,
        options: ['Vero', 'Falso'],
        correct: step.correct ? 0 : 1,
        emoji: step.emoji,
        difficulty: step.difficulty,
        explanation: step.explanation,
      };
    case 'scenario':
      return conOpzioni(step.situation ? `${step.situation}\n\n${step.question}` : step.question, step.options, step.explanation);
    case 'quiz_single': {
      // Già nella forma finale (domande estratte da uno step "quiz"): index
      // di `correct`, non oggetti {text,correct} — passthrough con verifica.
      if (!step.q || !Array.isArray(step.options) || step.options.length < 2) return null;
      if (typeof step.correct !== 'number' || step.correct < 0 || step.correct >= step.options.length) return null;
      return {
        type: 'quiz_single',
        q: step.q,
        options: [...step.options],
        correct: step.correct,
        emoji: step.emoji,
        difficulty: step.difficulty,
        explanation: step.explanation,
        perche: Array.isArray(step.perche) ? [...step.perche] : undefined,
      };
    }
    case 'fillblank':
      if (!step.text || !Array.isArray(step.options) || typeof step.correct !== 'number') return null;
      if (step.correct < 0 || step.correct >= step.options.length) return null;
      return {
        type: 'quiz_single',
        q: step.text,
        options: [...step.options],
        correct: step.correct,
        emoji: step.emoji,
        difficulty: step.difficulty,
        explanation: step.explanation,
        perche: Array.isArray(step.perche) ? [...step.perche] : undefined,
      };
    case 'intruso':
      return conOpzioni(step.prompt ? `Trova l'intruso: ${step.prompt}` : step.prompt, step.options, step.explanation);
    case 'correct':
      return conOpzioni(step.sentence ? `Correggi l'errore: ${step.sentence}` : step.sentence, step.options, step.explanation);
    default:
      // match/sort/order/slide/cardflip/quiz(contenitore)/...: nessuna
      // riduzione affidabile a domanda singola con opzioni mescolabili.
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSIZIONE: due dal primo livello, una dal terzo — non tre dal primo.
// Se un livello preferito è vuoto/esaurito si scala: i due posti "difficili"
// scalano 1→2→3; il posto "facile" scala 3→2→1 (se proprio non c'è nulla di
// già fatto, è meglio ripetere una domanda sbagliata che mostrarne una in
// meno).
// ═══════════════════════════════════════════════════════════════════
export type TierPools<T> = { tier1: T[]; tier2: T[]; tier3: T[] };
export type DomandaScelta<T> = { tier: 1 | 2 | 3; domanda: T };

// ═══════════════════════════════════════════════════════════════════
// SESSIONE COMPLETA (Pro): "Ripassa i tuoi errori" — non 2+1 come sopra,
// TUTTE le domande sbagliate, una dopo l'altra. L'ordine: le più vecchie
// (`quando` più basso) prima, perché sono quelle più a rischio di essere
// state dimenticate. Pura come il resto del file: la sessione (rimuovere le
// indovinate, rimettere in coda le sbagliate) la gestisce lo schermo, non
// questa funzione — qui c'è solo l'ordine di partenza.
// ═══════════════════════════════════════════════════════════════════
export function ordinaPerRipassoCompleto(lista: DomandaSbagliata[]): DomandaSbagliata[] {
  return [...lista].sort((a, b) => a.quando.localeCompare(b.quando));
}

// ═══════════════════════════════════════════════════════════════════
// FUSIONE CON IL SERVER (src/auth/erroriRipasso.ts): solo per lo SCARICO
// INIZIALE, la prima volta che un account si presenta su un dispositivo
// (vedi le regole in CivicApp.tsx). Da li' in poi il telefono e' autorevole
// e non passa piu' di qui.
//
// Unione deduplicata per `chiave`; quando la stessa domanda compare in
// entrambe le liste vince la `quando` PIU' VECCHIA — e' in sospeso da piu'
// tempo, quindi va riproposta prima. Pura come il resto del file: nessuno
// stato, nessuna rete.
// ═══════════════════════════════════════════════════════════════════
export function fondiDomandeSbagliate(locali: DomandaSbagliata[], remote: DomandaSbagliata[]): DomandaSbagliata[] {
  const per: Record<string, DomandaSbagliata> = {};
  for (const d of [...locali, ...remote]) {
    const esistente = per[d.chiave];
    per[d.chiave] = (!esistente || d.quando < esistente.quando) ? d : esistente;
  }
  // Livello e scadenza (1/10/2026, ora anche sul server): se la domanda esiste
  // sul telefono valgono quelli del telefono (e' li' che si e' risposto per
  // ultimo); se esiste solo sul server (telefono nuovo) valgono quelli del
  // server; se nessuno li ha (o sono illeggibili), livello 1 scaduto oggi,
  // come la migrazione. Il testo e `quando` seguono la regola di sempre.
  const valido = (d?: DomandaSbagliata) => !!d && migraDomandaSbagliata(d, '') === d;
  const locale: Record<string, DomandaSbagliata> = {};
  for (const d of locali) locale[d.chiave] = d;
  const remota: Record<string, DomandaSbagliata> = {};
  for (const d of remote) remota[d.chiave] = d;
  return Object.values(per).map((d) => {
    const fonte = valido(locale[d.chiave]) ? locale[d.chiave] : valido(remota[d.chiave]) ? remota[d.chiave] : undefined;
    return migraDomandaSbagliata(
      fonte ? { ...d, livello: fonte.livello, prossimaIl: fonte.prossimaIl } : { ...d, livello: undefined, prossimaIl: undefined },
    );
  });
}

export function scegliDomandeRipasso<T>(pools: TierPools<T>, n: number = 3): DomandaScelta<T>[] {
  const restanti: Record<1 | 2 | 3, T[]> = { 1: [...pools.tier1], 2: [...pools.tier2], 3: [...pools.tier3] };
  const usate = new Set<T>();
  const preleva = (liv: 1 | 2 | 3): T | undefined => {
    const arr = restanti[liv];
    while (arr.length) {
      const d = arr.shift() as T;
      if (!usate.has(d)) { usate.add(d); return d; }
    }
    return undefined;
  };
  const preferiti: (1 | 2 | 3)[] =
    n <= 1 ? Array(Math.max(n, 0)).fill(1) :
    n === 2 ? [1, 3] :
    [1, 1, ...Array(n - 2).fill(3)];
  const out: DomandaScelta<T>[] = [];
  for (const preferito of preferiti) {
    const cascata: (1 | 2 | 3)[] = preferito === 3 ? [3, 2, 1] : [1, 2, 3];
    for (const liv of cascata) {
      const d = preleva(liv);
      if (d !== undefined) { out.push({ tier: liv, domanda: d }); break; }
    }
  }
  return out;
}
