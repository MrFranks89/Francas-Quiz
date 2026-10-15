// Modalità esame (Pro, personale): logica PURA — niente React, niente storage,
// niente rete. La schermata (EsameScreen.tsx) la usa; lo stato dell'esame vive
// solo nel componente: non si salva nulla a metà, se si esce dall'app l'esame
// è perso (lo si dice all'utente prima di cominciare).
//
// Le domande vengono dai QUIZ di fine lezione (`type: "quiz"`, `questions` e
// `pool`) dei moduli scelti, ridotti alla forma a scelta multipla con
// normalizzaPerRipasso (src/ripasso.ts). Le risposte NON toccano vite, XP,
// pacchetti né telemetria: gli errori entrano solo nel ripasso a livelli.
import { normalizzaPerRipasso, creaDomandaSbagliata, aggiungiDomandaSbagliata, DomandaSbagliata } from '../ripasso';

// UNICA fonte di numero di domande e tempo: un minuto a domanda (deciso da
// Federico, 6/10). Numero e durata non possono divergere perché la durata si
// ricava sempre da qui (durataEsameMs).
export const DIMENSIONI_ESAME = [
  { domande: 10, minuti: 10 },
  { domande: 20, minuti: 20 },
  { domande: 30, minuti: 30 },
];
export const DIMENSIONE_PREDEFINITA = DIMENSIONI_ESAME[1];
export const NUM_DOMANDE_ESAME = DIMENSIONE_PREDEFINITA.domande;
export const DURATA_ESAME_MS = DIMENSIONE_PREDEFINITA.minuti * 60 * 1000;

// Durata in ms di un esame da `domande` domande (deve essere una dimensione
// prevista); per un numero fuori tabella si torna a un minuto a domanda.
export function durataEsameMs(domande: number): number {
  const d = DIMENSIONI_ESAME.find((x) => x.domande === domande);
  return (d ? d.minuti : domande) * 60 * 1000;
}

export type DomandaEsame = {
  id: string; // lezione#step#testo: serve a evitare i doppioni
  lezioneId: string;
  stepIdx: number;
  moduloId: number;
  q: string;
  options: string[];
  correct: number;
  explanation?: string;
  perche?: (string | null)[];
  emoji?: string;
  difficulty?: string;
};

// Tutte le domande dei quiz di fine lezione dei moduli indicati, senza
// doppioni (stesso id, o stesso testo di domanda già preso).
export function raccogliDomandeQuiz(moduli: any[], moduloIds: number[]): DomandaEsame[] {
  const scelti = new Set(moduloIds);
  const viste = new Set<string>();
  const out: DomandaEsame[] = [];
  for (const m of moduli) {
    if (!scelti.has(m.id)) continue;
    for (const lez of m.lessons || []) {
      (lez.steps || []).forEach((st: any, stepIdx: number) => {
        if (st?.type !== 'quiz') return;
        const banca = [...(Array.isArray(st.questions) ? st.questions : []), ...(Array.isArray(st.pool) ? st.pool : [])];
        for (const raw of banca) {
          const n = normalizzaPerRipasso({
            type: 'quiz_single', q: raw?.q, options: raw?.options, correct: raw?.correct,
            difficulty: raw?.difficulty, emoji: st.emoji, explanation: raw?.explanation, perche: raw?.perche,
          });
          if (!n) continue;
          const id = `${lez.id}#${stepIdx}#${n.q}`;
          const testo = n.q.trim().toLowerCase();
          if (viste.has(id) || viste.has(testo)) continue;
          viste.add(id); viste.add(testo);
          out.push({
            id, lezioneId: lez.id, stepIdx, moduloId: m.id, q: n.q, options: n.options, correct: n.correct,
            explanation: n.explanation, perche: n.perche, emoji: n.emoji, difficulty: n.difficulty,
          });
        }
      });
    }
  }
  return out;
}

// Fisher-Yates su una copia; `rng` iniettabile per i test.
export function mescola<T>(lista: T[], rng: () => number = Math.random): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Rimescola le opzioni di una domanda tenendo allineati `correct` e `perche`.
function mescolaOpzioni(d: DomandaEsame, rng: () => number): DomandaEsame {
  const ordine = mescola(d.options.map((_, i) => i), rng);
  return {
    ...d,
    options: ordine.map((i) => d.options[i]),
    correct: ordine.indexOf(d.correct),
    perche: d.perche ? ordine.map((i) => d.perche![i] ?? null) : undefined,
  };
}

// L'esame: `n` domande diverse pescate a caso; se la banca ne ha meno, tutte.
export function pescaDomande(banca: DomandaEsame[], n: number = NUM_DOMANDE_ESAME, rng: () => number = Math.random): DomandaEsame[] {
  return mescola(banca, rng).slice(0, Math.max(0, n)).map((d) => mescolaOpzioni(d, rng));
}

// Quote di partenza: `totale` diviso equamente fra i moduli, il resto (uno a
// testa) ai primi. 20 su 3 → 7/7/6. La somma fa sempre `totale`.
export function quoteEque(moduliScelti: number[], totale: number): Record<number, number> {
  const out: Record<number, number> = {};
  const n = moduliScelti.length;
  if (n === 0) return out;
  const t = Math.max(0, Math.floor(totale));
  const base = Math.floor(t / n);
  const resto = t % n;
  moduliScelti.forEach((id, i) => { out[id] = base + (i < resto ? 1 : 0); });
  return out;
}

// Pesca da ogni modulo la sua quota. Un modulo povero dà quelle che ha e il
// resto va ridistribuito, una alla volta a rotazione, fra i moduli che ne
// hanno ancora. Se in totale non bastano, torna tutte quelle che ci sono
// (chi chiama confronta la lunghezza col totale chiesto per avvisare l'utente).
// Nessun doppione: ogni domanda sta in una sola banca e si prende una volta.
export function pescaDomandePerModulo(
  bancaPerModulo: Record<number, DomandaEsame[]>,
  quote: Record<number, number>,
  rng: () => number = Math.random,
): DomandaEsame[] {
  const ids = Object.keys(quote).map(Number);
  const mescolate: Record<number, DomandaEsame[]> = {};
  const presi: Record<number, number> = {};
  let mancanti = 0;
  for (const id of ids) {
    mescolate[id] = mescola(bancaPerModulo[id] || [], rng);
    const q = Math.max(0, Math.floor(quote[id] || 0));
    presi[id] = Math.min(q, mescolate[id].length);
    mancanti += q - presi[id];
  }
  while (mancanti > 0) {
    let mossa = false;
    for (const id of ids) {
      if (mancanti <= 0) break;
      if (presi[id] < mescolate[id].length) { presi[id]++; mancanti--; mossa = true; }
    }
    if (!mossa) break;
  }
  const scelte = ids.flatMap((id) => mescolate[id].slice(0, presi[id]));
  return mescola(scelte, rng).map((d) => mescolaOpzioni(d, rng));
}

// ── Tempo: funzione del tempo trascorso, non un contatore che scende ──
export function tempoRimasto(inizioMs: number, adessoMs: number, durataMs: number = DURATA_ESAME_MS): number {
  return Math.max(0, durataMs - Math.max(0, adessoMs - inizioMs));
}
export function tempoScaduto(inizioMs: number, adessoMs: number, durataMs: number = DURATA_ESAME_MS): boolean {
  return tempoRimasto(inizioMs, adessoMs, durataMs) <= 0;
}
// "14:59": i secondi si arrotondano per eccesso, così "00:00" vuol dire scaduto.
export function formattaTempo(ms: number): string {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Voto ──
export type RigaEsito = {
  domanda: DomandaEsame;
  scelta: number | null; // null = senza risposta (conta come sbagliata)
  corretta: boolean;
};
export type EsitoEsame = {
  righe: RigaEsito[];
  corrette: number;
  sbagliate: number;
  senzaRisposta: number;
  totale: number;
  voto: number; // decimi, una cifra decimale
};

// Voto in decimi con una cifra decimale: corrette/totale × 10.
export function votoInDecimi(corrette: number, totale: number): number {
  if (totale <= 0) return 0;
  return Math.round((corrette / totale) * 100) / 10;
}
// 7,5 → "7,5/10"; 10 → "10,0/10".
export function formattaVoto(voto: number): string {
  return `${voto.toFixed(1).replace('.', ',')}/10`;
}

export function valutaEsame(domande: DomandaEsame[], risposte: (number | null | undefined)[]): EsitoEsame {
  const righe: RigaEsito[] = domande.map((d, i) => {
    const r = risposte[i];
    const scelta = typeof r === 'number' ? r : null;
    return { domanda: d, scelta, corretta: scelta !== null && scelta === d.correct };
  });
  const corrette = righe.filter((r) => r.corretta).length;
  const senzaRisposta = righe.filter((r) => r.scelta === null).length;
  return {
    righe, corrette, senzaRisposta, sbagliate: righe.length - corrette, totale: righe.length,
    voto: votoInDecimi(corrette, righe.length),
  };
}

// Le domande sbagliate (comprese quelle senza risposta) entrano nel ripasso a
// livelli: livello 1, scadenza domani (creaDomandaSbagliata).
export function aggiungiErroriEsameAlRipasso(lista: DomandaSbagliata[], esito: EsitoEsame, adesso: Date = new Date()): DomandaSbagliata[] {
  let out = lista;
  for (const r of esito.righe) {
    if (r.corretta) continue;
    const d = r.domanda;
    out = aggiungiDomandaSbagliata(out, creaDomandaSbagliata({
      lezioneId: d.lezioneId, stepIdx: d.stepIdx, moduloId: d.moduloId,
      domanda: d.q, opzioni: d.options, correctIndex: d.correct,
      spiegazione: d.explanation, perche: d.perche, emoji: d.emoji, difficulty: d.difficulty,
    }, adesso));
  }
  return out;
}
