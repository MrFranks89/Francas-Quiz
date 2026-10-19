# Misura della generazione sul corpus

Strumento: `services/api/tools/measure_generation.py`, logica in `services/api/formazione_api/measurement/`.
Selezioni in `tests/corpus/campagna.json`, prezzi in `tests/corpus/prezzi.json`, uscite in `var/misure/` (fuori da Git).

## Comandi

```powershell
# Preventivo (predefinito): nessuna chiamata a fornitori, nessuna chiave.
.venv/Scripts/python.exe services/api/tools/measure_generation.py
.venv/Scripts/python.exe services/api/tools/measure_generation.py preventivo --selezione 03-accordo-p50-96

# Corsa reale: solo con budget esplicito; passa da generation.generate() e selection.create_provider().
.venv/Scripts/python.exe services/api/tools/measure_generation.py esegui --budget-usd 5 --provider anthropic --model claude-haiku-5-5 --selezione 04-tutto

# Costo per corso approvato, dal registro e dalle schede di revisione.
.venv/Scripts/python.exe services/api/tools/measure_generation.py riepilogo
```

Ogni selezione: verifica sha256 rispetto a `manifest.json` (per lo ZIP 07: archivio, poi file estratto confrontato con il membro dell'archivio), estrazione con l'estrattore del prodotto (`native_extract` o `docling_extract`, risultato in cache in `var/misure/estrazioni/`), piano dei blocchi con `plan_chunks` e gli stessi limiti predefiniti di `generate()`.

Il preventivo scrive `var/misure/preventivo-<data>.json` e, per i PDF nativi, elenca le pagine con meno di 400 caratteri di testo come «probabile scansione»: `extractors.py` segnala solo le pagine vuote (difetto noto, da correggere a parte).

`esegui` scrive in `var/misure/corse/<id>/` la bozza (`bozza.json`, con `usage` e copertura) e la scheda `revisione.json` da compilare (`minutiRevisione`, `erroriFattuali`, `erroriDidattici`, `domandeDaRiscrivere`, `approvato`). Il registro cumulativo `var/misure/registro-spesa.json` contiene tutte le corse, **anche fallite o arrestate**, con chiamate, usage, durate, errori, costo effettivo e importo addebitato.

## Limite superiore

Per ogni blocco e ogni tentativo:

- token in ingresso ≤ byte UTF-8 di istruzioni + materiale JSON + schema dell'output, calcolati con le stesse funzioni dei fornitori (`instructions.materiale`, `type_to_text_format_param` di OpenAI, `anthropic_provider._schema`) + `sovraccaricoIngressoPerChiamata`. Un token di testo non rappresenta mai meno di un byte, quindi N byte producono al più N token;
- token in uscita ≤ `MAX_OUTPUT_TOKENS` (6000), ragionamento compreso;
- tentativi = 1 + `MAX_RETRIES`: ogni tentativo può essere fatturato.

Costo = token × tariffa d'ingresso più alta del modello (comprese le scritture in cache) + uscita × tariffa d'uscita, × `moltiplicatoreMassimo` (residenza dei dati, 1.1). Una selezione con un blocco oltre la soglia del contesto lungo viene rifiutata.

**Limite incompleto.** I fornitori aggiungono token propri (marcatori di ruolo; con gli output strutturati Anthropic inietta un prompt di sistema di dimensione non pubblicata). Finché `sovraccaricoIngressoPerChiamata.token` è `null` il preventivo segna `completo = NO` e la guardia **rifiuta ogni corsa reale**. Per sbloccarla: misurare la quota con l'endpoint di conteggio token sulla richiesta reale, registrarla con la fonte.

## Guardia

- Avvio: budget > 0, limite completo, `speso nel registro + limite superiore della corsa ≤ budget`. Il fornitore si crea solo dopo.
- Prima di ogni blocco il registro viene riletto dal disco: se `speso + limite del blocco > budget` la corsa si ferma (`esito: arrestata`).
- L'importo **addebitato** di ogni chiamata è il suo limite superiore, scritto prima della chiamata: i retry interni allo SDK non compaiono nei contatori d'uso, il limite sì. Il costo **effettivo** (token dichiarati × prezzi) è la misura; il costo per corso approvato si calcola su questo, sommando tutte le corse del gruppo selezione × modello, fallite comprese.
- Se i token dichiarati di un tentativo superano il limite per tentativo, il maggiorante è smentito: la corsa si ferma al blocco successivo.
- Modello assente da `prezzi.json`, prezzo senza fonte o valuta diversa da USD: rifiuto.

## Fonti dei prezzi

USD per milione di token, tariffa standard, letti il 2026-10-19:

- Anthropic: <https://platform.claude.com/docs/en/about-claude/pricing.md> (claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5);
- OpenAI: <https://developers.openai.com/api/docs/pricing> (gpt-6-astra, gpt-6.1-sol, gpt-5.4-mini, gpt-6-luna).

Prima di una corsa reale, rileggere la fonte e aggiornare valori e data.

## Selezioni non stimate (2026-10-19)

- `01-ocr-p94-143`, `02-ocr-tutto`: Docling gira in locale (campione di 5 pagine di 02: 134 s), ma `docling_adapter.py` imposta `document_timeout=120`; oltre quel tempo Docling restituisce un'estrazione parziale **senza errore** (13 pagine su 50, 0 su 48). Il preventivo segna «estrazione OCR incompleta» e la guardia rifiuta la corsa reale.
- `07-tavole`: `native_extract` fallisce su `C08_Tavole.xlsx` (`AttributeError: 'EmptyCell' object has no attribute 'coordinate'`, modalità `read_only` di openpyxl); la rotta di estrazione risponderebbe 422.
