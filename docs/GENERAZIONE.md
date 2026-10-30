# Generazione di bozze da fonti selezionate

La risposta include `usage` con `provider`, `model`, `callCount`, `durationMs`, `inputTokens`, `outputTokens`, `cachedInputTokens` e lista `calls` per chunk. Il provider può esporre metadati separati dal risultato `ModuleDraft` tramite attributi opzionali `provider_name`, `model` e `last_usage` (dizionario aggiornato a ogni chiamata). Assenza di un contatore significa `null`; un totale è disponibile solo quando tutte le chiamate lo forniscono. La durata è misurata dal server attorno alla chiamata e validazione. I nomi originali `input_tokens`, `output_tokens`, `input_tokens_details.cached_tokens` sono stati letti dai modelli ResponseUsage dello SDK OpenAI 3.31.0 installato. Non si registrano testi o chiavi, non si calcola un prezzo. I contatori coprono le risposte delle chiamate completate e restituite dalla pipeline: non sono una fattura né un registro di tentativi falliti/retry interni al provider. La fixture Course resta identica perché queste misure stanno fuori dal corso.

`formazione_api.generation.generate(extraction, provider=None, title=..., max_chars=12000, max_chunks=40, acknowledge_warnings=False)` riceve l'estrazione salvata e restituisce `{status: 'draft', course, usage, coverage, scarti, warnings}` (`scarti`: vedi «Domande scartate» sotto). Il corso segue Course v1 di `packages/contracts`; la fixture `services/api/tests/fixtures/generated-course.json` viene rigenerata e confrontata dal test Python (ignorando soltanto UUID del corso) e verificata dal normale test TypeScript con CourseSchema.

Un'estrazione `needs_review` richiede esplicitamente `acknowledge_warnings=True` dopo revisione delle fonti nell'interfaccia. Il suo stato non viene alterato e gli avvisi rimangono nel risultato. Testo vuoto e altri stati restano bloccanti anche con conferma.

La prima versione crea un modulo per blocco di lavoro. Il piano è una partizione deterministica per paragrafi, con divisione di paragrafi troppo lunghi; tutti i caratteri, inclusi spazi e fine riga, rimangono nei pezzi ordinati con offset originali. Un blocco di lavoro può contenere più fonti. Questa soluzione mantiene la tracciabilità, ma non sostituisce un piano pedagogico globale né risolve riferimenti fra capitoli lontani: il miglioramento successivo sarà una pianificazione gerarchica con revisione trasversale.

Il budget è verificato prima della prima chiamata: oltre 40 blocchi da 12.000 caratteri si rifiuta la generazione senza troncare. Il numero di blocchi non è un preventivo: il costo massimo in denaro e i limiti di spesa sono nella sezione «Tetto di spesa della generazione dall'app» sotto. Ogni blocco richiede una chiamata con limite 6.000 token in uscita, timeout 90 secondi, un retry. Una generazione fallita dopo alcune chiamate non restituisce un corso parziale, ma le chiamate già eseguite possono avere un costo.

Le fonti del corso sono costruite dal server direttamente dal testo originale; il modello non può riscriverne excerpt, ID o numero pagina. Ogni riferimento generato deve appartenere al blocco fornito. La copertura registra pezzi elaborati e caratteri, **non certifica che ogni concetto sia stato spiegato né che il contenuto AI sia corretto**. Il risultato rimane bozza da revisionare; gli esami iniziali sono di esercitazione, senza sbarramenti automatici.

Ogni esame generato ha come soglia predefinita il 60% delle risposte: `passingScore` resta un numero di risposte corrette, pari a ⌈60%·n⌉ calcolato in interi (7 domande → 5, 5 domande → 3). La soglia si può cambiare in revisione, ma non sotto questo minimo: il 60% è anche la soglia minima ammessa dal contratto (`sogliaMinima` in `packages/contracts/src/soglia.ts`, `soglia_minima` in `generation/models.py`, entrambi dalla stessa fonte). Il valore del 60% e la scala dei giudizi vivono in `packages/contracts/fixtures/grading-scale.json`, letto dal motore TypeScript (`valutaTentativo` in `packages/learning-engine/src/grade.ts`); la costante Python `SOGLIA_SUPERAMENTO_PERCENTO` della pipeline è confrontata con quel file da `services/api/tests/test_grading_scale.py`. Scala, soglie incluse: sotto 60% non superato, da 60% discreto, da 70% buono, da 80% distinto, da 90% ottimo, 100% perfetto. Il superamento segue sempre la soglia dell'esame: se è più alta del 60% e non è raggiunta, il risultato è «non superato» anche quando la scala darebbe un giudizio. Dopo ogni tentativo il lettore mostra percentuale (troncata) e giudizio, es. «71% · Buono»; lo sblocco degli esami a sbarramento usa la stessa decisione.

Il provider reale richiede `OPENAI_API_KEY` e `OPENAI_MODEL` nel processo server (sezione «Configurazione» sotto). Nessun modello è scelto implicitamente, nessun segreto è incluso nel client. `.env.example` documenta le variabili ma non viene letto: il server legge `services/api/.env`. `config_status()` indica le variabili mancanti senza mostrare valori. Non sono state eseguite chiamate AI a pagamento durante l'implementazione.

Il provider usa `client.responses.parse(text_format=ModuleDraft, store=False, truncation='disabled')`, verificato sullo SDK Python OpenAI 3.31.0 e sulla [documentazione ufficiale Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Rifiuti, risposte incomplete, vuote e guasti del provider sono errori distinti. `store=False` non equivale a una garanzia contrattuale di assenza di conservazione; i documenti sono inviati al provider configurato quando si richiede la generazione.

Il provider è iniettabile per test deterministici. I test percorrono l'intera pipeline, verificano 100 pagine con numeri 201–300, blocchi molto lunghi, nessuna perdita di testo, budget, fonti inventate, risposta corretta impossibile, campi aggiunti, rifiuto, risposta incompleta e configurazione assente. La pipeline da sola non è una funzionalità visibile: deve essere invocata dalla route API e questa dal pulsante dell'app; tale collegamento va verificato separatamente.

## Configurazione

Fornitore, chiavi, modello e limiti di spesa sono variabili del processo server. Arrivano da tre fonti:

1. **Schermata Impostazioni dell'app** (`GET/PUT /settings`, contratto in [API.md](API.md), «Impostazioni»): fornitore, modello dall'elenco con i prezzi, chiave mascherata. Salva in `services/api/.env` e applica subito al processo, senza riavvio: `GET /generation/config` e il preventivo leggono l'ambiente a ogni richiesta, e il pannello di generazione rilegge entrambi dopo il salvataggio. Solo da `127.0.0.1`/`::1`.
2. **File `services/api/.env`**, letto all'avvio da `create_app` (`ambiente.py`). Parser minimo nostro: righe `NOME=valore`, commenti `#` a inizio riga, righe vuote, virgolette semplici o doppie attorno al valore; un `#` dentro il valore fa parte del valore; le righe non valide sono ignorate e segnalate nel log con il solo numero di riga. Nomi in `.env.example`. Il file è escluso da Git (`.env` in `.gitignore`, verificato da `test_ambiente.py` anche per il temporaneo della scrittura atomica). Percorso alternativo: `FORMAZIONE_ENV_FILE`; i test puntano a un file inesistente (`services/api/tests/conftest.py`) e non leggono mai il file vero.
3. **Terminale**, prima di avviare il server. Una variabile già presente nel processo **non** è sovrascritta dal file: chi la imposta nel terminale ha la precedenza all'avvio. Un salvataggio dalla schermata cambia invece subito il processo, ma al riavvio successivo vincerebbe di nuovo il terminale.

`Avvia Studio Formazione.bat` non contiene chiavi né variabili: avvia API e app, e la configurazione arriva da `services/api/.env`.

Modelli ammessi dalla schermata: solo quelli con un prezzo valido in `tests/corpus/prezzi.json`, perché un modello senza prezzo non può avere un costo massimo e la generazione verrebbe rifiutata. Per OpenAI la quota per chiamata non è misurata (`sovraccaricoIngressoPerChiamata.token: null`): la configurazione si salva, ma ogni generazione è rifiutata dal tetto di spesa, e la schermata lo dice.

## Secondo fornitore: Anthropic

Il fornitore si sceglie sul server con `GENERATION_PROVIDER` (`openai` | `anthropic`). Se la variabile è assente o vuota si usa OpenAI, come prima. Per Anthropic servono `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`: nessun modello è scelto implicitamente. Un valore non ammesso blocca la generazione (`not_configured`); `GET /generation/config` restituisce fornitore e variabili mancanti (o `invalid: ['GENERATION_PROVIDER']`) senza mostrare valori. La scelta passa da `selection.create_provider()`, chiamata dalla pipeline quando la rotta non inietta un fornitore.

`AnthropicProvider` (`generation/anthropic_provider.py`) riceve le stesse istruzioni e lo stesso JSON del blocco (`generation/instructions.py`), con 6.000 token in uscita, timeout 90 secondi e un retry. Usa `client.messages.create(output_config={'format': {'type': 'json_schema', 'schema': transform_schema(ModuleDraft)}})` (SDK Python `anthropic` 1.15.0) e valida il testo con `ModuleDraft`. Non usa `messages.parse()` perché questo valida il JSON dentro la chiamata, prima che si possa leggere `stop_reason`. Mappatura: `stop_reason == 'refusal'` → `provider_refusal`; ogni altro valore diverso da `end_turn` (fra cui `max_tokens` e `model_context_window_exceeded`) → `provider_incomplete`; nessun testo → `provider_empty`; eccezione del client → `provider_error`; JSON non conforme → `invalid_generated_content`. Il parametro `thinking` non viene impostato: su modelli con ragionamento sempre attivo i token di ragionamento rientrano nei 6.000 e possono produrre `provider_incomplete`.

Uso: `input_tokens` di Anthropic è la sola parte non in cache, quindi `inputTokens` = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (se uno manca, `null`) e `cachedInputTokens` = `cache_read_input_tokens`. Così i due fornitori sono confrontabili: in entrambi `cachedInputTokens` è una parte di `inputTokens`. I test usano il vero SDK con un trasporto HTTP finto: nessuna chiave reale, nessuna chiamata di rete.

## Tipi di domanda

Oltre alla scelta singola il contratto ammette, con `kind` (facoltativo, predefinito `single`): `truefalse`, `fillblank`, `scenario`, `oddOneOut`, `correctStatement` e `multiple`. I primi cinque si correggono come una scelta singola (traduzione di riferimento: `normalizzaPerRipasso` di Civis, `packages/civis-ui/src/ripasso.ts`), quindi motore d'esame, soglia, giudizio, ordine con seme e riepilogo non cambiano. Campi di presentazione: `situation` (solo scenario), `sentence` e `wrong` (solo correggi l'errore); facoltativi `difficulty` (`base`, `medio`, `avanzato`, i livelli di `DifficultyBadge` di Civis) e `rationale` per opzione (il `perche` di Civis).

Regole per tipo, identiche in `packages/contracts/src/tipi.ts` e `generation/models.py` (`errori_tipo`), con casi condivisi in `services/api/tests/fixtures/invalid-course-cases.json`; riscritte, non copiate, da `scripts/verifica-contenuti.mjs` di Civis (righe 281–331):

- vero/falso: opzioni esattamente «Vero» e «Falso», in quest'ordine; non si mescolano (`displayOptions`);
- completa la frase: esattamente un `___` nel testo (`prompt`);
- scenario: situazione obbligatoria;
- correggi l'errore: `wrong` compare esattamente una volta in `sentence`;
- scenario, intruso, correggi l'errore: nessuna opzione duplicata e giusta non più lunga di 1,5 volte la più lunga delle altre (lunghezza in punti di codice, uguale in TypeScript e Python);
- risposta multipla: `correctOptionIds` (almeno 2 giuste, almeno una sbagliata, opzioni diverse) al posto di `correctOptionId`, nessuna opzione duplicata. La risposta dell'allievo è un elenco di `optionIds`; la correzione è tutto-o-niente (giusta solo se l'insieme scelto coincide con quello delle giuste) ed entra in `valutaEsame` come esito sì/no, così soglia e giudizio restano per domanda.

**Versione dello schema.** Resta `schemaVersion: 1`: l'aggiunta è retrocompatibile (un corso senza `kind` è una scelta singola, nessun corso salvato diventa invalido) e app e API sono distribuite insieme, senza lettori esterni da proteggere. Il prezzo: una versione vecchia dell'app scarterebbe in silenzio i campi nuovi; se il contratto avrà lettori indipendenti, il cambio successivo dovrà alzare la versione.

**Bozze generate.** `QuestionDraft` è un'unione semplice di sette varianti (`SingleDraft`, `TrueFalseDraft`, `FillBlankDraft`, `ScenarioDraft`, `OddOneOutDraft`, `CorrectStatementDraft`, `MultipleDraft`), riconosciute da `kind`. Scelte imposte dai due fornitori, lette alla fonte e verificate da `tests/test_schema_fornitori.py` con gli SDK veri e un trasporto finto:

- unione come `anyOf` e non `Field(discriminator=...)`: Pydantic la descriverebbe con `oneOf` + `discriminator`, che OpenAI non elenca fra le parole chiave ammesse;
- `kind` descritto come `enum` a un valore e non come `const`: `anthropic.transform_schema` (SDK 1.15.0) sposta `const` nella descrizione;
- nessun campo facoltativo né nullable: OpenAI li vuole tutti in `required`, Anthropic ammette al massimo 24 parametri facoltativi e 16 con unione per richiesta. Perciò `rationales` ha un elemento per opzione (stringa vuota = nessuna motivazione, la pipeline la omette) e `difficulty` è sempre presente. L'unica unione dello schema è l'elemento di `questions`;
- vero/falso: il modello scrive solo l'affermazione e `correct`; le opzioni le aggiunge la pipeline;
- risposta multipla: `correctIndexes`, almeno 4 opzioni e non più di metà giuste (regola della generazione, più stretta del contratto; chi la viola viene scartata, vedi sotto).

Le istruzioni chiedono un mix di tipi adatto al materiale; scenario e correggi l'errore solo se il testo descrive comportamenti o fatti che lo permettono, senza fatti inventati; `sourceRefs` sempre. La pipeline mappa ogni variante nel contratto (`domanda_del_contratto`); la fixture `generated-course.json` contiene un esempio di ogni tipo per modulo ed è rigenerata dalla pipeline con il fornitore finto dei test.

**Costo nel preventivo.** Lo schema inviato passa da 1.662 byte (OpenAI) e 1.723 (Anthropic) a 8.053 e 8.444, e le istruzioni da 396 a 1.409 byte per chiamata: con il limite «un byte, un token» il limite superiore in ingresso cresce di circa 7,7 k token per tentativo. Il preventivo delle selezioni native del corpus sale di circa il 26% (01-nativa-p1-90 con claude-opus-5-5: 20,63 USD prima dei tipi, 25,09 con i primi sei, 25,93 con la risposta multipla; 03-accordo-p50-96: 11,06 → 13,92; 04-tutto: 9,35 → 11,80); la differenza è tutta nei byte di schema e istruzioni. Le selezioni OCR richiedono ora un'estrazione completa e allungano molto il preventivo senza argomenti: per misurare solo le native, `preventivo --selezione 01-nativa-p1-90 --selezione 03-accordo-p50-96 --selezione 04-tutto`. Il limite d'uscita resta 6.000 token per blocco: domande più varie e motivazioni lo consumano più in fretta, e un'uscita troncata fa fallire l'intera generazione (`provider_incomplete`). Va misurato sulla prossima corsa reale.

`measurement/risposte.py` esclude il vero/falso dai controlli di posizione e lunghezza (opzioni fisse) e tratta la risposta multipla a parte: segnala se le giuste sono sistematicamente le opzioni più lunghe (coda binomiale, attesa 1/C(n, k) per domanda).

## Domande scartate

Una domanda che viola una regola di qualità **di singola domanda** viene scartata, non fa fallire il corso: le chiamate già pagate non vanno perse per una domanda imperfetta. Le regole sono quelle di `errori_tipo` più la regola della multipla «non più di metà giuste»; le applica la pipeline con `violazioni_domanda` (`generation/models.py`) sulla domanda già nella forma del contratto, **prima** di validare il corso, quindi la bozza salvata resta valida per Course e per `CourseSchema` (fixture `generated-course-con-scarti.json`, letta da `backend-compatibility.test.ts`). Le regole non stanno nei validatori delle bozze: lo SDK OpenAI valida con `text_format=ModuleDraft` dentro `responses.parse()` e `AnthropicProvider` con `ModuleDraft.model_validate_json`, e lì avrebbero fatto fallire il modulo prima dello scarto (lo verificano i test con gli SDK veri e un trasporto finto).

Codici stabili (`violazioni_tipo`): `opzioni_duplicate`, `giusta_troppo_lunga`, `spazio_non_unico`, `parte_sbagliata_non_unica`, `parte_sbagliata_mancante`, `frase_mancante`, `situazione_mancante`, `multipla_meno_di_due_giuste`, `multipla_giuste_non_valide`, `multipla_senza_sbagliate`, `multipla_oltre_meta_giuste`; le altre (`campo_di_altro_tipo`, `giuste_multiple_fuori_tipo`, `giusta_mancante`, `multipla_giusta_singola`, `vero_falso_opzioni`) non sono raggiungibili da una bozza, perché la forma le esclude.

Restano fatali: schema non rispettato (campo mancante o estraneo, indice della giusta fuori dalle opzioni, opzione vuota, `rationales` di lunghezza diversa dalle opzioni) → `invalid_generated_content`; fonte inventata, controllata su tutte le domande anche se poi scartate → `invented_source`; rifiuto, troncamento, risposta vuota o guasto del fornitore → `provider_*`. Un modulo che resta **senza domande** fa fallire il blocco (`invalid_generated_content`, il messaggio riporta i codici scartati).

Ogni scarto è in `scarti` del risultato: `moduleId`, `chunkId`, `position` (1-based, nell'elenco del fornitore), `kind`, `prompt`, `rule` e `message` della prima regola violata, `otherRules` per le altre. Negli avvisi della bozza compare il conteggio, es. «2 domande scartate dai controlli di qualità». Gli ID delle domande rimaste restano consecutivi e la soglia dell'esame si calcola sulle rimaste (5 generate, 2 scartate → ⌈60%·3⌉ = 2). La corsa di misura registra `scarti` (`numero` e, per voce, `regola`, `domanda`, `tipo`, `modulo`, `blocco`) nel registro; l'elenco completo resta in `bozza.json`.

## Pagine non lette ed esclusione esplicita

Un'estrazione con pagine non lette (avvisi «probabile scansione: richiede OCR» o «OCR senza testo utile», `pagine_non_lette.py`) non genera: il corso nascerebbe dalle sole intestazioni. Oltre a rileggere con l'OCR o cambiare intervallo, l'utente può **escludere le pagine**: nel pannello di generazione, sotto l'elenco delle pagine non lette (campo `unreadPages` del preventivo), il pulsante «Escludi queste pagine e continua»; «Annulla esclusione» lo revoca. Preventivo e «Crea bozza AI» usano lo stesso elenco (`excludePages`), applicato da una sola funzione, `esclusione_pagine.applica_esclusione`: copia dell'estrazione senza i blocchi di quelle pagine, con l'avviso dell'esclusione in testa. Serve per le copertine grafiche (pp. 1 e 3 del documento `05` del corpus) o per una pagina rovinata in mezzo al documento, che un intervallo non può togliere.

Nessuna esclusione silenziosa: la decide l'utente, l'estrazione salvata resta intera e la bozza la riporta negli avvisi («Escluse dal corso su richiesta: pagine 1 e 3», visibile nell'editor sotto «Avvisi della bozza»), in `excludedPages` e nel registro di copertura (`coverage.excludedPages`, motivo `user_request`). Le altre pagine non lette, se restano, continuano a bloccare. Le pagine escluse possono essere solo pagine della selezione, ciascuna una volta, e deve restare del testo (rifiuto 422 `invalid_excluded_pages`). Lo strumento di misura non prevede l'esclusione.

## Tetto di spesa della generazione dall'app

Prima di generare, il pannello mostra il **costo massimo garantito** in USD per il fornitore e il modello configurati, per esempio «Costo massimo: 0,13 USD (claude-haiku-5-5, 1 blocco)». Lo calcola `GET /extractions/{id}/generation-estimate`; la stessa funzione (`valuta` e `decidi` in `services/api/formazione_api/spesa_generazione.py`) decide anche la rotta `POST /extractions/{id}/generate`, quindi il costo mostrato è quello applicato.

Il preventivo è quello dello strumento di misura, non una copia (vedi [MISURE.md](MISURE.md), «Limite superiore»): `measurement.preventivo.pianifica` e `preventivo_corsa`, comprese la quota per chiamata misurata (`sovraccaricoIngressoPerChiamata`), tutti i tentativi dello SDK e il moltiplicatore massimo, con i prezzi di `tests/corpus/prezzi.json`. L'importo mostrato è arrotondato per eccesso al centesimo. Il fornitore è quello iniettato in `app.state.generation_provider` (attributi `provider_name` e `model`) oppure quello scelto con `GENERATION_PROVIDER` e `<FORNITORE>_MODEL`.

Il preventivo è **non disponibile**, e la generazione rifiutata con `422 estimate_unavailable` senza chiamare il fornitore, se il modello non ha prezzo in `prezzi.json`, se la quota per chiamata del fornitore non è misurata (oggi OpenAI), se un blocco supera la soglia del contesto lungo o se il fornitore iniettato non dichiara fornitore e modello.

Limiti del processo server, in USD:

| Variabile | Significato | Predefinito |
|---|---|---|
| `GENERATION_MAX_USD_PER_COURSE` | limite superiore massimo di una singola generazione | `0.50` |
| `GENERATION_BUDGET_USD` | tetto cumulativo di tutte le generazioni registrate | `5.00` |

I predefiniti stanno solo in `PREDEFINITI` di `spesa_generazione.py` e compaiono in `GET /generation/config` sotto `spending` (`defaults`, `maxUsdPerCourse`, `budgetUsd`, `spentUsd`). Un valore non numerico, infinito o negativo non è sostituito dal predefinito: rifiuto `422 invalid_spending_limit`. `0` blocca ogni generazione.

Rifiuti, tutti prima di chiamare il fornitore, con codice e messaggio leggibile mostrati dal pannello:

- `over_course_limit` (422): costo massimo oltre `GENERATION_MAX_USD_PER_COURSE`;
- `over_budget` (422): spesa registrata + costo massimo oltre `GENERATION_BUDGET_USD` (stessa `verifica_avvio` della guardia di misura);
- `budget_guard` (422): arresto a metà generazione, se prima di un blocco il registro riletto non lascia spazio al suo limite;
- `generation_in_progress` (409): una generazione alla volta per processo, perché due generazioni simultanee leggerebbero la stessa spesa.

Registro cumulativo: `registro-spesa-app.json` nella cartella dei dati (`var/api/` oppure `FORMAZIONE_DATA_DIR`), separato da quello delle misure, con la stessa logica e lo stesso codice (`Registro` e `FornitoreSorvegliato` di `measurement/guardia.py`): il limite di ogni blocco è prenotato prima della chiamata (`addebitatoUSD`), il costo effettivo dai token dichiarati è registrato dopo (`effettivoUSD`, `null` se un contatore manca). Anche le generazioni fallite o arrestate restano nel registro con quanto prenotato. Il tetto cumulativo somma `addebitatoUSD`, cioè i limiti, non i costi effettivi: è prudente per costruzione. Per ripartire da zero si archivia il file.

Limiti noti: il lucchetto vale per un solo processo (uvicorn con più worker o due server sulla stessa cartella dati non sono coordinati); il predefinito cumulativo non si azzera nel tempo.
