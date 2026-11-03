# Misura della generazione sul corpus

Strumento: `services/api/tools/measure_generation.py`, logica in `services/api/formazione_api/measurement/`.
Selezioni in `tests/corpus/campagna.json`, prezzi in `services/api/formazione_api/config/prezzi.json` (configurazione dell'applicazione, letta anche dall'app), uscite in `var/misure/` (fuori da Git).

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

Il preventivo scrive `var/misure/preventivo-<data>.json`. Le pagine scansionate non lette sono quelle che l'estrattore segnala negli avvisi («probabile scansione» del parser nativo, «OCR senza testo utile» di Docling; `pagine_non_lette.py`), non più una soglia di 400 caratteri ricalcolata dallo strumento: una selezione che le contiene è `RIFIUTATA dalla pipeline: unread_pages` con l'elenco delle pagine (campo `pagineNonLette`), come la rotta di generazione, e `esegui` la rifiuta prima di creare il fornitore.

La cache delle estrazioni (`var/misure/estrazioni/<selezione>-<motore>-<sha>-<versione>.json`) include la `VERSIONE` dichiarata da `extractors.py` o `docling_adapter.py`: cambiando la versione l'estrazione si ripete. I file senza versione nel nome sono di prima del 29 ottobre 2026 e non vengono più letti.

`esegui` scrive in `var/misure/corse/<id>/` la bozza (`bozza.json`, con `usage` e copertura) e la scheda `revisione.json` da compilare (`minutiRevisione`, `erroriFattuali`, `erroriDidattici`, `domandeDaRiscrivere`, `approvato`). Il registro cumulativo `var/misure/registro-spesa.json` contiene tutte le corse, **anche fallite o arrestate**, con chiamate, usage, durate, errori, costo effettivo e importo addebitato.

## Limite superiore

Per ogni blocco e ogni tentativo:

- token in ingresso ≤ byte UTF-8 di istruzioni + materiale JSON + schema dell'output, calcolati con le stesse funzioni dei fornitori (`instructions.materiale`, `type_to_text_format_param` di OpenAI, `anthropic_provider._schema`) + `sovraccaricoIngressoPerChiamata`. Un token di testo non rappresenta mai meno di un byte, quindi N byte producono al più N token;
- token in uscita ≤ `MAX_OUTPUT_TOKENS` (6000), ragionamento compreso;
- tentativi = 1 + `MAX_RETRIES`: ogni tentativo può essere fatturato.

Costo = token × tariffa d'ingresso più alta del modello (comprese le scritture in cache) + uscita × tariffa d'uscita, × `moltiplicatoreMassimo` (residenza dei dati, 1.1). Una selezione con un blocco oltre la soglia del contesto lungo viene rifiutata.

**Prezzo 0.** Per un modello a prezzo 0 dichiarato (`piano: gratuito` in `prezzi.json`, oggi Gemini) il limite in USD è 0 e completo anche con `sovraccaricoIngressoPerChiamata.token: null`: 0 per qualunque numero di token resta 0. I limiti in token restano calcolati e la guardia controlla ancora i contatori dichiarati. Vale solo se la chiave appartiene a un progetto senza fatturazione: vedi GENERAZIONE.md, «Terzo fornitore: Gemini».

**Limite incompleto.** I fornitori aggiungono token propri (marcatori di ruolo; con gli output strutturati Anthropic inietta un prompt di sistema di dimensione non pubblicata). Finché `sovraccaricoIngressoPerChiamata.token` è `null` il preventivo segna `completo = NO` e la guardia **rifiuta ogni corsa reale**. Per sbloccarla: misurare la quota con l'endpoint di conteggio token sulla richiesta reale, registrarla con la fonte.

## Misura del sovraccarico Anthropic

Strumento: `services/api/tools/misura_sovraccarico_anthropic.py`. Usa solo `messages.count_tokens`, che è gratuito («Token counting is free to use but subject to requests per minute rate limits», <https://platform.claude.com/docs/en/build-with-claude/token-counting>). Il client è avvolto in `SoloConteggio`, che non espone `create`, `parse`, `stream` né i batch. Non scrive in `prezzi.json`.

```powershell
$env:ANTHROPIC_API_KEY = "<chiave>"
.venv/Scripts/python.exe services/api/tools/misura_sovraccarico_anthropic.py
Remove-Item Env:ANTHROPIC_API_KEY
```

Cosa fa: per ogni selezione della campagna ripete verifica hash, estrazione e pianificazione del preventivo (`measure_generation.prepara`, `corsa.preventivo_selezione`, `preventivo.pianifica`) e prende tre blocchi: il più corto, il mediano e il più lungo. Aggiunge un blocco sintetico di un carattere (`sintetico-minimo`), che è il caso peggiore per una quota costante. Per ogni modello Anthropic di `prezzi.json` conta la richiesta di `anthropic_provider.richiesta()`, la stessa che invia il provider, senza `max_tokens`, che `count_tokens` non accetta e che non è un token d'ingresso. Fa al massimo una richiesta al secondo: oggi sono 45 conteggi, cioè meno di un minuto.

Cosa leggere nell'output:

- la tabella `modello / selezione / blocco / contati / maggiorante / differenza / rapporto`: `differenza = contati − maggiorante in byte`; se è negativa, il maggiorante del preventivo copre già quel blocco;
- le righe `Esclusa ...`: sono le selezioni che il preventivo non stima (OCR troncato, estrazione fallita) e che non vengono misurate;
- per ogni modello: `scarto massimo`, `margine`, `quota`;
- il giudizio: dice se il maggiorante in byte **copre già** tutti i conteggi oltre il margine (quota strettamente necessaria 0) oppure **non li copre**;
- `Valore proposto per sovraccaricoIngressoPerChiamata.token`, cioè `max(0, max(contati − maggiorante)) + margine`. Il margine è il 5% del conteggio più alto, arrotondato per eccesso, perché il conteggio è una stima («might differ by a small amount»). Il valore va registrato a mano in `prezzi.json`, citando come fonte il rapporto;
- `Rapporto: var/misure/sovraccarico-anthropic-<data>.json`, con tutte le misure, le selezioni escluse e la quota per modello.

Uscite: `0` misura completa; `1` `ANTHROPIC_API_KEY` assente (nessun client creato); `2` errore del fornitore (chiave rifiutata, permessi, fatturazione 402, limite di richieste, modello inesistente), con un messaggio leggibile e un rapporto parziale.

## Guardia

- Avvio: budget > 0, limite completo, `speso nel registro + limite superiore della corsa ≤ budget`. Il fornitore si crea solo dopo.
- Prima di ogni blocco il registro viene riletto dal disco: se `speso + limite del blocco > budget` la corsa si ferma (`esito: arrestata`).
- L'importo **addebitato** di ogni chiamata è il suo limite superiore, scritto prima della chiamata: i retry interni allo SDK non compaiono nei contatori d'uso, il limite sì. Il costo **effettivo** (token dichiarati × prezzi) è la misura; il costo per corso approvato si calcola su questo, sommando tutte le corse del gruppo selezione × modello, fallite comprese.
- Se i token dichiarati di un tentativo superano il limite per tentativo, il maggiorante è smentito: la corsa si ferma al blocco successivo.
- Modello assente da `prezzi.json`, prezzo senza fonte o valuta diversa da USD: rifiuto.
- La generazione dall'app usa la stessa guardia con un registro separato (`registro-spesa-app.json` nella cartella dei dati) e due limiti del processo server, `GENERATION_MAX_USD_PER_COURSE` (0.50) e `GENERATION_BUDGET_USD` (5.00): vedi [GENERAZIONE.md](GENERAZIONE.md), «Tetto di spesa della generazione dall'app». Il preventivo mostrato nel pannello è `preventivo_corsa` di questa pagina. Solo il registro dell'app sostituisce, dopo ogni chiamata completata con i contatori, il prenotato con un importo regolato (GENERAZIONE.md, «Importo regolato»); il registro delle misure resta prudente e somma sempre `addebitatoUSD`. Dal 3 novembre 2026 i fornitori dichiarano anche i tentativi ripetuti dallo SDK (`usage.retriesTaken`), usati solo dalla regolazione dell'app.

## Fonti dei prezzi

USD per milione di token, tariffa standard, letti il 2026-10-19:

- Anthropic: <https://platform.claude.com/docs/en/about-claude/pricing.md> (claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5);
- OpenAI: <https://developers.openai.com/api/docs/pricing> (gpt-6-astra, gpt-6.1-sol, gpt-5.4-mini, gpt-6-luna);
- Gemini, letto il 2026-10-30: <https://ai.google.dev/gemini-api/docs/pricing> (gemini-3.8-flash, gemini-3.5-flash-lite, gemini-2.5-pro), piano gratuito a prezzo 0; prezzo a pagamento in `prezzoAPagamento`, non usato dal tetto.

Prima di una corsa reale, rileggere la fonte e aggiornare valori e data.

## OCR delle scansioni (30 ottobre 2026)

Preventivo dopo la correzione dell'OCR (`docling_adapter.py`, `OcrMode.FULL_PAGE`), rapporto `var/misure/preventivo-2026-10-30T091056+0000.json`:

- `01-ocr-p94-143`: 134.618 caratteri (prima circa 2.800, la sola filigrana GURITEL), 12 blocchi; limite superiore da 0,15 USD (gpt-6-luna) a 14,53 USD (gpt-6-astra), Anthropic completo.
- `02-ocr-tutto`: 203.525 caratteri, **rifiutata** (`unread_pages`): le pagine 2, 47 e 48 sono scansioni bianche (la 48 ha solo «PREZZO L. 300») e l'OCR non vi legge testo utile. Il controllo non distingue una pagina bianca da un OCR fallito: per misurare 02 serve una selezione 3-46.

Dettagli, tempi e confronti a vista in [VERIFICHE.md](VERIFICHE.md).

## Selezioni non stimate (2026-10-19)

- `01-ocr-p94-143`, `02-ocr-tutto` (risolto: vedi «OCR delle scansioni»): Docling gira in locale (campione di 5 pagine di 02: 134 s), ma `docling_adapter.py` imposta `document_timeout=120`; oltre quel tempo Docling restituisce un'estrazione parziale **senza errore** (13 pagine su 50, 0 su 48). Il preventivo segna «estrazione OCR incompleta» e la guardia rifiuta la corsa reale.
- `07-tavole`: `native_extract` fallisce su `C08_Tavole.xlsx` (`AttributeError: 'EmptyCell' object has no attribute 'coordinate'`, modalità `read_only` di openpyxl); la rotta di estrazione risponderebbe 422. Il 29 ottobre 2026 la selezione è stata tolta: i fogli di calcolo non sono più una fonte (decisione 004).
