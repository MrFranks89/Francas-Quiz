# COORDINAMENTO OPERATIVO: ARCHITETTURA, ALGOR BENCHMARK & ROADMAP

> **Destinatario principale:** Claude / Team di Sviluppo  
> **Data ultimo aggiornamento:** 16 novembre 2026 (pomeriggio)  
> **Stato:** Fase 1 (Stabilità token), Fase 2 (Contratti e Provider Mappa Concettuale) e Identificazione Capitoli/Paragrafi (Algor style) COMPLETATE.  
> **Oggetto:** Risoluzione errore `provider_incomplete`, pipeline concettuale gerarchica a 2 stadi, identificazione semantica capitoli/paragrafi in Docling/Frontend, potenziamento estrazione per Tabelle e Immagini (Vision Multimodale).  
> **Direttiva UI/UX Vincolante:** Adottare il design system e l'estetica visiva di `Socrate quizhand` (v. `PIANO_UNIFICAZIONE.md`).

---

## 1. Stato Attuale e Diagnosi dell'Errore Critico

### Errore: *"Risposta AI incompleta; nessun corso pubblicato"* (`provider_incomplete`)
Durante la generazione da documenti complessi (es. `analisi1.pdf`, 423 pagine, blocco pp. 4–10 con Claude Haiku 5.5), la generazione fallisce con errore HTTP 502:
```json
{
  "code": "provider_incomplete",
  "message": "Risposta AI incompleta; nessun corso pubblicato"
}
```

### Causa Tecnica Esatta (verificata in `var/api/registro-spesa-app.json`):
1. **Saturazione Token di Output:** La chiamata a Claude Haiku ha raggiunto esattamente **6.000 token di output**, esaurendo il limite `MAX_OUTPUT_TOKENS = 6000` fissato in `services/api/formazione_api/generation/instructions.py`.
2. **Troncamento del Provider:** Quando Anthropic raggiunge `max_tokens`, tronca la risposta a metà e restituisce `stop_reason = 'max_tokens'` (anziché `'end_turn'`). OpenAI e Gemini restituiscono analogamente `finish_reason = 'length'`.
3. **Guardia Atomica di Integrità:** In `services/api/formazione_api/generation/anthropic_provider.py` (L97–98) e in `openai_compat_provider.py`:
   ```python
   if stop_reason != 'end_turn':
       raise GenerationError('provider_incomplete', 'Risposta AI incompleta; nessun corso pubblicato')
   ```
   Il sistema rifiuta correttamente JSON monchi o corsi corrotti e abortisce la pubblicazione.
4. **Perché è avvenuto:** Approccio monolitico "one-shot": un blocco sorgente di 12.000 caratteri molto denso viene inviato all'LLM chiedendo di generare contemporaneamente titolo, obiettivi, tutte le slide e tutti i quiz (con schema piatto a 7 tipologie e relative `rationales` per ciascun distrattore). Questo formato JSON supera facilmente i 6.000 token.

---

## 2. Benchmark con Algor Education: Cosa Imparare

Algor Education (EdTech per schematizzazione e supporto allo studio/DSA) adotta un'architettura disaccoppiata e gerarchica che dobbiamo integrare:

| Caratteristica | Algor Education | Studio Formazione (Attuale) | Studio Formazione (Target) |
|---|---|---|---|
| **Pipeline di Generazione** | Gerarchica a 2 stadi: prima Albero Concettuale, poi derivazioni | Monolitica one-shot: da 12k caratteri direttamente a slide + tutti i quiz | **Gerarchica a 2 stadi** (Concept Tree -> Slide e Quiz mirati) |
| **Output Primario** | Mappa Concettuale / Mentale interattiva visiva ad albero | Modulo a slide lineari sequenziali | **Mappa Concettuale esplorabile + Corsi e Quiz Civis** |
| **Rischio Overflow Token** | Nullo: l'albero concettuale consuma <1.200 token | Elevato nei documenti densi (troncamento a 6k token) | **Nullo**: chiamate modulari e circoscritte |
| **Tracciabilità Fonti** | Assente (sintesi astratta priva di coordinate sorgente) | Totale (`sourceRefs` con coordinate offset e pagina) | **Totale e Visiva**: nodi della mappa con link alle coordinate PDF |
| **Didattica e Quiz** | Quiz superficiali standard a scelta multipla | Motore Civis avanzato (7 tipi, ruoli distrattori, rationales) | **Insuperabile**: la sintesi visiva di Algor + il rigore Civis |
| **Tabelle e Figure** | Riconoscimento layout e immagini multimodali | Tabelle spesso appiattite; figure ignorate con warning | **Layout con tabelle Markdown + Vision multimodale per figure** |

---

## 3. Obiettivo 1: Riforma della Pipeline di Generazione (Concept Tree)

Per eliminare definitivamente `provider_incomplete` e fornire la vista a Mappa Concettuale:

### Stadio A: Estrazione dell'Albero Concettuale (`ConceptTree`)
Invece di chiedere all'AI l'intero modulo in un colpo solo, la prima chiamata riceve il testo estratto e produce un albero concettuale strutturato:
* **Schema `ConceptTreeDraft`:**
  - `rootTitle`: macro-argomento del documento o capitolo.
  - `branches`: lista di 3–5 rami logici (concetti chiave).
  - `nodes`: sotto-concetti per ogni ramo, con:
    - `title`: etichetta concisa (es. *"Funzione biiettiva"*).
    - `summary`: definizione o regola essenziale in 1–2 frasi.
    - `sourceRefs`: coordinate precise `[sourceId:start-end]` della fonte.
* **Vantaggi:** Consuma ~800–1.200 token di output. Nessun rischio di troncamento. Fornisce direttamente i dati per renderizzare la **Mappa Concettuale interattiva** nel client.

### Stadio B: Generazione Didattica Mirata per Ramo
A partire dai nodi del `ConceptTree`:
* Generare 1–2 slide e 1–2 quiz per ciascun ramo concettuale.
* Ciascuna chiamata didattica è breve (1.500–2.500 token), rapida e parallellizzabile.
* Nessun quiz ripete concetti di altri moduli; copertura garantita di tutti i nodi essenziali.

---

## 4. Obiettivo 2: Potenziamento Estrazione Documenti (Tabelle e Immagini)

Attualmente:
- L'estrattore nativo (`extractors.py` con `pypdf`/`pypdfium2`) mescola il testo delle tabelle e ignora le immagini.
- L'adattatore Docling (`docling_adapter.py`) rileva le immagini ma le scarta con un warning (`Figura a pagina X: contenuto visivo da verificare`).

### A. Riconoscimento e Conservazione delle Tabelle
1. **Estrazione Strutturata:**
   - In `docling_adapter.py`, abilitare e preservare l'estrazione delle tabelle convertite in **Markdown strutturato** (`| Colonna 1 | Colonna 2 |`), mantenendo le intestazioni.
   - Nell'estrattore nativo: rilevare matrici di testo allineate e serializzarle in formato tabellare leggibile anziché come flusso continuo.
2. **Utilizzo Didattico:**
   - Il chunker preserva la tabella integra all'interno di un unico blocco.
   - L'AI può generare domande specifiche di lettura dati o interpretazione grafica della tabella.

### B. Analisi Multimodale delle Immagini e Diagrammi (Vision Pipeline)
Come Algor, la piattaforma deve "vedere" grafici, schemi, formule complesse e diagrammi:
1. **Rilevamento e Ritaglio (Crop):**
   - Quando Docling o `pypdfium2` individua un riquadro immagine/diagramma (`FPDF_PAGEOBJ_IMAGE` o item `picture` con dimensioni significative, > 100x100 px):
   - Ritagliare l'immagine della figura e salvarla in `var/api/media/<doc_id>_<page>_<fig_id>.png`.
2. **Interpretazione Semantica Multimodale:**
   - Inviare l'immagine ritagliata al provider configurato con capacità Vision (Claude Haiku 3.5/5, Gemini 1.5/2.0 Flash) con prompt mirato:
     > *"Descrivi questo diagramma/figura didattica in modo chiaro ed esatto. Spiega i punti chiave, le grandezze sugli assi, le relazioni e il significato didattico."*
3. **Integrazione come Fonte Primaria:**
   - Il testo generato dalla Vision viene inserito nei blocchi d'estrazione con tag `[Figura: <descrizione>]` e metadato `mediaRef`.
   - La slide corrispondente non solo spiega il diagramma, ma l'app `learner` può mostrare l'immagine ritagliata originale nella lezione.

---

## 5. Stato di Avanzamento e Registro Modifiche

### Fase 0: Fix Immediato OCR & Distinzione Pagine nell'Estrazione (COMPLETATA)
- **Backend OCR (Docling):**
  - In `services/api/formazione_api/docling_adapter.py`: default automatico di `DOCLING_ARTIFACTS_PATH` alla cartella locale `.cache/docling` se presente, impostando anche `HF_HOME`, `HF_HUB_OFFLINE='1'` e `TRANSFORMERS_OFFLINE='1'`.
- **Frontend Estrazione Pagine (`apps/learner`):**
  - Selezione pagine pre-estrazione prominente.
  - Fonti estratte raggruppate in card per pagina.
  - Switch/checkbox per includere/escludere le singole pagine estratte prima della generazione (`excludedPages` in `GenerationPanel` e `ImportScreen`).

### Fase 1: Fix Immediato di Stabilità Token & Chunk Budget (COMPLETATA)
- **Backend Chunking (`chunks.py` & `pipeline.py`):**
  - Ridotto `max_chars` predefinito da 12.000 a **8.000 caratteri** in `plan_chunks()` e `generate()`.
  - `measurement/preventivo.py`: eredita automaticamente `8000` dalla firma di `generate()`.
  - Aggiornati test e helper in `test_measurement.py` e `test_spesa_generazione.py` (73 test passati).
- **Backend Istruzioni Didattiche (`instructions.py`):**
  - Inserito vincolo esplicito di misura controllata: *"Per ogni modulo genera al massimo 4 slide essenziali, focalizzate e ben spiegate, e al massimo 4 quiz mirati."* per prevenire overflow dell'output token cap (elimina l'errore `provider_incomplete`).

### Fase 2: Schemi, Contratti e Provider Mappa Concettuale (COMPLETATA)
- **Frontend / Contratti Zod (`packages/contracts/src/concept.ts`):**
  - Definiti `ConceptNodeSchema`, `ConceptBranchSchema`, `ConceptTreeSchema`.
  - Esportati i tipi `ConceptNode`, `ConceptBranch`, `ConceptTree` e `conceptTreeJsonSchema`.
  - Riesportati da `packages/contracts/src/index.ts`.
  - Suite Vitest dedicata in `concept.test.ts` (8/8 passati).
- **Backend Pydantic & Prompt (`services/api/formazione_api/generation/concept.py`):**
  - Definiti i modelli Pydantic `ConceptNodeDraft`, `ConceptBranchDraft`, `ConceptTreeDraft` con validazione rigida (`extra='forbid'`, divieto titoli o fonti vuote).
  - Definito `ISTRUZIONI_CONCEPT_TREE` per generazione rapida focalizzata (<1.000 token di output).
- **Backend Concept Provider (`services/api/formazione_api/generation/concept_provider.py`):**
  - Definito protocollo `ConceptProvider(Protocol)` con metodo `concept_tree(chunk: Chunk) -> ConceptTreeDraft`.
  - Implementati `OpenAIConceptProvider`, `AnthropicConceptProvider`, `OpenAICompatConceptProvider`.
  - Factory `create_concept_provider()` e funzione helper `extract_concept_tree(chunk, provider=None)`.
  - Test unitari in `services/api/tests/test_concept_tree.py` (16/16 passati).

### Identificazione Semantica Capitoli e Paragrafi stile Algor (COMPLETATA)
- **Backend Docling Layout (`docling_adapter.py`):**
  - In `_blocks(document, start, end)`: rilevamento attivo di intestazioni (`DocItemLabel.TITLE` / `SECTION_HEADER`).
  - Tracciamento di `current_section` e `current_level`, propagati su tutti i blocchi del paragrafo/sezione.
  - Ciascun blocco ora include: `kind` ('section_header', 'paragraph', 'table', 'list_item'), `level` e `section`.
  - Aggiunto test `test_docling_extracts_sections_and_headings()` in `test_docling.py`.
- **Backend Native Fallback (`extractors.py`):**
  - In `native_extract`: rilevamento regex `HEADING_PATTERN` per capitoli e paragrafi numerati nel testo nativo.
- **Frontend Indice Didattico (`apps/learner`):**
  - `documents.ts`: esteso `Extraction.blocks` con `kind?: string`, `level?: number`, `section?: string`.
  - `ProposedIndexPanel.tsx`: `buildProposedSections()` raggruppa ora i blocchi **per capitolo/sezione logica continua** (anche su più pagine contigue) invece di spezzare artificialmente ogni singola pagina.
  - Aggiunto badge visivo `Capitolo` (livello 1) / `Paragrafo` (livello ≥ 2).
  - Mantenuto il fallback trasparente per pagina se il documento non ha intestazioni.
  - Test `ProposedIndexPanel.test.tsx` aggiornati e passati (11/11).

---

---

## 7. Stato Avanzamento Unificazione Multi-AI (Quizz-app + Piattaforma Formazione)
> **Data:** 18 novembre 2026  
> **Status:** Fasi 1, 2, 3, 4 e 5 del Piano di Unificazione COMPLETATE con successo e collaudate.

### Fasi Completate:
1. **Fase 1 (Asset & Guscio Mobile Universale):**
   - Importati asset grafici completi in `apps/learner/assets/` (`icon.png`, `splash-mark.png`, `genera_asset.py`).
   - Integrato il `Guscio.tsx` per la gestione unificata di `KeyboardAvoidingView` e `SafeAreaProvider` (risolve conflitti tastiera su Android 15+ edge-to-edge e iOS).
   - Componenti modulari estratti: `useIndietro.ts`, `RigheOpzione.tsx`, `stiliOpzione.ts`, `DomandaEsame.tsx`, `SezioneEsame.tsx`, `AccoppiamentoView.tsx`.
   - Moduli di stato e test: `tastiera.ts` (3/3 test passati), `risposte.ts` (3/3 test passati).

2. **Fase 2 (Refactoring Schermate Esame ed Esercizio):**
   - `ExamView.tsx` sostituito con la versione spacchettata sotto le 300 righe (299 righe).
   - `CourseScreen.tsx` sostituito con la versione modulare sotto le 300 righe (287 righe) e `CourseScreen.test.ts` (3/3 passati).
   - `App.tsx` aggiornato con il wrapping di `Guscio` e `SafeAreaProvider`, preservando i componenti di Piattaforma Formazione.
   - Test `struttura.test.ts`: 3/3 passati.

3. **Fase 3 (Supporto Tipo di Quiz `matching` & Chiusura Typecheck):**
   - **Contratti (`packages/contracts`):** aggiunto `'matching'`, `Coppia`, `MIN_COPPIE = 3`, `MAX_COPPIE = 6`, validazione biunivoca di `pairs` in `tipi.ts`, `pairs` in `structure.ts`, aggiornato `sample-course.json` (preservati `concept.ts` e `index.ts`).
   - **Stato Frontend:** `riepilogo.ts` (`CoppiaRiepilogo`), `presentazione.ts` (`coppie`, label `'Accoppia'`), `editorDomanda.ts`, `editor.ts` (`Record<TipoDomanda, ...>`), `QuizTypeBadge.tsx`.
   - **Learning Engine:** `adapter.ts`, `progress.ts` (ordine canonicalizzato preservato per matching), `grade.test.ts`.

4. **Fase 4 (Riconciliazione File Condivisi e Backend):**
   - `prezzi.json`, `openai_compat_provider.py`, `impostazioni.py` aggiornati con provider `groq` e `openrouter`.
   - `spesa_generazione.py` allineato con `VALIDATION_PROVIDER` e stima combinata.
   - `pipeline.py` aggiornato con parametro `validator=` e scarto domande, preservando il chunking a 8000 caratteri e il Concept Tree Algor.
   - `instructions.py` e `bozze.py` estesi con regole e vincoli per il tipo `matching`.
   - `DomandaEditor.tsx` aggiornato per la modifica interattiva delle coppie abbinate con accordion.
   - Allineate fixture `generated-course.json`, `invalid-course-cases.json` e snapshot modelli.

5. **Fase 5 (Design System ed Estetica Socrate Quizhand):**
   - Estratto `apps/learner/src/components/SocrateCorso.tsx` mantenendo `CourseScreen.tsx` sotto il limite di 400 righe.
   - `BarraSlideSegmentata`: avanzamento a pillole orizzontali segmentate interattive (stile Socrate `SlideViewer.jsx`).
   - `BannerTipoSlide`: distinzione visiva immediata tra teoria (azzurro con `📖`) ed esempi pratici (ambra con `💡`).
   - `RigaModulo`: lista moduli arricchita con indicatori di stato (completato `✓`, attivo, bloccato `🔒`) e indicazione esplicita della soglia percentuale di sbarramento dell'esame.
   - `App.tsx`: testata `Shell` rifinita con badge a pillola traslucida `"Studio Formazione · EdTech Civis"` e pulsanti di navigazione pill con evidenziazione attiva blu/indaco.

### Esito Collaudo Globale (TUTTO VERDE):
- **TypeScript:** `npm run typecheck` **0 ERRORI (EXIT CODE 0)** su tutto il monorepo.
- **Vitest Frontend:** **304/304 test passati (36 file)**.
- **Jest UI:** **237/237 test passati** (182 `packages/civis-ui` + 55 `apps/learner`).
- **Pytest Backend:** **560/560 test passati (0 fallimenti)**.

### Task Attuale: Rilevamento Testo Digitale PDF e Indicatore di Avanzamento
1. **Rilevamento Testo Digitale Automatico:** In `routes.py`, `documents.py` e `ReadingMethodSelector.tsx`, all'upload del PDF si verifica la presenza di testo nativo (`hasDigitalText`). Se presente, viene consigliato di default «Testo nativo» (~1-2s come Algor), evitando l'inutile e lento OCR CPU.
2. **Indicatore di Avanzamento Dinamico (`ExtractionProgressCard.tsx`):** Cronometro in tempo reale, feedback dinamico sulle fasi di estrazione (preparazione, elaborazione, strutturazione blocchi), stima dei tempi e indicatore visivo attivo durante l'elaborazione.

### Fase 3: Pipeline Tabelle Markdown e Figure Multimodali
- In `services/api/formazione_api/extractors.py` e `docling_adapter.py`:
  - Confermare che tutte le tabelle estratte da Docling esportino nativamente Markdown strutturato (`export_to_markdown`).
  - Implementare il ritaglio delle figure (`save_image_crops` da `FPDF_PAGEOBJ_IMAGE` o item `picture` > 100x100 px) in `var/api/media/<doc_id>_<page>_<fig_id>.png`.
  - Aggiungere interpretazione semantica Vision asincrona (prompt descrittivo) integrata con tag `[Figura: <descrizione>]` e `mediaRef`.

### Fase 4: Frontend Mappa Concettuale Interattiva (`apps/learner`)
- Aggiungere nella schermata di studio/anteprima un visualizzatore ad albero/grafo per il `ConceptTree` (vista Mappa Mentale/Concettuale interattiva prima delle slide lineari).
- Integrare l'anteprima delle immagini ritagliate nelle slide.
- Collegare i nodi dell'albero e le slide direttamente alle coordinate e al visualizzatore PDF.
