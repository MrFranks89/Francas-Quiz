# Analisi iniziale di Civis per la piattaforma di formazione

Data: 14 ottobre 2026. Repository esaminato: `C:\Civica`, HEAD `b6595b8`.
Ambito: lettura mirata del codice e test locali esistenti. Nessuna modifica a Civis, nessuna estrazione e nessuna connessione al database di produzione.
Il checkout contiene modifiche preesistenti: l'analisi fotografa i file presenti, non un checkout ripulito del solo commit.

## Risultato

La base riutilizzabile comprende già slide, esercizi, quiz, ripasso distanziato, classi, assegnazioni, registro ed esami liberi/a sbarramento. Il lavoro principale nuovo è la trasformazione affidabile dei documenti in corsi modificabili, il catalogo dinamico con versioni e separazione dei clienti e la distribuzione web.

L'app è React Native, non una web app già predisposta per Capacitor. Prima scelta da provare: React Native + React Native for Web, con Expo come possibile ambiente del nuovo prodotto. La compatibilità delle versioni e dei componenti va verificata con una prova isolata; non si migra in blocco Civis.

## Mappa del riuso

| Area | File di origine sotto `CivicaApp/` | Evidenza e destinazione |
|---|---|---|
| Slide | `src/lezione/SlideStep.tsx` | Titolo, testo, evidenza, avanzamento; dipendenze da tema, icone, voce e glossario di Civis. Base per il lettore, non editor completo di presentazioni |
| Quiz | `src/lezione/QuizStep.tsx`, `QuizSingleStep.tsx`, `util.ts` | Gestione risposte, mescolamento, feedback e spiegazioni; UI React Native con dipendenze comuni da adattare |
| Altri esercizi | `src/lezione/TrueFalseStep.tsx`, `ScenarioStep.tsx`, `BranchScenarioStep.tsx`, `CardFlipStep.tsx`, `FillBlankStep.tsx`, `MatchPairsStep.tsx`, `OrderStep.tsx`, `SortStep.tsx`, `OddOneOutStep.tsx`, `CorrectStatementStep.tsx` | Tipologie già presenti; attivarle nel generatore progressivamente, dopo validazione dei rispettivi formati |
| Esame personale | `src/esame/esame.ts` | Logica pura: raccolta banca, deduplicazione, quote per modulo, mescolamento opzioni, timer, valutazione, errori al ripasso |
| Ripasso | `src/ripasso.ts` | Funzioni pure per snapshot degli errori, varianti, normalizzazione, livelli, scadenze e fusione locale/remota |
| Sblocco lezioni | `src/statoLezione.ts` | Funzione pura; regole di sequenza, lezioni bonus e vite. Non prende in ingresso gli esiti degli esami |
| Classi | `src/auth/classi.ts`, `src/classi/` | Creazione/iscrizione, inviti, assegnazioni, scadenze, membri, registro e dettaglio studente |
| Esami di classe | `src/auth/esamiClasse.ts`, `src/esame/EsameClasse*Screen.tsx`, `Esami*Sezione.tsx` | Creazione, tipo libero/sbarramento, soglia, assegnazione, tentativo, risposte, consegna, risultati e riassegnazione |
| Persistenza | `src/auth/progressSync.ts` | Regole di serializzazione, fusione e protezione per account; modello attuale include anche stati ludici di Civis |
| Controlli contenuti | `scripts/verifica-contenuti.mjs` e librerie collegate | Approccio e singole regole da selezionare per qualità e completezza dei corsi; molte regole editoriali sono specifiche di Civis |
| Editor locale | `scripts/editor.mjs`, `scripts/lib-sorgente.mjs` | Esiste già un editor browser con backup e validazione. Modifica sorgenti JavaScript locali: non è l'editor SaaS multiutente richiesto |

## Percorsi effettivamente collegati

- `CivicApp.tsx` importa le schermate classi ed esami e seleziona i componenti degli step tramite `step.type`.
- `ClassiDocenteScreen.tsx:389` monta `EsamiClasseDocenteSezione`, che apre creazione e risultati.
- `ClassiStudenteScreen.tsx:151` monta `EsamiDaFareSezione`, che apre `EsameClasseSvolgiScreen`.
- `__tests__/esame/EsameClasse.test.tsx:331` verifica il percorso dalla classe dello studente al pulsante Inizia e allo svolgimento, con servizi simulati.

Questo esclude la sola presenza di funzioni mai richiamate nei percorsi esaminati. Non equivale a una prova manuale su dispositivi o a un collaudo del backend live.

## Cosa va adattato

1. **Catalogo dinamico.** `CivicApp.tsx` e le schermate delle classi importano `MODULES` da `src/data`. Il nuovo prodotto carica corsi approvati dal backend, con isolamento per organizzazione.
2. **Identificatori e versioni.** Moduli numerici, riferimenti lezione/step/testo e progresso globale vanno adattati a corso, versione, modulo, lezione, domanda e assegnazione. Una modifica al testo non deve cambiare l'identità della domanda.
3. **Regole di avanzamento.** Lo sbarramento di un esame esiste; il vincolo «supera l'esame prima di aprire il modulo seguente» va modellato e applicato anche dal server. La funzione `statoLezione` oggi non legge risultati d'esame.
4. **Parametri esame.** Il sorgente offre dimensioni 10/20/30 e durata collegata al numero di domande. Nel nuovo prodotto numero, durata, soglia, politica dei tentativi e riassegnazione vanno configurati e versionati, con limiti coerenti con la banca disponibile.
5. **UI e dipendenze native.** Tema, icone, glossario, lettura vocale, storage, gestione Back e integrazioni native richiedono adattatori o sostituzioni per web. React Native for Web non rende automaticamente compatibile ogni libreria nativa.
6. **Regole del prodotto.** Vite, XP, album, pubblicità e accesso Pro/scuola sono decisioni di Civis. La formazione deve avere politiche proprie e un'eventuale gamification opzionale.
7. **Backend indipendente.** Le chiamate client e i file SQL illustrano il disegno esistente, ma non certificano vincoli, permessi e firme attualmente installati. Il nuovo prodotto usa un ambiente separato; prima di riutilizzare contratti live occorre leggerli alla fonte.
8. **Editor.** Il salvataggio su file `data*.js` diventa un salvataggio strutturato di bozze e revisioni. Il generatore non deve produrre JavaScript da eseguire.

## Esami e autorità del server

Il client `src/auth/esamiClasse.ts` espone il contratto con RPC per inizio, risposta e consegna. I sorgenti SQL locali `supabase/esami_classe.sql` e `esami_classe_v2.sql` descrivono soluzioni separate, tempi, correzione e tentativi.

Queste sono evidenze del codice locale, non una verifica dello schema di produzione. I test client simulano le RPC e alcuni confrontano i sorgenti SQL: non provano l'applicazione delle migrazioni, l'isolamento tra aziende o i permessi live.

Per la nuova piattaforma occorrono test su un database dedicato: uno studente non legge le soluzioni riservate né risultati altrui, non altera il voto e non aggira prerequisiti o limiti dei tentativi.

## Verifiche eseguite

Comando dalla directory `C:\Civica\CivicaApp`:

```powershell
node node_modules/jest/bin/jest.js --runInBand --no-cache --silent --runTestsByPath __tests__/esame/esame.test.ts __tests__/esame/quote.test.ts __tests__/esame/EsameClasse.test.tsx __tests__/auth/esamiClasse.test.ts __tests__/lezione/QuizStep.test.tsx __tests__/ripasso.test.ts __tests__/ripassoLivelli.test.ts __tests__/statoLezione.test.ts __tests__/classi/ClassiGestione.test.tsx
```

Prima esecuzione: 8 suite passate; 1 suite con un test oltre il timeout predefinito di 5 secondi. Totale: 157 test passati, 1 timeout.

Ripetizione della sola suite interessata, senza modificare file:

```powershell
node node_modules/jest/bin/jest.js --runInBand --no-cache --silent --testTimeout=20000 --runTestsByPath __tests__/esame/EsameClasse.test.tsx
```

Risultato: tutti i 19 test della suite passati. I 158 test distinti selezionati hanno quindi avuto esito positivo tra prima esecuzione e ripetizione. Rimane da tenere sotto osservazione il timeout iniziale; non è stato corretto né nascosto modificando la configurazione.

Non eseguiti: suite completa, build mobile/web, verifica manuale su dispositivo, connessioni a produzione. Non necessari per questa prima ricognizione; saranno verifiche dell'estrazione e della prova multipiattaforma.

## Ordine consigliato per il recupero

1. Fissare snapshot e test del comportamento da preservare.
2. Recuperare prima le funzioni pure di esame e ripasso.
3. Portare una slide e un quiz con dipendenze grafiche minime nel nuovo ambiente.
4. Provare lo stesso corso strutturato su browser e app.
5. Separare controllo del progresso, caricamento corsi e regole d'esame dalla UI.
6. Adattare classi e registro al nuovo backend e alle organizzazioni.

Prima di ogni estrazione: test sul comportamento attuale, riferimento Git allo stato funzionante, un'estrazione per commit e stessi test dopo. Le estensioni funzionali si fanno in passaggi distinti. L'analisi attuale non ha avviato queste modifiche.
