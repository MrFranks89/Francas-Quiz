# Basi dell'interfaccia di Civis

Tema chiaro e scuro e componenti di base dell'interfaccia di Civis.
Proprietario: Federico. Fonte: repository locale `C:/Civica`, commit
`db9ff48`, directory `CivicaApp`.

I percorsi riproducono quelli di Civis (`src/tema.ts`, `src/ThemeProvider.tsx`,
`src/comune/...`, `__tests__/comune/...`). `provenance.json` dichiara ogni
file del pacchetto con uno di tre tipi:

- `copia`: file di Civis copiato byte per byte, con percorso d'origine e SHA256;
  non si modifica mai;
- `sostituto`: modulo nostro nello stesso percorso di un modulo Civis che non
  si porta (icone, emoji, dati); il file spiega cosa sostituisce e perché;
- `nostro`: test scritti qui, per esempio dove Civis non ha un test portabile.

`__tests__/nostri/integrity.test.ts` controlla gli hash senza il repository
di Civis e rifiuta file non dichiarati. I fine riga delle copie sono quelli
del file su disco in Civis e `.gitattributes` (radice) li protegge con `-text`.

I test girano con Jest e il preset di React Native, come in Civis; il resto
del progetto usa Vitest. Dalla radice: `npm test` esegue Vitest e poi
`npm run test:ui` (questo pacchetto); `npm run typecheck` controlla anche
questo pacchetto con il suo `tsconfig.json`.

## Contenuto

- Copie: `src/tema.ts`, `src/ThemeProvider.tsx`, `src/comune/` `contrast.ts`,
  `stili.ts`, `useReducedMotion.ts`, `Btn`, `Card`, `ProgressBar`,
  `OptLetter`, `FeedbackMotion`, `DifficultyBadge`, `FormatPill`; test
  originali di `Btn`, `Card`, `ProgressBar`, `OptLetter`, `OptMark`,
  `DifficultyBadge`, `FormatPill`.
- Sostituti: `src/icons/AppIcon.tsx` (`EmojiText` testo semplice, `EmojiIcon`
  vuoto), `src/comune/Emoji.tsx` (vuoto), `src/comune/OptMark.tsx` (parole
  «Giusta»/«Sbagliata» al posto dei segni).
- Non portati: `__tests__/ThemeProvider.test.tsx` (importa logo e schermate
  di accesso; i casi portabili sono in `__tests__/nostri/`) e
  `__tests__/comune/BtnContrast.test.tsx` (importa i pacchetti di figurine).

La chiave di salvataggio del tema resta quella di Civis, `civis.ui.theme`.

Il pacchetto non è ancora usato dall'app: il lettore lo adotterà nel passo
successivo.
