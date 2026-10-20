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
  `OptLetter`, `FeedbackMotion`, `DifficultyBadge`, `FormatPill`;
  `src/lezione/` `SlideStep`, `SpeakerButton`, `util.ts`, e ciò che importano:
  `src/ripasso.ts` (da `util.ts`) e `src/glossarioTesto.ts` (da `SlideStep`).
  Test originali di `Btn`, `Card`, `ProgressBar`, `OptLetter`, `OptMark`,
  `DifficultyBadge`, `FormatPill`, `lezione/SlideStep`,
  `lezione/SpeakerButton`, `ripasso`, `glossarioTesto`.
- Sostituti: `src/icons/AppIcon.tsx` (`EmojiText` testo semplice con il solo
  grassetto `**parola**` di Civis, `EmojiIcon` vuoto, tipo
  `ContestoGlossarioTesto`), `src/comune/Emoji.tsx` (vuoto),
  `src/comune/OptMark.tsx` (parole «Giusta»/«Sbagliata» al posto dei segni),
  `src/speech.ts` (`useSpeech` senza effetti: niente react-native-tts),
  `src/glossario.ts` (`GLOSSARIO` vuoto: i dati del glossario civico non si
  portano).
- Non portati: `__tests__/ThemeProvider.test.tsx` (importa logo e schermate
  di accesso; i casi portabili sono in `__tests__/nostri/`),
  `__tests__/comune/BtnContrast.test.tsx` (importa i pacchetti di figurine;
  al suo posto `__tests__/nostri/BtnContrast.palette.test.tsx`, contrasto del
  `Btn` sulle palette chiara e scura), `__tests__/lezione/SlideStepGlossario.test.tsx`
  (verifica parole del glossario civico), `__tests__/ripassoLivelli.test.ts`
  (dipende da `src/auth/progressSync`), `__tests__/glossario.test.ts` (dati).

La chiave di salvataggio del tema resta quella di Civis, `civis.ui.theme`.

Il lettore (`apps/learner`) usa il pacchetto: `ThemeProvider`, `Btn`, `Card`,
`ProgressBar`, `stili`, `OptLetter`, `OptMark`, `SlideStep` e `optState`. A
`SlideStep` passa sempre `onTesti`, così il pulsante altoparlante (voce
sostituita) non viene disegnato: lo verifica
`__tests__/nostri/SlideStep.lettore.test.tsx`. Il tema parte da 'system' perché
l'app salva quella preferenza prima di montare il provider
(`apps/learner/src/state/tema.ts`), senza modificare la copia.
