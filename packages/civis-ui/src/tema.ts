/**
 * tema.ts — valori estetici centralizzati di CivicApp.tsx
 * (colori, dimensioni di testo, spaziature, raggi)
 *
 * Raccoglie qui i valori che ricorrono nel file invece di lasciarli
 * scritti a mano dentro i componenti: stessa misura/colore, stesso nome
 * ovunque compaia. È un lavoro di rinomina, non di restyling: i valori
 * numerici non sono cambiati rispetto a prima.
 */

// ═══════════════════════════════════════════════════════════════════
// TESTO — le dimensioni di fontSize che ricorrono nel file, con un nome
// che dice il ruolo (non la misura). Coperti solo i valori davvero
// ricorrenti: un fontSize usato una volta sola (spesso la dimensione
// di un'emoji/icona dentro un Text) resta scritto a mano nel punto d'uso.
// ═══════════════════════════════════════════════════════════════════
export const TESTO = {
  minuto: 12,          // badge e cifre minuscole (es. "NUOVO", "×3")
  occhiello: 12,       // etichette maiuscole piccolissime (eyebrow, tab bar)
  minuscolo: 13,       // testo secondario piccolo (didascalie, note)
  piccolo: 14,         // testo secondario (sottotitoli di modulo/sezione)
  corpoPiccolo: 15,    // corpo piccolo (testo diffuso in tutta l'app)
  corpo: 16,           // corpo (paragrafi, righe di lista)
  corpoGrande: 17,     // corpo enfatizzato (titoli di modulo, input)
  sottotitolo: 18,     // sottotitoli e wordmark
  titoloPiccolo: 20,   // titoli di sezione piccoli (domanda del quiz)
  titolo: 18,          // titoli
  titoloMedio: 26,     // titoli pagina (appTitle e affini)
  titoloGrande: 28,    // titoli grandi (fine lezione, header schermata)
  titoloEnorme: 28,    // titoli enormi (nome profilo, statistiche)
};

// ═══════════════════════════════════════════════════════════════════
// SPAZIO / RAGGIO — scala di riferimento per spaziature e raggi.
// NOTA: qui è definita la scala, ma gli usi di padding/margin/gap nel
// file NON sono stati sostituiti in questo giro (sono centinaia di
// occorrenze, in gran parte aggiustamenti locali di layout, contro le
// poche decine di fontSize/colori che erano l'oggetto di questo lavoro).
// borderRadius invece segue già di fatto questa scala nel file.
// ═══════════════════════════════════════════════════════════════════
export const SPAZIO = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24,
};

export const RAGGIO = {
  sm: 4, md: 8, lg: 12, xl: 14, pill: 20, tondo: 99,
};

// ═══════════════════════════════════════════════════════════════════
// TEMA COLORI
// ═══════════════════════════════════════════════════════════════════
export const C = {
  bg: '#0b1120',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHover: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.1)',
  borderSubtle: 'rgba(255,255,255,0.05)',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  // textDim/textVeryDim schiariti per rispettare WCAG 2.1 AA (≥4.5:1 su bg e surface).
  // Valori precedenti (#475569 = 2.48, #334155 = 1.82) NON erano leggibili.
  textDim: '#8b99ad',
  textVeryDim: '#7c8ba3',
  green: '#16a34a', greenBg: '#14532d', greenText: '#4ade80',
  red: '#dc2626', redBg: '#450a0a', redText: '#f87171',
  yellow: '#facc15', yellowBg: '#422006',
  orange: '#fb923c', orangeBg: '#1c0a00',
  indigo: '#4f46e5',
  teal: '#22d3ee',
  // Stato "selezionato (non ancora confermato)" — accento indaco neutro,
  // non verde/rosso, così non rivela ancora se la risposta è giusta.
  selBg: 'rgba(99,102,241,0.22)', selBorder: '#818cf8',

  // Verdi extra (brand/social), distinti dal verde "risposta corretta" sopra.
  greenPrimary: '#5c8a3e',  // CTA principali (bottoni "primary" verdi)
  greenSoft: '#a7d29a',     // testo/accento verde chiaro (XP, username, esiti)
  greenAccent: '#7fb45a',   // icone e accenti verdi medi (social, streak)

  scenario: '#f59e0b',      // colore neutro dei formati quiz (scenario, intruso, ordina…)
  gold: '#fbbf24',          // oro: record, podio, pacchetti gold
  slate: '#1e293b',         // ardesia scura: sfondi/bordi scuri e testo su sfondo chiaro
  surfaceDark: '#0f172a',   // sfondo di carte/modali, più scuro del bg
  divider: '#334155',       // separatori e bordi medi (track, handle modale)
  dividerFaint: '#33415588', // variante del divider con alpha incorporato
  lightText: '#cbd5e1',     // testo chiaro secondario (wordmark, corpo delle slide)
  inputBg: '#151c2e',       // sfondo dei campi di input
  indigoLight: '#a5b4fc',   // indaco chiaro (livelli, XP)
  indigoPale: '#c7d2fe',    // indaco pallido (numeri di livello)
  fuchsia: '#e879f9',       // magenta chiaro (figurine, pacchetti)
  magenta: '#c026d3',       // magenta scuro (avviso pacchetti da aprire)
  lightMuted: '#64748b',    // grigio testo secondario su sfondo chiaro (album)
  optionText: '#dbe4f5',    // testo delle opzioni del quiz
  white: '#fff',            // bianco puro (testo su badge/bottoni colorati, carte figurina)
};
