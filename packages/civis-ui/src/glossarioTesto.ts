// ═══════════════════════════════════════════════════════════════════
// glossarioTesto.ts — la logica PURA del glossario dentro le lezioni
// (fase 2, vedi Civis_Glossario_Specifica.md).
//
// Niente React, niente stringhe di stato nei dati: solo funzioni che, dato
// un testo e il glossario, dicono quali forme toccare, quali escludere
// (regola 4 — la card/slide che definisce il termine) e come ordinare i
// sensi al tocco (regola "quale va dove", sezione «Cosa vede chi tocca»).
//
// Usato da:
// - src/icons/AppIcon.tsx (EmojiText), per il rendering nelle lezioni;
// - scripts/lib-glossario.mjs (i controlli automatici sui contenuti) NON
//   importa direttamente questo file (è .ts, gli script sono Node puro):
//   ripete la stessa logica in JS. Vedi il commento in cima a quel file per
//   il perché e per cosa NON è duplicato (le regole sono le stesse, testate
//   separatamente nei due posti).
// ═══════════════════════════════════════════════════════════════════

export type Significato = {
  senso: string;
  dove: string[];
  esempio: string;
};

export type Voce = {
  forme: string[];
  significati: Significato[];
};

export type Glossario = Record<string, Voce>;

// ── Le forme di tutte le voci ────────────────────────────────────────

export type FormaVoce = { forma: string; chiave: string };

// Più lunghe prima: le espressioni a più parole ("premio di maggioranza")
// si cercano prima delle parole singole che contengono ("maggioranza") —
// vedi la specifica, "Le espressioni tecniche a più parole hanno una voce
// loro".
export function elencoForme(glossario: Glossario): FormaVoce[] {
  const elenco: FormaVoce[] = [];
  for (const [chiave, voce] of Object.entries(glossario)) {
    for (const forma of voce.forme) elenco.push({ forma, chiave });
  }
  return elenco.sort((a, b) => b.forma.length - a.forma.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Occorrenze di forme del glossario in un testo ────────────────────

export type Occorrenza = {
  chiave: string;
  forma: string; // la forma esattamente come compare nel testo
  inizio: number;
  fine: number;
};

// Trova le occorrenze delle forme del glossario in `testo`, in ordine di
// posizione. Parola intera (confine di parola), indifferente a
// maiuscole/minuscole (una parola tecnica a inizio frase resta toccabile).
// Le forme più lunghe (le espressioni a più parole) vengono cercate prima:
// una volta trovata un'espressione, l'intervallo di testo che copre non
// produce anche il match della parola singola contenuta.
export function trovaOccorrenze(testo: string, glossario: Glossario): Occorrenza[] {
  if (!testo) return [];
  const forme = elencoForme(glossario);
  const occupato: Array<[number, number]> = [];
  const trovate: Occorrenza[] = [];
  for (const { forma, chiave } of forme) {
    const re = new RegExp(`\\b${escapeRegExp(forma)}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(testo))) {
      const inizio = m.index;
      const fine = inizio + m[0].length;
      const sovrapposta = occupato.some(([a, b]) => inizio < b && fine > a);
      if (!sovrapposta) {
        occupato.push([inizio, fine]);
        trovate.push({ chiave, forma: m[0], inizio, fine });
      }
    }
  }
  return trovate.sort((a, b) => a.inizio - b.inizio);
}

// ── Regola 4: niente sottolineatura nello step che definisce il termine ──

// Le chiavi del glossario il cui termine (una qualunque `forma`) compare in
// `testo` (tipicamente l'heading della slide o il front della card): quelle
// chiavi non si sottolineano in QUESTO step.
export function chiaviDefiniteIn(testo: string | undefined, glossario: Glossario): Set<string> {
  const risultato = new Set<string>();
  if (!testo) return risultato;
  for (const { chiave, forma } of elencoForme(glossario)) {
    const re = new RegExp(`\\b${escapeRegExp(forma)}\\b`, 'i');
    if (re.test(testo)) risultato.add(chiave);
  }
  return risultato;
}

// ── Regola 5: tetto di 3 per blocco, prima occorrenza per voce ──────────

export type BudgetBlocco = { restanti: number; usate: Set<string> };

export function nuovoBudgetBlocco(tetto = 3): BudgetBlocco {
  return { restanti: tetto, usate: new Set() };
}

// Dato un elenco di occorrenze (in ordine di posizione) già filtrato dalle
// chiavi escluse (regola 4), applica il tetto: la prima occorrenza di ogni
// voce nel blocco viene accettata finché resta budget; le successive
// occorrenze della stessa voce restano sempre escluse (non consumano altro
// budget); una voce nuova quando il budget è esaurito resta esclusa.
// Muta `budget` (condiviso fra le chiamate dello stesso blocco: una slide,
// una card).
export function applicaBudgetBlocco(occorrenze: Occorrenza[], chiaviEscluse: Set<string>, budget: BudgetBlocco): Occorrenza[] {
  const accettate: Occorrenza[] = [];
  for (const occ of occorrenze) {
    if (chiaviEscluse.has(occ.chiave)) continue;
    if (budget.usate.has(occ.chiave)) continue; // già mostrata una volta nel blocco
    if (budget.restanti <= 0) continue; // tetto raggiunto: resta testo semplice
    budget.usate.add(occ.chiave);
    budget.restanti -= 1;
    accettate.push(occ);
  }
  return accettate;
}

// ── "Quale va dove": ordinare i sensi di una voce al tocco ─────────────

type DoveParsato = { id: string; titolo?: string; frammento?: string };

export function parseDove(voceDove: string): DoveParsato {
  const parti = voceDove.split(' › ').map((p) => p.trim());
  const id = parti[0];
  const titolo = parti[1] || undefined;
  const frammentoGrezzo = parti[2];
  const frammento = frammentoGrezzo ? frammentoGrezzo.replace(/^«|»$/g, '') : undefined;
  return { id, titolo, frammento };
}

// "2-*" copre ogni lezione del modulo 2 ("2-1", "2-p", ...); un id semplice
// deve combaciare esattamente.
export function idCorrisponde(doveId: string, lezioneId: string): boolean {
  if (doveId.endsWith('-*')) return lezioneId.startsWith(doveId.slice(0, -1));
  return doveId === lezioneId;
}

export type SensiOrdinati = {
  // Il senso di questo step (regola: prima in evidenza).
  corrente: Significato[];
  // Sensi usati altrove nella STESSA lezione, con l'etichetta della card/step
  // in cui valgono (per "in questa lezione: nella card «…»").
  stessaLezione: { significato: Significato; titolo?: string }[];
  // Sensi usati solo in altre lezioni.
  altre: Significato[];
};

// `titoloStep`: l'heading della slide o il front della card corrente.
// `frammentoTesto`: un frammento del testo reale intorno all'occorrenza
// toccata (per disambiguare due sensi nella stessa card/slide con un
// `dove` a livello di frammento, es. "2-3 › ... › «maggioranza assoluta»").
export function ordinaSignificati(
  voce: Voce,
  lezioneId: string,
  titoloStep?: string,
  frammentoTesto?: string,
): SensiOrdinati {
  const corrente: Significato[] = [];
  const stessaLezione: { significato: Significato; titolo?: string }[] = [];
  const altre: Significato[] = [];

  for (const sig of voce.significati) {
    const parsati = sig.dove.map(parseDove).filter((d) => idCorrisponde(d.id, lezioneId));
    if (parsati.length === 0) {
      altre.push(sig);
      continue;
    }
    const matchFrammento = frammentoTesto
      ? parsati.some((d) => d.frammento && frammentoTesto.includes(d.frammento))
      : false;
    const matchTitolo = parsati.some((d) => !d.frammento && (!d.titolo || d.titolo === titoloStep));
    if (matchFrammento || matchTitolo) {
      corrente.push(sig);
    } else {
      stessaLezione.push({ significato: sig, titolo: parsati[0].titolo });
    }
  }
  return { corrente, stessaLezione, altre };
}
