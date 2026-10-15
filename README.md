# Studio Formazione

Prototipo locale di una piattaforma di formazione da documenti, con interfaccia condivisa web/Android/iOS e valutazione derivata dal motore Civis. Il nome è provvisorio.

## Avvio

Richiede Node.js e Python 3.12. Dalla radice:

```powershell
npm ci
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r services/api/requirements-dev.txt
.venv/Scripts/python.exe -m uvicorn formazione_api.main:app --app-dir services/api --host 127.0.0.1 --port 8000
```

In un secondo terminale:

```powershell
npm run web
```

Aprire `http://localhost:8081`. Per Android usare `npm run android`; l'avvio iOS con simulatore richiede macOS. La compilazione del bundle iOS su Windows non produce un'app installabile. Dispositivo fisico ed emulatore richiedono un indirizzo API raggiungibile: vedere `apps/learner/.env.example` e `apps/learner/README.md`.

L'ambiente è per un solo operatore locale. Account, aziende, classi e risultati autorevoli sul server sono attività successive; i progressi del lettore sono salvati sul dispositivo.

## Percorso disponibile

- Caricare PDF, DOCX, XLSX, TXT, Markdown o CSV; per PDF scegliere tutto oppure un intervallo inclusivo di pagine originali.
- Controllare le anteprime PDF e i blocchi estratti, con riferimenti e avvisi.
- Generare una bozza con slide e quiz quando il provider AI è configurato; la mancata configurazione è esplicita.
- Revisionare la bozza, impostare esami di controllo o sbarramento e pubblicare uno snapshot locale sul server.
- Provare il corso sintetico per verificare lezioni, punteggi, tentativi e sblocco; importare un corso JSON valido per visualizzarlo.

Lettura nativa e OCR sono motori distinti. Il testo nativo non interpreta automaticamente figure o tabelle PDF. Docling richiede dipendenze e pesi locali: istruzioni, versioni e collaudo in [docs/API.md](docs/API.md). I pesi sono nella cache e non in Git.

La generazione richiede `OPENAI_API_KEY` e `OPENAI_MODEL` nel processo server. Le variabili del file `.env.example` **non sono caricate automaticamente**. Nessuna chiave va inserita in variabili `EXPO_PUBLIC_*`. Il testo selezionato viene inviato al provider quando si richiede la generazione. Non sono state eseguite chiamate AI a pagamento durante lo sviluppo iniziale.

## Verifiche

```powershell
npm test
npm run typecheck
.venv/Scripts/python.exe -m pytest -c services/api/pytest.ini services/api/tests -q
npm run export:web
```

Per il collaudo OCR esplicito, dopo il provisioning dei pesi:

```powershell
.venv/Scripts/python.exe services/api/tools/smoke_ocr.py
```

## Struttura

| Cartella | Responsabilità |
|---|---|
| `apps/learner` | Interfaccia universale, client API e persistenza locale |
| `packages/contracts` | Formato del corso e validazione di contenuti/riferimenti |
| `packages/civis-engine` | Primitive Civis originali, test originali e verifica SHA-256 |
| `packages/learning-engine` | Adattatore di valutazione e avanzamento con sbarramenti |
| `services/api/formazione_api` | Caricamento, estrazione, generazione, revisione e pubblicazione |
| `var/api` | Dati locali persistenti, esclusi da Git |
| `.cache` | Pesi, prove e artefatti locali, esclusi da Git |

## Documentazione

- [Roadmap](docs/ROADMAP.md) e [analisi Civis](docs/ANALISI_CIVIS.md).
- [API e OCR](docs/API.md), [generazione e limiti](docs/GENERAZIONE.md), [editor e pubblicazione](docs/EDITOR.md).
- [Strategia AI incrementale](docs/STRATEGIA_AI.md): misure, pianificazione globale, RAG e criteri per eventuali modelli specializzati.
- [Verifiche eseguite](docs/VERIFICHE.md) e [dipendenze installate](docs/DIPENDENZE.md).
- [Segnalazioni di sicurezza delle dipendenze](docs/SICUREZZA_DIPENDENZE.md): problemi upstream ancora aperti nella toolchain, da risolvere prima della distribuzione pubblica.
- [Decisioni della prima versione](docs/decisions/001-prima-verticale.md).

La copertura del testo elaborato non certifica correttezza o completezza didattica. La prima pipeline genera un modulo per blocco di lavoro; il piano pedagogico globale e la verifica tra capitoli sono sviluppi successivi. Le prove automatiche di generazione usano fornitori iniettati nei test, distinti dal provider reale.
