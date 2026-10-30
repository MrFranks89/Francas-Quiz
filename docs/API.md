# API documenti locale

Servizio FastAPI modulare in `services/api`. È un prototipo locale per un solo operatore: non espone autenticazione, aziende o isolamento multiutente. Avviarlo su `127.0.0.1`.

## Installazione riproducibile

Dalla radice del repository, con Python 3.12:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r services/api/requirements-dev.txt
.venv/Scripts/python.exe -m uvicorn formazione_api.main:app --app-dir services/api --host 127.0.0.1 --port 8000
```

Per il solo servizio basta `requirements.txt`. Le versioni dirette sono fissate; non è ancora presente un lock completo delle dipendenze transitive. L'ambiente di sviluppo iniziale eredita alcuni pacchetti dal runtime Codex, mentre i comandi sopra creano un ambiente isolato. Le dipendenze usate da servizio e test sono elencate esplicitamente.

Test del percorso HTTP reale:

```powershell
.venv/Scripts/python.exe -m pytest -c services/api/pytest.ini services/api/tests -q
```

`FORMAZIONE_DATA_DIR` configura la cartella persistente; default `var/api` nella radice. Documenti originali, metadati ed estrazioni rimangono su disco e non scadono automaticamente. Non inserire dati sensibili in un'istanza condivisa. `FORMAZIONE_CORS_ORIGINS` è una lista separata da virgole; default localhost e 127.0.0.1 sulle porte 8081 e 8082.

## Contratto HTTP

- `GET /health`: stato e `mode: local-single-operator`.
- `POST /documents`: multipart campo `file`, massimo 25 MiB; PDF, DOCX, TXT o MD UTF-8. Restituisce 201 `{id,name,kind,pageCount}`. Per i formati senza paginazione stabile `pageCount` è null. I fogli di calcolo sono rifiutati con 422 e il messaggio `Formato non supportato: i fogli di calcolo (XLSX, CSV) non sono ammessi come fonte.`: per estensione (`.xlsx`, `.csv`) e, qualunque sia l'estensione, per contenuto (un archivio con `xl/workbook.xml`). Un CSV rinominato in `.txt` è testo e non si distingue. Decisione in `docs/decisions/004-niente-fogli-di-calcolo.md`.
- `GET /documents/{id}/pages/{page}/preview`: PNG PDF, dimensione massima lato 1400px, header `X-Original-Page`. Numerazione da 1.
- `POST /documents/{id}/extract`: JSON sotto; restituisce 201 `{id,documentId,selection,pageCount,blocks,warnings,status,engine}`. Un documento XLSX o CSV salvato prima del 29 ottobre 2026 non si riapre: 422 con lo stesso messaggio del caricamento.
- `GET /extractions/{id}`: risultato persistente, anche dopo riavvio.

```json
{"selection":{"mode":"range","fromPage":201,"toPage":300},"engine":"native"}
```

Oppure `selection: {"mode":"all"}`. Gli estremi sono interi JSON rigorosi, inclusivi e riferiti alle pagine fisiche PDF originali; stringhe, booleani, decimali e intervalli fuori limite vengono rifiutati. Il range non è disponibile per DOCX/testo: usare tutto il documento. La numerazione stampata nel manuale può differire dalle pagine PDF.

Ogni blocco contiene `{id,text,page,label}`; `page` è null per formati non paginati. `status: needs_review` segnala contenuti o accuratezza da verificare. Non equivale a un corso pronto alla pubblicazione. Le pagine bianche/scansioni non diventano contenuto inventato. Il parser nativo PDF non interpreta figure, OCR o struttura delle tabelle. DOCX conserva l'ordine di paragrafi e tabelle. Le pagine PDF con meno di 400 caratteri nativi, **anche nessuno**, e immagini leggibili che coprono almeno il 5% della pagina ricevono l'avviso `Pagina N: probabile scansione: richiede OCR.` (criterio e misure in `extractors.py`). Fino al 30 ottobre 2026 la pagina senza nessun testo nativo riceveva solo l'avviso generico, che non blocca: in un PDF misto la scansione senza intestazione usciva dal corso in silenzio. La pagina senza testo e senza immagini da testo (vuota per costruzione, o con sola grafica vettoriale) riceve `Pagina N priva di testo estraibile: richiede OCR o revisione.`, che non blocca: non c'è una scansione da leggere. Queste pagine bloccano la generazione finché non sono lette con l'OCR o escluse dalla selezione (vedi la generazione, sotto). Fa eccezione la **scansione bianca**: se la pagina renderizzata come l'anteprima, senza il testo nativo e senza il 10% di margine per lato (bordi e ombre della scansione), ha meno dello 0,06% di pixel scuri (`SOGLIA_PAGINA_BIANCA` in `extractors.py`, misure in [VERIFICHE.md](VERIFICHE.md)), riceve invece l'avviso `Pagina N: pagina bianca, ignorata.`, che non blocca. Un PDF interamente scansionato come 02-dpr-547-1955, estratto col motore nativo, blocca quindi su tutte le pagine con contenuto e va estratto con l'OCR.

Errori: 404 risorsa inesistente, 413 upload troppo grande, 422 documento/selezione non validi, 503 motore opzionale non configurato. I file Office sono verificati come archivi reali, con limite complessivo di decompressione 100 MiB e 10.000 elementi. Questi limiti non sostituiscono isolamento di processo e quote per un servizio pubblico.

## Docling opzionale

```powershell
.venv/Scripts/python.exe -m pip install -r services/api/requirements-ocr.txt
```

L'adapter supporta PDF e usa Docling 2.138.0, `PdfPipelineOptions.artifacts_path`, OCR RapidOCR e `DocumentConverter.convert(page_range=(inizio,fine))`. Le firme sono state lette nei sorgenti del pacchetto installato. I pesi devono essere scaricati **in una fase di provisioning separata** e la loro directory assegnata a `DOCLING_ARTIFACTS_PATH`. Consultare `docling-tools models download --help` nella versione installata per il download dei modelli layout, tabelle e RapidOCR. L'API non scarica modelli durante una richiesta e non ripiega silenziosamente sul parser nativo.

Provisioning eseguito il 15 ottobre 2026 con questo comando (circa 733 MB di artefatti, cache aggiuntiva esclusa):

```powershell
$env:HF_HOME = "$PWD/.cache/huggingface"
.venv/Scripts/docling-tools.exe models download layout tableformer rapidocr --rapidocr-backend-lang onnxruntime:it -o .cache/docling
$env:DOCLING_ARTIFACTS_PATH = "$PWD/.cache/docling"
```

L'adapter seleziona `RapidOcrOptions(lang=['iso:it'], mode=OcrMode.FULL_PAGE)`, coerente con i pesi scaricati. **OCR a pagina intera** (dal 29 ottobre 2026): con la modalità predefinita di Docling 2.138 (`PDF_AWARE_LAYOUT_REGIONS`) le celle OCR che intersecano una cella di testo nativo vengono scartate (`BaseOcrModel.post_process_cells`, priorità `PDF_FIRST`); la filigrana diagonale GURITEL di 01 copre tutta la pagina e l'OCR consegnava solo lei, 50 pagine «complete» su 50 con circa 2.800 caratteri. `FULL_PAGE` ignora il testo nativo della pagina e usa solo l'OCR: per le pagine native va usato il motore nativo. Dopo l'OCR, sulle pagine che sono immagini (stesso criterio di «probabile scansione», anche senza testo nativo) l'adapter conta i caratteri letti che non compaiono nel testo nativo (`caratteri_utili`): sotto la soglia la pagina riceve l'avviso `Pagina N: OCR senza testo utile: la scansione non è stata letta.`, che blocca la generazione come una scansione non letta. La soglia è `SOGLIA_CARATTERI_UTILI` (50) per le pagine piene e scende in proporzione all'inchiostro della pagina fino a 5 caratteri (`caratteri_richiesti`): una riga isolata letta per intero, come «PREZZO L. 300» in 02 p. 48, non è un fallimento. Le scansioni bianche (stesso criterio del parser nativo) ricevono `Pagina N: pagina bianca, ignorata.` e non bloccano, senza l'avviso generico `priva di testo estratto` (dal 30 ottobre 2026: prima lo ricevevano entrambi). Si blocca solo quando c'è contenuto visibile che l'OCR non ha letto. Misure in [VERIFICHE.md](VERIFICHE.md). ONNX Runtime è una dipendenza OCR esplicita: il pacchetto Docling da solo non la installa. Versioni, revisioni e SHA-256 degli artefatti sono registrati in `services/api/docling-models.json`; i binari non sono versionati. Il comando CLI usa revisioni upstream correnti: per riprodurre gli stessi pesi confrontare il manifest, poiché `main` può cambiare.

Fonti e licenze lette negli artefatti originali: [layout Heron](https://huggingface.co/docling-project/docling-layout-heron) revisione `8f39ad3c0b4c58e9c2d2c84a38465abf757272d8` e [variante ONNX](https://huggingface.co/docling-project/docling-layout-heron-onnx) revisione `40bde044036bb181c130ddf6c51792187268748f`, Apache-2.0; [TableFormer/Docling Models](https://huggingface.co/docling-project/docling-models) revisione `fc0f2d45e2218ea24bce5045f58a389aed16dc23`, CDLA-Permissive-2.0. RapidOCR 3.10.0 e i tre modelli PaddleOCR usati (PP-OCRv6 detection/recognition small, classificatore v2) sono dichiarati Apache-2.0 nel [MODEL_LICENSES.md upstream](https://github.com/RapidAI/RapidOCR/blob/main/MODEL_LICENSES.md) e nell'omonimo notice del pacchetto installato. I loro SHA-256 sono nel manifest. Conservare licenze e attribuzioni se si ridistribuiscono i pesi.

Collaudo OCR reale esplicito, escluso dalla suite ordinaria:

```powershell
.venv/Scripts/python.exe services/api/tools/smoke_ocr.py
```

Il comando crea un PDF immagine con testo e tabella, conferma assenza di testo nativo, attraversa upload/estrazione HTTP e controlla alcune parole e la pagina originale. Imposta modalità Hugging Face offline, salva evidenze in `.cache/ocr-smoke`. È un controllo di integrazione su un esempio sintetico, non una misura di accuratezza su manuali reali.

Eseguito con esito positivo il 15 ottobre 2026: 3 blocchi, inclusa 1 tabella Markdown; riconosciute le parole di controllo `manuale`, `Rossi`, `Bianchi`, tutte con provenienza pagina 1. Nessuna chiamata di download durante il collaudo (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`). Stato mantenuto `needs_review` per richiedere verifica umana. Il primo tentativo aveva scoperto ONNX Runtime mancante: ora è incluso nei requisiti OCR e `pip check` non segnala incompatibilità.

Usare `engine: "docling"` nella richiesta. Mancanza di configurazione o dipendenze produce 503. Un OCR che non elabora tutte le pagine selezionate produce 503 con `detail` testuale «OCR incompleto: elaborate N di M pagine (stato Docling: …); pagine mancanti: …», senza salvare un'estrazione parziale: in Docling 2.138, scaduto `document_timeout`, `convert()` non solleva e restituisce `status: partial_success` con le sole pagine completate, e l'adapter controlla sia lo stato sia le pagine presenti. Il limite di tempo è di 60 s per pagina selezionata, con minimo 120 s (misura: circa 27 s per pagina su CPU). L'estrazione resta una richiesta sincrona: 50 pagine possono richiedere oltre 20 minuti. Figure e pagine prive di testo sono segnalate; OCR e tabelle richiedono revisione. I test dell'adapter con convertitore iniettato verificano instradamento HTTP, numerazione e selezione, **non certificano accuratezza OCR reale**. L'installazione del pacchetto non equivale al provisioning dei pesi né a un collaudo di scansioni reali.

## Generazione di bozze

`GET /generation/config` espone esclusivamente stato configurazione e nomi delle variabili mancanti, mai chiavi. `POST /extractions/{id}/generate` riceve `{ "title": "Titolo", "acknowledgeWarnings": true }` e crea una bozza persistente; `GET /drafts/{id}` la recupera. La risposta include `id`, `status: draft`, `course`, `coverage`, `warnings`. Le estrazioni `needs_review` richiedono presa visione esplicita. Un'estrazione con pagine scansionate non lette (avvisi «probabile scansione» del parser nativo o «OCR senza testo utile» di Docling) è rifiutata anche con la presa visione: 422 `{code: "unread_pages", message, pages}`, con l'invito a estrarre di nuovo con l'OCR o a selezionare un intervallo che escluda quelle pagine. Non c'è un'opzione per escluderle e procedere: l'esclusione si dichiara con la selezione, mai in silenzio (`pagine_non_lette.py`). L'avviso «pagina bianca, ignorata» non blocca né la generazione né lo strumento di misura, dove la pagina bianca senza blocchi non conta come OCR troncato (`measurement/corsa.py`). Le estrazioni salvate prima del 30 ottobre 2026 conservano gli avvisi di allora: per sbloccare un documento con pagine bianche va estratto di nuovo. I limiti di chunk e chiamate sono definiti sul server, non controllabili dal payload del browser. Errori generazione hanno `detail: {code,message}`: 503 configurazione assente, 422 materiale/revisione/budget, 502 errore del fornitore o contenuto generato non valido.

Il server richiede `OPENAI_API_KEY` e `OPENAI_MODEL`; l'integrazione usa il provider reale quando configurato. Non esiste un provider finto di ripiego. I test HTTP iniettano deliberatamente un provider locale nell'applicazione per verificare creazione e recupero della bozza senza chiamate a pagamento. Vedere anche `docs/GENERAZIONE.md` per tracciamento, limiti e configurazione.

## Passi successivi

Job asincroni con cancellazione, quote CPU/memoria, timeout e limiti di pagine; autenticazione e storage per organizzazione; immagini/tabelle con coordinate; revisione e copertura dei contenuti; generazione didattica con citazioni. Il servizio nativo attuale esegue l'estrazione in una richiesta sincrona.
