# Dipendenze installate e provenienza

Rilevazione del 15 ottobre 2026. Versioni e licenze seguenti sono state lette nei `package.json` effettivamente installati e nei metadati/licenze delle distribuzioni Python, non dedotte dai nomi. È lo stack selezionato per il prototipo, non l'installazione di tutti i progetti valutati.

| Componente diretto | Versione installata | Licenza dichiarata |
|---|---|---|
| Expo | 57.0.29 | MIT |
| React / React DOM | 19.2.3 | MIT |
| React Native | 0.86.3 | MIT |
| React Native Web | 0.21.4 | MIT |
| Expo Document Picker / File System / Status Bar | 57.0.3 / 57.0.7 / 57.0.1 | MIT |
| AsyncStorage | 2.2.0 | MIT |
| Zod | 4.6.7 | MIT |
| TypeScript / Vitest | 7.0.2 / 5.0.4 | Apache-2.0 / MIT |
| Tipi Node / React | 26.6.5 / 19.2.18 | MIT |
| FastAPI / Pydantic | 0.143.0 / 2.13.5 | MIT |
| Uvicorn | 0.54.0 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| pypdf | 6.10.0 | BSD-3-Clause |
| python-docx / openpyxl | 1.2.0 / 3.1.5 | MIT |
| pypdfium2 | 5.14.0 | BSD-3-Clause, Apache-2.0 e licenze delle dipendenze incluse |
| Pillow | 12.3.0 | MIT-CMU |
| OpenAI SDK Python | 3.31.0 | Apache-2.0 |
| Docling / ONNX Runtime | 2.138.0 / 1.31.0 | MIT |
| pytest / HTTPX | 9.1.1 / 0.28.1 | MIT / BSD-3-Clause |
| ReportLab, usato nei test | 4.4.9 | BSD a 3 clausole, testo letto nel file LICENSE installato |

I requisiti diretti Python sono in `services/api/requirements.txt`, `requirements-dev.txt` e `requirements-ocr.txt`. `package-lock.json` registra l'albero npm risolto; le dipendenze Python transitive non hanno ancora un lock completo. L'ambiente iniziale eredita pacchetti dal runtime Codex; [API.md](API.md) descrive creazione di un ambiente Python isolato. La tabella non sostituisce l'inventario delle licenze transitive o dei binari inclusi, in particolare PDFium.

Il motore in `packages/civis-engine` deriva dal codice Civis di Federico. La disponibilità del codice nel workspace **non costituisce una licenza open source**. Origine, commit e hash sono nel manifest del pacchetto; le librerie esterne conservano le rispettive licenze.

Per OCR sono installati anche RapidOCR 3.10.0, Apache-2.0, e i modelli locali: layout Heron e variante ONNX, Apache-2.0; TableFormer, CDLA-Permissive-2.0; modelli PaddleOCR distribuiti da RapidOCR, Apache-2.0 secondo il notice del pacchetto. Fonti, revisioni e attribuzioni sono in [API.md](API.md); hash e dimensioni in `services/api/docling-models.json`. I pesi risiedono in `.cache/docling`, esclusi da Git. L'API usa artefatti già presenti e non li scarica durante le richieste.

Moodle, H5P, Adapt, eXeLearning e olmOCR sono stati valutati nella roadmap: **non risultano installati come componenti della piattaforma**. Non sono state importate intere piattaforme LMS. L'uso dell'SDK OpenAI non configura automaticamente un servizio AI: chiave e modello rimangono variabili del server.
