# Decisione 007 — Importazione audio con trascrizione automatica

- **Data:** 18 novembre 2026
- **Stato:** Ratificata dal Committente (PROPOSTA-04)
- **Destinatari:** Studio Formazione (tutti i componenti)

---

## 1. Contesto e motivazione

Per consentire l'utilizzo di lezioni registrate, appunti vocali e riunioni formative come fonti di apprendimento, la piattaforma supporta l'importazione di file audio per la generazione automatica di concetti, corsi e quiz.

## 2. Decisioni architetturali

1. **Motore di trascrizione:**
   - Si adotta **Groq Whisper** (`whisper-large-v3-turbo` come predefinito, compatibile con `whisper-large-v3`) sfruttando il free tier (20 richieste/minuto, 7.200 s/ora, 28.800 s/giorno, file ≤ 25 MB).
   - In caso di fatturazione attiva, la tariffa è di 0,04 $/ora per turbo e 0,111 $/ora per v3 standard.
   - **`whisper-1` di OpenAI è escluso** in quanto deprecato ed escluso dal listino a lungo termine (ritiro ufficiale fissato per il 26 febbraio 2027).

2. **Formati supportati e magic bytes:**
   - Formati accettati: MP3, M4A, WAV, OGG, WEBM, MP4, FLAC.
   - La validazione avviene rigorosamente tramite **magic bytes** all'ispezione del documento.
   - Il formato video **MP4 è accettato di proposito**: Whisper estrae e trascrive la prima traccia audio presente nel container.

3. **Partizionamento in blocchi didattici:**
   - La traccia vocale viene suddivisa in blocchi di testo da circa **120 secondi** (~2 minuti), rispettando i confini naturali dei segmenti restituiti da Whisper con granularità temporale.
   - Ogni blocco riporta l'intervallo temporale nel campo `label` nella forma `mm:ss–mm:ss` (es. `00:00–02:00`).

4. **Accuratezza e revisione:**
   - La trascrizione produce sempre uno stato `status: 'needs_review'`.
   - La revisione umana è obbligatoria prima della generazione del corso: termini tecnici, numeri e nomi propri possono contenere imprecisioni tipiche dell'ASR.

5. **Limiti operativi e guardia di spesa:**
   - Dimensione massima file: **25 MB** (coerente con il limite di upload della piattaforma e delle API Groq).
   - Durata massima consentita: **2 ore** (7.200 secondi), corrispondente alla soglia oraria del free tier. File oltre tale limite vengono respinti con l'indicazione di suddividerli.
   - La spesa per la trascrizione è controllata preventivamente da `trascrivi_con_tetto` nel registro di spesa dell'applicazione (`registro-spesa-app.json`).

6. **Interfaccia mobile e web:**
   - Integrazione tramite `AudioPicker`: su mobile registrazione diretta da microfono (`expo-audio`) con arresto automatico precauzionale a 55 minuti e selezione file; su web selezione file con i tipi MIME consentiti.
