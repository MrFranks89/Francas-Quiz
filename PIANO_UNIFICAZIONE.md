# PIANO OPERATIVO DI UNIFICAZIONE: PIATTAFORMA FORMAZIONE + QUIZZ-APP

> **Data stesura:** 17 novembre 2026  
> **Repository base target:** `Piattaforma Formazione` (branch `master`)  
> **Sorgente migliorie:** `Quizz-app\Quizz-app\piattaforma-formazione`  
> **Riferimento visuale UX:** `Socrate quizhand`  
> **Stato:** Pronto per esecuzione a blocchi verificati

---

## 1. Obiettivo Strategico
Fondere il **miglior backend** (presente in `Piattaforma Formazione`: estrazione Docling OCR, toggle esclusione pagine, indice concettuale Algor a due stadi per eliminare il blocco token 502) con la **migliore architettura frontend mobile** (sviluppata in `Quizz-app`: Guscio universale, gestione tastiera su Android 15+/iOS, componenti spacchettati sotto 300 righe, tipo quiz `matching`, asset Expo e 296 test Vitest), **adottando e applicando formalmente l'identità visiva e l'estetica di `Socrate quizhand`**.

---

## 1.1 Direttiva di Design System: Estetica Obbligatoria (Socrate Quizhand)
L'interfaccia dell'applicazione unificata deve adottare l'estetica comprovata di **Socrate Quizhand**:

1. **Dashboard & Hero Section:**
   - Background tema scuro elegante in gradiente: `bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900`.
   - Tipografia hero con testo gradiente: `text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-400`.
   - Badge descrittivi a pillola traslucida: `bg-blue-500/20 border border-blue-400/30 text-blue-300 rounded-full`.
   - Card statistiche "glass": `bg-white/5 border border-white/10 rounded-2xl p-6`.

2. **Visualizzatore Slide (`SlideViewer`):**
   - Barra di avanzamento segmentata orizzontale: indicatori a pillola (`h-1.5` o `h-2 flex-1 rounded-full`) con stato attivo in blu vivido (`bg-blue-600`), passati in azzurro e futuri in grigio tenue.
   - Header semantici della slide:
     - Teoria standard: banner azzurro `bg-blue-50 border border-blue-100 text-blue-800` con icona libro (`BookOpen`).
     - Esempi pratici: banner ambra `bg-amber-50 border border-amber-200 text-amber-800` con icona lampadina (`Lightbulb`) e badge `"Esempio Pratico"`.
   - Tipografia dei contenuti: stile tipografico leggibile (`prose-slate`) con risalto di definizioni e regole d'oro in callout borderati.

3. **Interfaccia Quiz & Mini-Quiz:**
   - Card opzioni pulite con badge lettera (`A`, `B`, `C`, `D`) in box dedicato (`w-6 h-6 rounded-lg bg-white border border-slate-300`).
   - Feedback istantaneo cromatico:
     - Risposta esatta: bordo e sfondo verde smeraldo (`border-emerald-500 bg-emerald-50/60`).
     - Risposta errata: bordo e sfondo rosso corallo (`border-rose-500 bg-rose-50/60`).
   - Box razionale espandibile con motivazione pedagogica chiara.

4. **Navigatore Corsi & Capitoli:**
   - Struttura gerarchica a sezioni con indicatori visivi di stato: spunta verde per completati, badge pillola per "In corso", lucchetto grigio per sezioni bloccate.
   - Indicatori espliciti delle soglie di sbarramento (es. `"Soglia minima: 80%"`).

---

## 2. Analisi delle Modifiche: Perché l'unione è pulita
Il confronto puntuale dei file tra i due repository rivela:
* **60 file esclusivi di Quizz-app:** componenti UI, moduli di stato, asset e test (trasferibili per semplice copia).
* **31 file esclusivi di Piattaforma Formazione:** driver Docling, adapter OCR, contratti concettuali e script di avvio (da preservare intatti).
* **Soltanto 10 file toccati da entrambi:** contengono modifiche complementari e non confliggenti.

---

## 3. Fasi di Esecuzione Operativa

### FASE 1: Trasferimento Asset e Componenti Modulari Nuovi (Rischio: Nullo)
*Nessun file esistente viene sovrascritto; si arricchisce la codebase con i moduli creati in Quizz-app.*

1. **Asset grafici dell'app nativa:**
   - Copiare l'intera cartella `apps/learner/assets/` (`icon.png`, `adaptive-icon-foreground.png`, `splash-mark.png`, `genera_asset.py`).
2. **Componenti UI del Guscio e Navigazione Mobile:**
   - `apps/learner/src/components/Guscio.tsx` (gestione tastiera reattiva e safe-area)
   - `apps/learner/src/components/useIndietro.ts`
   - `apps/learner/src/components/RigheOpzione.tsx`
   - `apps/learner/src/components/stiliOpzione.ts`
   - `apps/learner/src/components/DomandaEsame.tsx`
   - `apps/learner/src/components/SezioneEsame.tsx`
   - `apps/learner/src/components/AccoppiamentoView.tsx` (vista quiz abbinamento)
3. **Moduli di stato e test isolati:**
   - `apps/learner/src/state/tastiera.ts` e `tastiera.test.ts`
   - `apps/learner/src/state/risposte.ts` e `risposteSlice.test.ts`
   - `apps/learner/src/struttura.test.ts`
   - `docs/decisions/005-guscio-mobile.md`
4. **Verifica Fase 1:** Esecuzione `npm run typecheck` in `apps/learner`.

---

### FASE 2: Refactoring Viste Esame e Struttura Schermate (Rischio: Basso)
*Sostituzione dei file monolitici del learner con le versioni spacchettate e stabili di Quizz-app.*

1. **Sostituzione di `ExamView.tsx`:**
   - Sostituire `apps/learner/src/components/ExamView.tsx` con la versione di Quizz-app (ridotta da 436 a 299 righe, con delega a `DomandaEsame` e `SezioneEsame`).
2. **Sostituzione di `CourseScreen.tsx` e test:**
   - Sostituire `apps/learner/src/screens/CourseScreen.tsx` (ridotto da 442 a 287 righe) e `CourseScreen.test.ts`.
3. **Aggiornamento `App.tsx`:**
   - Integrare in `apps/learner/src/App.tsx` il wrapping con `Guscio` e la gestione tastiera preservando i componenti di Piattaforma Formazione (es. pannelli bozza).
4. **Verifica Fase 2:** Esecuzione `npx vitest run` sui test di learner.

---

### FASE 3: Integrazione Tipo di Domanda `matching` (Accoppiamento) (Rischio: Basso)
*Estensione della didattica Civis per supportare le domande a corrispondenza biunivoca.*

1. **Contratti Condivisi (`packages/contracts`):**
   - In `packages/contracts/src/tipi.ts`: aggiungere `'matching'` a `TIPI_DOMANDA`, definire `Coppia`, `MIN_COPPIE = 3`, `MAX_COPPIE = 6` e le regole di validazione biunivoca.
   - In `packages/contracts/src/structure.ts`: includere `pairs` nella definizione strutturale.
2. **Learning Engine (`packages/learning-engine`):**
   - In `src/adapter.ts` e `src/progress.ts`: aggiornare calcolo punteggio e grading per `matching`.
   - Aggiornare `__tests__/grade.test.ts`.
3. **Validazione Backend (`services/api`):**
   - Copiare `services/api/formazione_api/generation/validazione.py` e `services/api/tests/test_validazione.py`.
   - Aggiornare `regole.py` e `models.py` per includere `matching` nello schema bozza.
4. **Verifica Fase 3:** Esecuzione `pytest services/api/tests/test_validazione.py` e test contratti.

---

### FASE 4: Riconciliazione dei 10 File Condivisi (Rischio: Medio, controllato)
*Fusione mirata delle righe nei 10 file toccati da entrambi i progetti:*

1. `services/api/formazione_api/config/prezzi.json`: unire i nuovi prezzi di Quizz-app.
2. `services/api/formazione_api/generation/instructions.py` e `pipeline.py`: preservare la gestione Algor a due stadi e aggiungere le regole per il prompt del tipo `matching`.
3. `apps/learner/src/components/DomandaEditor.tsx`: mantenere i tab dell'editor (Piattaforma Formazione) e abilitare la modifica del tipo `matching` (Quizz-app).
4. `apps/learner/src/screens/ImportScreen.tsx`: mantenere la selezione pagine Docling unita alle rifiniture UI di Quizz-app.
5. `.env.example` e `docs/GENERAZIONE.md`: unire le variabili di configurazione.

---

### FASE 5: Applicazione Design System Socrate & Styling Visivo
*Applicazione fedele delle regole estetiche di Socrate su tutte le viste di `apps/learner`:*
1. **Hero & Home:** applicare la palette scura `slate-900 / blue-950` con le card statistiche glassmorphism.
2. **Navigatore Lezioni & SlideViewer:** adottare la barra a pillole segmentate (`rounded-full`), il banner azzurro per la teoria e il box ambra per gli esempi pratici.
3. **Card Quiz e Feedback:** applicare i badge lettera boxati e la stilizzazione cromatico-pedagogica per le risposte e i razionali.

---

### FASE 6: Collaudo Finale e Consolidamento Git
1. **Frontend:** Esecuzione completa di `npm run typecheck` e `npx vitest run` (target: tutti i test verdi).
2. **Backend:** Esecuzione di `pytest` (target: 517+ test verdi).
3. **Verifica Avvio:** Lancio di `Avvia Studio Formazione.bat` con controllo caricamento PDF ed esportazione corso.
4. **Git Commit:** Creazione di un commit formale su `master`:
   `feat: fusione unificata migliorie mobile Quizz-app, tipo matching, Guscio universale ed estetica Socrate`

---

## 4. Matrice di Recupero Visuale da `Socrate quizhand`
Durante e dopo l'unione, gli elementi di design di Socrate da integrare progressivamente nell'UI del learner sono:
* **Palette Hero & Dashboard:** Sfondo scuro elegante `bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900` con badge dorati/azzurri.
* **Barra di Avanzamento Slide a Pillole:** Il segmento `h-1.5 flex-1 rounded-full` di `SlideViewer.jsx` che dà feedback visivo immediato della posizione nella lezione.
* **Badge Esempio Pratico:** Box ambra `bg-amber-50 border-amber-200 text-amber-800` con icona lampadina per evidenziare i casi studio reali.
