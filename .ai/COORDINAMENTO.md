# COORDINAMENTO OPERATIVO: ARCHITETTURA, ALGOR BENCHMARK & ROADMAP

> **Destinatario principale:** Claude / Team di Sviluppo  
> **Data:** 16 novembre 2026  
> **Stato:** In corso di implementazione  
> **Oggetto:** Risoluzione errore `provider_incomplete`, pipeline concettuale gerarchica (ispirata ad Algor), potenziamento estrazione per Tabelle e Immagini (Vision Multimodale).

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

## 5. Piano di Implementazione per Claude / Sviluppo

### Fase 1: Fix Immediato di Stabilità
- In `services/api/formazione_api/generation/instructions.py`:
  - Aggiungere vincoli espliciti di concisione: *"Genera al massimo 4 slide essenziali e al massimo 4 quiz per modulo"*.
- In `services/api/formazione_api/generation/chunks.py`:
  - Ridurre `max_chars` predefinito da 12.000 a 8.000 per evitare blocchi eccessivamente densi.

### Fase 2: Schemi e Contratti della Mappa Concettuale
- In `packages/contracts/src/`:
  - Definire `ConceptMapSchema` (`ConceptTree`, `ConceptBranch`, `ConceptNode` con coordinate e `sourceRefs`).
- In `services/api/formazione_api/generation/`:
  - Aggiungere `concept_provider.py` per l'estrazione dell'albero concettuale.

### Fase 3: Pipeline Tabelle e Immagini
- In `services/api/formazione_api/extractors.py` e `docling_adapter.py`:
  - Esportare tabelle in Markdown.
  - Implementare l'estrazione dei ritagli immagine (`save_image_crops`).
  - Aggiungere la pipeline asincrona di descrizione multimodale per le figure.

### Fase 4: Frontend App Learner (`apps/learner`)
- Aggiungere visualizzatore ad albero/grafo per la Mappa Concettuale.
- Integrare l'anteprima immagini ritagliate nelle slide di lezione.
- Collegare i nodi della mappa direttamente ai riferimenti del documento PDF.
