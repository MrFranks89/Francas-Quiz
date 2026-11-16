# Roadmap operativa — piattaforma di formazione da documenti

Data: 14 ottobre 2026. Documento di attività, dipendenze e criteri di completamento.
Stato aggiornato al 15 ottobre 2026: prima versione locale implementata con motore Civis estratto, contratti, importazione e OCR, generazione di bozze configurabile, revisione, pubblicazione e lettore universale con sbarramenti. La generazione AI non è ancora collaudata con un provider a pagamento; account, aziende e classi non sono implementati. Questa roadmap comprende anche attività future; lo stato eseguibile è documentato nel README e le prove in VERIFICHE.md.
Riscontri del codice e test: [ANALISI_CIVIS.md](ANALISI_CIVIS.md).

## Aggiornamento del 16 novembre 2026

Decisione di Federico: si prendono tre cose da Algor Education e si aggiunge l'esportazione SCORM.

Fonte su Algor: le guide ufficiali, `guide.algoreducation.com/it` (pagine «Creare contenuti», «Lavorare con i Set», «Studiare e ripassare»), lette il 16 novembre 2026. Descrivono il comportamento del prodotto, non come è costruito: modelli, istruzioni e numero di chiamate di Algor non sono noti.

1. **Indice proposto e corretto prima di generare.**
   - Algor analizza il materiale, propone sezioni e pagine, l'utente le corregge a parole e solo dopo la conferma le pagine vengono scritte.
   - Da noi è il primo passo del registro dei concetti (punto 3 delle priorità del 29 ottobre) e della fase 5 («Proporre programma e obiettivi prima di generare tutte le slide»): si anticipa.
   - Ogni voce dell'indice diventa una chiamata piccola, con i passaggi originali della fonte e non con un riassunto.
2. **Domande generate su richiesta e per ambito.**
   - Algor non crea quiz e flashcard insieme al Set: si avviano dopo, su tutto il Set, una sezione o una pagina, scegliendo tipi e numero di domande.
   - Da noi: la generazione delle slide e quella delle domande diventano due chiamate distinte. Resta la regola madre: ogni domanda riguarda solo fatti scritti nelle slide del suo ambito e cita i suoi `sourceRefs`.
   - Toglie peso alla chiamata unica per blocco, che il 16 novembre 2026 si tronca al tetto dei token in uscita (vedi [GENERAZIONE.md](GENERAZIONE.md)).
3. **Punteggio per pagina che decade nel tempo.**
   - In Algor ogni pagina ha un punteggio che cala se non la si ripassa, le domande difficili pesano di più, e c'è un obiettivo con voto e data.
   - Da noi va con «Studio come prodotto» (punto 8), sopra il ripasso di Civis già estratto. Soglie e pesi sono nostri: quelli di Algor (superato al 70%) non si copiano senza una misura.
4. **Esportazione SCORM del corso pubblicato.**
   - Suggerimento di Federico, visto in LearningStudioAI. Algor non esporta nemmeno un Set intero.
   - Serve a chi ha già un LMS: va con la modalità Formazione ([decisione 003](decisions/003-due-modalita.md)); l'ordine rispetto a Studio lo decide Federico.
   - Versione di SCORM, forma del pacchetto e modo di comunicare esiti e risposte all'LMS si leggono dalla specifica e si provano su un LMS vero prima di scrivere codice: non sono ancora stati letti.
   - Da decidere: che cosa succede ai tipi di domanda e agli sbarramenti che il formato non sa esprimere.

Dal documento `COORDINAMENTO.md` (analisi di un altro assistente, non committato) si tengono tre punti:

- la mappa concettuale come schermata per lo studente, con i nodi collegati alla pagina della fonte: dopo il registro dei concetti;
- una tabella non va spezzata fra due blocchi: oggi `plan_chunks` taglia su riga vuota o a metà (`generation/chunks.py`);
- l'immagine ritagliata della figura mostrata nella slide, insieme alla lettura delle figure (punto 6).

## Aggiornamento del 4 novembre 2026

Decisione di Federico: **prima le cose di base, l'editor dopo.** Il restyling dell'editor nello stile di Civis passa in fondo. Dallo stile di Civis si prendono adesso tre cose:

1. **le regole dei quiz:**
   - distrattori;
   - mai domande su argomenti non presentati nella lezione;
   - formulazioni, numeri e il resto di `verifica-contenuti.mjs` e delle librerie collegate;
2. **i tipi di quiz mancanti:** abbinamento, ordinamento, classificazione, carte e gli altri, con la struttura della lezione a sequenza di step;
3. **l'estetica dei bottoni** in tutte le schermate, con `Btn` di Civis al posto del vecchio `Button`.

Ordine: ricognizione delle regole di Civis (in corso), poi regole, poi tipi, poi bottoni. I punti sotto restano validi.

## Priorità aggiornate — 29 ottobre 2026

Decisione: [003-due-modalita.md](decisions/003-due-modalita.md). La piattaforma ha due modalità sullo stesso motore: **Studio**, per lo studente in abbonamento senza revisione manuale, e **Formazione**, per le aziende su richiesta con revisione umana. Si costruisce prima Studio. Le fasi 8 (aziende e classi) e 9 (attestati e report gestionali) sono **rimandate** finché non c'è un cliente aziendale reale. Le fasi sotto restano valide come elenco di attività, ma l'ordine di lavoro è questo:

1. **In corso:**
   - nuovi tipi di domanda: vero/falso, completa la frase, scenario, intruso, correggi l'errore, risposta multipla;
   - correzione dei tre difetti dell'estrazione: OCR troncato in silenzio, XLSX reali, pagine scansionate non segnalate.
2. **Avvisi:**
   - il corso segue l'ordine del documento e lo stesso concetto può comparire in più moduli (provvisorio, finché non c'è il registro dei concetti);
   - avviso preciso, pagina per pagina, sulle figure non interpretate.
3. **Registro dei concetti** (fase 5):
   - estrazione per blocco, poi unione dei duplicati e dei sinonimi;
   - importanza del concetto;
   - piano per concetti e dipendenze, generazione concetto per concetto;
   - controllo automatico: ogni concetto essenziale ha almeno una slide e una domanda.
   - Risolve anche i doppioni del punto 2.
4. **Verifiche automatiche al posto della revisione obbligatoria:**
   - controllo dei numeri sulla fonte citata come regola della generazione;
   - verificatore cieco: un secondo modello risponde leggendo solo il passaggio citato; se sbaglia o trova due risposte giuste, la domanda è rigenerata o non mostrata;
   - in Formazione: revisione per eccezione, solo le domande segnalate;
   - misura su una decina di corsi del confronto fra il giudizio automatico e quello umano.
5. **Pulsante «Questa domanda è sbagliata»:**
   - segnalazione con correzione proposta, valida per la copia dello studente;
   - ogni segnalazione salvata come misura degli errori sfuggiti.
6. **Figure e OCR:**
   - lettura delle figure con un modello multimodale, come nuova fonte «interpretazione di figura» con la sua pagina;
   - OCR misto: testo nativo, poi OCR locale pagina per pagina con avanzamento e ripresa, poi modello multimodale sulle pagine a bassa confidenza;
   - misura sulle pagine annotate a mano del corpus;
   - finché la lettura delle figure non c'è, la prima versione pubblica lo dichiara esplicitamente.
7. **Domande aperte** (dopo il registro dei concetti):
   - risposta modello e punti chiave con le loro fonti, prodotti in generazione;
   - correzione per punti con una chiamata breve;
   - autovalutazione gratuita come base, correzione AI a quota.
8. **Studio come prodotto:**
   - ripasso degli errori e simulazione d'esame, dal motore Civis già estratto;
   - account, sincronizzazione su server, abbonamenti;
   - foto delle pagine come fonte;
   - registrazioni audio delle lezioni come fonte, **dopo il nucleo di Studio** (punti 3–5):
     - la trascrizione è divisa in segmenti con il loro minutaggio, che prende il posto della pagina come fonte («minuto 12:30»); poi si segue lo stesso percorso di concetti, domande e verifiche;
     - il modello di trascrizione è a basso costo e si sceglie su un campione: lezioni vere trascritte in parte a mano, confrontando i candidati sugli errori di trascrizione in italiano, sul costo all'ora e sull'uso dei dati;
     - candidati:
       - Gladia: Solaria-3 a 0,16 €/ora; addestramento sui dati attivo per impostazione predefinita e da disattivare; conservazione e località dei dati da chiedere. Letto il 29 ottobre 2026;
       - modelli open source in locale;
     - da verificare: distinzione delle voci;
     - consenso e diritto di usare la registrazione vanno inclusi nel parere legale prima del lancio.
9. **Conservazione e riuso:**
   - tutti i corsi nel nostro database;
   - riuso per file identico e stessa configurazione;
   - catalogo di fonti pubbliche;
   - appunti condivisi solo con il consenso dello studente.
10. **Prima del lancio pubblico:**
    - parere legale su conservazione, riuso, termini di servizio e privacy;
    - avvisi di sicurezza delle dipendenze;
    - build e prova su dispositivi Android e iOS reali.

**Fornitori AI.** Il confronto di qualità con modelli gratuiti, come Gemini, si fa solo sul corpus pubblico: i piani gratuiti letti alla fonte usano i dati inviati e non vanno usati per il materiale degli studenti. Stato (3 novembre 2026): Gemini integrato come fornitore compatibile OpenAI Chat Completions, a prezzo 0 del piano gratuito, con avviso sui dati nelle Impostazioni; prima chiamata reale ancora da fare. Schema della bozza (9 novembre 2026): la prima chiamata vera ad Anthropic è stata rifiutata per grammatica troppo grande; `QuestionDraft` è ora un oggetto piatto senza `anyOf` (7,7 → 3,0 KB), con la coerenza per tipo controllata dopo la risposta e soglie automatiche sulla dimensione dello schema; da confermare con una generazione vera (`tools/prova_schema_anthropic.py` è solo un indizio). NVIDIA non integrato: output vincolato a schema non documentato sull'endpoint ospitato. Dettagli in [GENERAZIONE.md](GENERAZIONE.md).

## Obiettivo e percorso utente

Privato o azienda carica un documento → sceglie tutto o una parte → imposta destinatari e obiettivi → riceve un programma → genera slide e quiz → revisiona → pubblica → assegna o svolge il corso → vede risultati e ripasso.

Web responsive, app Android e app iOS sono destinatari dalla prima prova funzionante. Telefono, tablet e desktop condividono contenuti e regole; i layout si adattano al dispositivo.

## Requisito confermato: selezione del materiale

Per PDF e documenti con paginazione stabile:

- Selettore «Tutto il volume» / «Da pagina … a pagina …».
- Estremi inclusivi; valori interi, da 1 al numero di pagine, inizio non superiore alla fine.
- Anteprima della prima e dell'ultima pagina selezionata e conteggio delle pagine incluse.
- La pagina del file è il riferimento predefinito. Se esistono etichette interne, mostrarle accanto: «pagina PDF 112 · pagina stampata 100». Non dedurre etichette mancanti.
- Le citazioni conservano i numeri originali: selezionare 201–300 non trasforma pagina 201 in pagina 1 della fonte.
- Metadati e anteprima possono leggere la struttura del file; OCR, interpretazione visiva e generazione elaborano il perimetro scelto. Il costo non deve dipendere automaticamente dalle mille pagine del volume.
- Se il testo rimanda a materiale escluso, segnalare la dipendenza e proporre l'ampliamento. Nessuna inclusione silenziosa di pagine esterne.
- Cambiare intervallo produce una nuova selezione/versione del lavoro; non modifica retroattivamente un corso pubblicato.

Per altri formati:

| Formato | Selezione |
|---|---|
| DOCX | Tutto oppure sezioni/titoli. Per «Da pagina a pagina», creare un PDF di riferimento con LibreOffice, far verificare l'anteprima e congelare quella paginazione |
| ~~XLSX/CSV~~ | **Escluso il 29 ottobre 2026** per decisione dell'utente: con un foglio di dati sarebbe facile «barare» ([decisione 004](decisions/004-niente-fogli-di-calcolo.md)). Requisito precedente, conservato per la storia: ~~tutto, fogli e intervalli di celle; conservare intestazioni, unità e valori. Non usare pagine di stampa come struttura principale~~ |
| TXT/Markdown/appunti incollati | Tutto oppure selezione di testo/sezioni; le pagine non sono intrinseche |
| PPTX, estensione successiva | Tutta la presentazione oppure intervallo di slide |

La conversione DOCX dipende da font e impaginazione disponibili sul server: l'anteprima è la fonte per la scelta, non una promessa di identità con ogni installazione di Word.

## Componenti: scelta proposta e prove obbligatorie

«Proposto» significa candidato per l'implementazione, non integrazione già verificata.

| Responsabilità | Componente | Decisione |
|---|---|---|
| Quiz, esercizi, ripasso, esami e classi | Civis | Base verificata nel codice; estrazione mirata e adattamento |
| Interfacce app/web | React Native + React Native for Web; Expo da verificare | Prima prova multipiattaforma; fissare una combinazione compatibile, senza presumere compatibilità con tutte le versioni di Civis |
| Anteprima PDF | PDF.js | Candidato per browser e componente DOM nell'app; provare prestazioni su manuali lunghi |
| Parsing e OCR | Docling | Prima scelta; conservare rappresentazione strutturata, fonti, tabelle e figure |
| OCR alternativo | olmOCR | Confronto su campioni difficili; adottarlo solo se il miglioramento giustifica hardware e gestione |
| Conversione documenti Office | LibreOffice headless | Per formati legacy e PDF di riferimento quando necessario; esecuzione isolata |
| Editor contenuti | Tiptap, nucleo open source | Testo ricco dentro blocchi di slide tipizzati; non è da solo un editor PowerPoint |
| Validazione dati | Zod e Pydantic | Contratto JSON Schema versionato con fixture comuni e verifica di equivalenza; niente due schemi mantenuti a mano senza controllo |
| API Python | FastAPI | Integrazione con parsing e generazione; API applicative piccole e versionate |
| Database/accesso/storage | PostgreSQL e componenti Supabase | Ambiente separato da Civis; scelta managed/self-hosted distinta dalla disponibilità open source |
| Ricerca nelle fonti | Ricerca testuale PostgreSQL; pgvector quando utile | Ricerca ibrida entro organizzazione, documento e selezione; non sostituisce il controllo di copertura |
| Lavori in background | Celery + RabbitMQ | Candidati per OCR/generazione con checkpoint, ripresa e limiti; prova di consegna duplicata e arresto worker |
| Test | Jest già usato in Civis; pytest; Playwright | Regole pure, pipeline documentale, integrazione database e percorso browser. Build e collaudo reali per app native |

La pipeline di generazione didattica è una componente nostra, modulare e misurata. Nessuno dei parser costruisce da solo un corso affidabile. Il modello AI viene scelto tramite confronto su un corpus di prova, costo e qualità; l'uso di librerie open source non implica l'uso esclusivo di modelli locali.

### Destinazione dei progetti LMS e authoring esaminati

| Progetto | Impiego proposto |
|---|---|
| H5P | Prova circoscritta di Course Presentation e possibile interoperabilità futura. Il formato interno iniziale resta indipendente; evitare due motori di valutazione paralleli |
| Adapt Authoring | Riferimento per authoring e contenuti responsive. Adottare il prodotto intero soltanto se una prova ne dimostra il vantaggio rispetto all'editor a blocchi |
| eXeLearning | Riferimento per organizzazione e pubblicazione; possibile scambio contenuti futuro |
| Moodle | Possibile sistema esterno con cui integrare corsi e risultati; non piattaforma centrale proposta per il primo prodotto |
| Frappe Learning | Alternativa completa se la gestione LMS diventa prevalente; non da sommare a Moodle e al backend Civis |
| Open edX | Riferimento per esigenze LMS avanzate, fuori dalla base iniziale proposta |
| Unstructured | Alternativa al parser principale se vince sui documenti reali; non doppio parsing sistematico |
| Haystack | Introduzione successiva se riduce il codice di recupero e orchestrazione; evitare un framework aggiuntivo senza un beneficio misurato |

Prima di includere codice: fissare versione/commit, leggere licenza e licenze di modelli/dipendenze, registrare modifiche e attribuzioni. MIT/Apache, GPL e AGPL hanno condizioni diverse: la selezione finale deve riflettere come il componente viene integrato e distribuito.

## 0. Ricognizione Civis — prima parte completata

- [x] Individuare repository, stack e istruzioni locali.
- [x] Mappare quiz, slide, ripasso, classi, esami e persistenza.
- [x] Verificare i collegamenti tra schermate classi ed esami.
- [x] Eseguire test mirati; registrare il timeout iniziale e la ripetizione positiva.
- [x] Identificare dipendenze da catalogo statico, grafica e logiche specifiche di Civis.
- [ ] Durante l'estrazione, completare l'inventario delle dipendenze effettivamente importate dai componenti scelti.

Uscita: mappa concreta del riuso in `ANALISI_CIVIS.md`. Nessuna promessa di backend live già verificato.

## 1. Contratto dei corsi e confini dei moduli

Dipende da: ricognizione iniziale.

- [ ] Definire organizzazione, appartenenza, ruolo, documento, versione documento e selezione della fonte.
- [ ] Definire corso, versione corso, obiettivo, modulo, lezione, blocco slide, domanda e riferimento alla fonte.
- [ ] Definire assegnazione, tentativo, risposta, esito e stato dei prerequisiti.
- [ ] Usare identificatori stabili; separare identità e revisione del contenuto.
- [ ] Salvare domande e soluzioni con visibilità distinta per le prove formali.
- [ ] Definire gli stati del corso: bozza, in revisione, pubblicato, archiviato; il tentativo conserva la versione sostenuta.
- [ ] Definire politiche separate per pratica, prova di controllo e prova che sblocca un passaggio.
- [ ] Separare schema di contenuto, stato dell'allievo e dipendenze della piattaforma.
- [ ] Creare un corso minimo di prova strutturato con slide, tabella, immagine, quiz e riferimento alla fonte.

Componenti: JSON Schema, Zod, Pydantic, TypeScript.
Uscita: lo stesso corso viene validato da backend ed entrambe le interfacce; contenuti malformati sono rifiutati con errori leggibili.

## 2. Prima prova app/web e recupero del motore

Dipende da: contratto minimo.

- [ ] Fissare test e riferimento Git sul comportamento funzionante prima delle estrazioni.
- [ ] Recuperare le funzioni pure di esame e ripasso; un'estrazione per commit, nessuna correzione collaterale.
- [ ] Adattare una slide, un quiz e un riepilogo risultato alle sole dipendenze indispensabili.
- [ ] Fornire adattatori per storage, icone e lettura vocale; isolare integrazioni solo native.
- [ ] Avviare il corso campione su browser desktop, telefono, tablet, Android e iOS.
- [ ] Provare mouse, tastiera, touch, rotazione, zoom del testo e lettore di schermo sui flussi principali.
- [ ] Provare Tiptap nel browser e dentro un componente DOM/WebView nell'app: tastiera, selezione, incolla, tabelle, immagini e salvataggio.
- [ ] Scegliere Expo solo dopo compatibilità verificata; se non praticabile, documentare l'impedimento e confrontare una UI web distinta che condivida motore e schema.

Componenti: React Native, React Native for Web, Expo candidato, Tiptap, Jest, Playwright.
Uscita: prova eseguibile delle stesse regole e dello stesso contenuto su app e web. Una web app responsive da sola non completa questa fase.

## 3. Caricamento e scelta del perimetro

Dipende da: contratto della fonte e gestione utenti minima.

- [ ] Caricare PDF, DOCX, XLSX e testo; controllare formato reale, dimensioni e limiti dichiarati.
- [ ] Gestire file cifrati, danneggiati o non supportati con un esito esplicito.
- [ ] Generare anteprima e metadati senza avviare automaticamente l'analisi completa.
- [ ] Implementare selettore tutto/intervallo e anteprime degli estremi.
- [ ] Gestire la selezione appropriata per fogli di calcolo, appunti e DOCX.
- [ ] Salvare impronta del documento, intervallo selezionato e versione della trasformazione.
- [ ] Mostrare prima della generazione pagine/sezioni incluse e una stima del lavoro.
- [ ] Verificare l'intervallo anche sul server; non fidarsi dei soli controlli UI.

Componenti: PDF.js, storage privato, LibreOffice dove richiesto.
Uscita: selezionare 201–300 in un volume di 1.000 pagine include esattamente quelle 100 pagine, conservando i riferimenti originali.

## 4. Estrazione affidabile e fonti verificabili

Dipende da: selezione salvata.

- [ ] Costruire un corpus campione: PDF digitale, scansione italiana, colonne, tabelle multipagina, immagini/diagrammi, DOCX, XLSX e manuale lungo.
- [ ] Annotare passaggi e dati attesi per misurare errori di testo, numeri, ordine, tabelle e provenienza.
- [ ] Confrontare Docling e, sui campioni problematici, olmOCR; mantenere alternativa solo con beneficio dimostrato.
- [ ] Applicare estrazione/OCR alla selezione; verificare il comportamento dell'opzione `page_range` nella versione fissata di Docling.
- [ ] Conservare testo, gerarchia, tabelle strutturate, immagini, posizione e riferimenti originari.
- [ ] Interpretare figure solo quando serve; una figura estratta non è automaticamente compresa.
- [ ] Per Excel preservare foglio, celle, unità, intestazioni e distinzione tra formula e valore disponibile; segnalare valori calcolati assenti o dubbi.
- [ ] Segnalare pagine sospette o fallite. Non produrre un corso dichiarato completo se mancano parti della selezione.
- [ ] Salvare risultati intermedi e riutilizzarli per rigenerazioni consentite dello stesso documento/perimetro/configurazione.

Componenti: Docling; olmOCR candidato; LibreOffice per conversioni; servizi Python.
Uscita: dal contenuto estratto si torna al punto originale; il rapporto elenca parti lette, dubbie e fallite. I limiti vengono misurati sul corpus.

## 5. Generazione didattica su documenti lunghi

Dipende da: estrazione verificabile e contratto del corso.

- [ ] Chiedere destinatari, conoscenze iniziali, obiettivi, durata indicativa e livello di approfondimento.
- [ ] Suddividere per struttura e significato, con limite in token, mantenendo contesto di titoli, tabelle e rimandi.
- [ ] Analizzare ogni sezione selezionata; estrarre concetti, procedure, eccezioni e dipendenze con riferimenti alle fonti.
- [ ] Creare un registro di copertura: incluso, escluso motivatamente, dubbio, non leggibile.
- [ ] Proporre programma e obiettivi prima di generare tutte le slide.
- [ ] Generare modulo per modulo recuperando i passaggi originali necessari; i riassunti orientano il piano ma non sostituiscono la fonte.
- [ ] Richiedere riferimenti per le affermazioni verificabili e per risposta corretta e spiegazione dei quiz.
- [ ] Distinguere esempi didattici costruiti dalle affermazioni attribuite al documento.
- [ ] Segnalare rimandi fuori selezione o conflitti tra fonti; nessun ampliamento automatico del perimetro.
- [ ] Validare struttura, risposte, ambiguità, duplicati, copertura degli obiettivi e allineamento tra lezioni e test.
- [ ] Separare controlli deterministici e revisione semantica; una seconda chiamata AI non certifica da sola la correttezza.
- [ ] Generare una banca sufficiente a numero e varianti delle prove richieste; bloccare configurazioni impossibili.
- [ ] Consentire rigenerazione di un singolo modulo o blocco, preservando modifiche manuali e approvazioni tramite confronto esplicito.
- [ ] Registrare modello, configurazione, versione dei prompt, token, tempi e costo di ogni fase.

Componenti: chunker strutturale/ibrido Docling, FastAPI/Pydantic, moduli AI separati; ricerca PostgreSQL/pgvector se utile.
Uscita: un corso completo sulla selezione, con citazioni verificabili, lacune visibili e risultati misurati sul corpus. Un file lungo non viene affidato a un'unica chiamata senza controllo di copertura.

## 6. Editor, revisione e pubblicazione

Dipende da: corso generato e lettore multipiattaforma.

- [ ] Editor a blocchi: titolo, testo, elenco, evidenza, immagine con descrizione alternativa, tabella, esempio e quiz.
- [ ] Riordinare moduli/lezioni/slide e modificare domande, opzioni e spiegazioni.
- [ ] Mostrare accanto al blocco il passaggio della fonte e la sua anteprima.
- [ ] Salvare bozze, revisioni, autore delle modifiche e stato dell'approvazione; gestire conflitti tra due modifiche concorrenti.
- [ ] Offrire anteprima telefono/tablet/desktop con lo stesso lettore usato dagli allievi.
- [ ] Rendere disponibile la revisione anche nell'app, con interfaccia touch; validare il ponte DOM, non limitarsi a un pulsante che rimanda al desktop.
- [ ] Pubblicare solo contenuti validi e approvati; assegnare una versione immutabile.
- [ ] Creare una nuova bozza quando cambiano fonte o contenuti già pubblicati.

Componenti: Tiptap, blocchi strutturati propri, lettore derivato da Civis; H5P solo dopo eventuale prova vantaggiosa.
Uscita: modifica → anteprima → pubblicazione → contenuto visibile all'allievo su app e web, senza modificare file JavaScript o rifare una build.

## 7. Percorso formativo, controllo e sbarramento

Dipende da: corso pubblicabile e motore recuperato.

- [ ] Portare completamento, punteggi, feedback, ripasso e progresso al nuovo modello con corso/versione.
- [ ] Separare pratica con aiuti, test di controllo e prove con prerequisiti.
- [ ] Configurare soglia, durata, tentativi, riassegnazioni, moduli coperti e momento della visualizzazione delle soluzioni.
- [ ] Definire quali lezioni/moduli vengono sbloccati da un esame superato.
- [ ] Applicare autorizzazioni, prerequisiti, tempo e voto dal server; non inviare soluzioni riservate con le domande della prova.
- [ ] Rendere consegna e registrazione risposte resistenti a ripetizioni di richieste e tentativi contemporanei.
- [ ] Gestire chiusura/riapertura dell'app e perdita della rete con messaggi e stato coerenti; il timer formale non si ferma per un cambio schermata.
- [ ] Salvare snapshot e versione della prova; una modifica successiva al corso non altera risultati già consegnati.
- [ ] Portare gli errori al ripasso secondo la politica della prova, senza anticipare soluzioni riservate.

Componenti: funzioni e schermate Civis adattate; PostgreSQL/RPC o API autorevoli.
Uscita: fallire un esame lascia bloccato il passaggio configurato; superarlo lo sblocca su web e app dopo sincronizzazione. Chiamare direttamente un endpoint non aggira il vincolo.

## 8. Aziende, privati, classi e assegnazioni

La separazione delle organizzazioni nasce nella fase 1; qui si completano i flussi gestionali.

- [ ] Spazio personale per il privato e spazio aziendale con amministratore, creatore/docente e studenti.
- [ ] Gestire più classi/gruppi e appartenenze; stessa identità utente con permessi distinti per spazio.
- [ ] Recuperare da Civis inviti, iscrizioni, assegnazioni, scadenze, registro e dettaglio studente.
- [ ] Assegnare una versione del corso a persone o gruppi e conservare la storia delle assegnazioni.
- [ ] Definire visibilità per creatore, tutor, amministratore e allievo.
- [ ] Verificare isolamento di documenti, ricerca, storage, lavori AI, corsi e risultati tra organizzazioni.
- [ ] Testare autorizzazioni su un database di sviluppo separato, comprese letture dirette e link ai file.

Componenti: classi Civis, Supabase Auth, PostgreSQL/RLS, storage privato.
Uscita: un amministratore pubblica e assegna; lo studente riceve solo i propri corsi; un'altra azienda non accede a file o risultati.

## 9. Risultati, attestati e aggiornamenti

Dipende da: assegnazioni, progresso ed esami.

- [ ] Dashboard con iniziati/completati, scadenze, esiti, tentativi e argomenti critici.
- [ ] Distinguere mancato completamento, prova non superata e difficoltà di apprendimento; non dedurre competenza dal solo tempo di lettura.
- [ ] Esportare report e attestato di completamento con versione del corso, data e identificativo.
- [ ] Mostrare allo studente errori e ripasso consentiti.
- [ ] Per una fonte aggiornata, confrontare sezioni e individuare contenuti potenzialmente superati.
- [ ] Far approvare le modifiche e assegnare un aggiornamento senza cancellare lo storico precedente.

Componenti: registro Civis adattato, query PostgreSQL e generazione documenti da scegliere quando si definisce il formato dell'attestato.
Uscita: ogni risultato è riconducibile a una persona, un'assegnazione e una versione precisa.

## 10. Gestione del servizio e collaudo del pilota

Attività avviate con la prima pipeline e completate prima del pilota esterno.

- [ ] Jobs con stati leggibili, avanzamento per fase, checkpoint, ripetizioni limitate e annullamento.
- [ ] Impedire corsi duplicati o doppie pubblicazioni dopo la ripresa di un lavoro.
- [ ] Quote per account/azienda e budget per generazione; stimare la spesa prima dell'avvio e registrare quella effettiva.
- [ ] Gestire abbonamenti/crediti con un fornitore da scegliere; prezzi e condizioni sono una decisione separata.
- [ ] Isolare elaborazione di file non fidati; trattare il documento come materiale e non come istruzioni operative per l'AI.
- [ ] Registrare gli errori, oscurare dati sensibili nei log e definire conservazione/cancellazione di file e derivati.
- [ ] Provare backup e ripristino e distinguere sviluppo, staging e produzione.
- [ ] Eseguire il percorso completo su browser e build Android/iOS, con rete lenta, interruzione, rientro e utenti di organizzazioni diverse.
- [ ] Collaudare davvero su un manuale di 1.000 pagine scegliendone 100 e su appunti elaborati per intero.
- [ ] Preparare pipeline di rilascio, firma, build e distribuzione delle app; verificare anche i dispositivi reali.
- [ ] Misurare con i primi utenti tempo di revisione, errori residui, completamenti e costo per corso, oltre ai token di sviluppo.

Componenti: Celery/RabbitMQ candidati, PostgreSQL, Jest/pytest/Playwright, strumenti di build native.
Uscita: pilota ripetibile, risultati affidabili, costi osservabili e nessun passaggio chiave affidato a operazioni manuali nascoste.

## Struttura iniziale del repository

```text
apps/
  learner/                  app universale per allievo, con target web/iOS/Android
  studio/                   creazione e revisione responsive, con integrazione nell'app
packages/
  contracts/                schema corso, fonti, selezioni, esami e fixture comuni
  learning-engine/          avanzamento e prerequisiti, senza UI o storage
  assessment-engine/        banca, quote, correzione e politiche delle prove
  review-engine/            errori e ripasso distanziato
  course-player/            componenti slide/esercizi e layout adattivi
  course-editor/            blocchi, modifiche e ponte verso l'editor DOM
  platform-adapters/        storage, file, voce e differenze web/native
  organizations/            ruoli, classi e assegnazioni
  reporting/                risultati e viste gestionali
services/
  api/                      accesso, corsi, versioni, assegnazioni e pubblicazione
  document-processing/      conversione, selezione, OCR, tabelle, figure e provenienza
  course-generation/        analisi, programma, lezioni, domande e verifica
  jobs/                     code, checkpoint e budget
database/
  migrations/
  tests/
tests/
  corpus/                   documenti campione e risposte attese
  end-to-end/
docs/
  decisions/                scelte motivate, versioni e licenze
```

Le cartelle esprimono responsabilità; non impongono microservizi separati. Nel codice di generazione, parser, selezione, copertura, pianificazione, produzione e verifica hanno moduli distinti. Quando una terza funzione usa lo stesso stato, lo stato e le regole escono dal componente con test propri.

## Prima consegna verticale

Completare prima un percorso ridotto che attraversi i moduli necessari:

1. Caricamento PDF e selezione tutto/intervallo con anteprima.
2. Estrazione delle sole pagine scelte e programma basato sulle fonti.
3. Generazione di un modulo con slide e quiz Civis.
4. Modifica di un blocco, approvazione e pubblicazione.
5. Svolgimento dello stesso corso su app e web.
6. Esame con soglia, risultato salvato e sblocco verificato.
7. Assegnazione a una classe e risultato visibile al responsabile.

Questa consegna dimostra il collegamento reale tra i componenti. La gestione completa di tutti i formati, esercizi e report si amplia dopo, sugli stessi contratti.

## Regole di consegna

- Prima test del comportamento attuale, poi estrazione, poi stessi test, poi commit; un'estrazione per commit.
- Non mescolare refactoring e nuove funzionalità o correzioni collaterali.
- Worker uno alla volta, salvo aree realmente disgiunte; ogni brief specifica file e criterio di completamento.
- Ogni brief include: «Se la soluzione indicata non è praticabile, fermati e riferisci invece di improvvisare».
- Ogni consegna dichiara cosa potrebbe renderla inerte e verifica il percorso utente che la rende raggiungibile.
- Contratti esterni e vincoli live si leggono alla fonte; i vecchi file SQL non certificano lo stato del database.
- Le regole di qualità derivanti da difetti reali diventano controlli automatici quando praticabile.

## Fonti tecniche consultate

- [React Native for Web](https://necolas.github.io/react-native-web/)
- [Expo: sviluppo web](https://docs.expo.dev/workflow/web/) e [componenti DOM nelle app native](https://docs.expo.dev/guides/dom-components/)
- [Docling](https://github.com/docling-project/docling), [chunking](https://docling-project.github.io/docling/concepts/chunking/) e [DocumentConverter/page_range](https://docling-project.github.io/docling/reference/document_converter/)
- [olmOCR](https://github.com/allenai/olmocr)
- [PDF.js](https://github.com/mozilla/pdf.js) e [API del documento, incluse etichette delle pagine](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
- [LibreOffice](https://github.com/LibreOffice/core)
- [Tiptap](https://github.com/ueberdosis/tiptap)
- [FastAPI](https://github.com/fastapi/fastapi), [Pydantic](https://github.com/pydantic/pydantic), [Zod](https://github.com/colinhacks/zod)
- [Supabase](https://github.com/supabase/supabase), [pgvector](https://github.com/pgvector/pgvector)
- [Celery](https://github.com/celery/celery), [RabbitMQ](https://github.com/rabbitmq/rabbitmq-server)
- [Playwright](https://github.com/microsoft/playwright)
- [H5P Course Presentation](https://h5p.org/presentation) e [licenze](https://h5p.org/licensing)
- [Adapt Authoring](https://github.com/adaptlearning/adapt_authoring), [eXeLearning](https://github.com/exelearning/exelearning), [Moodle](https://github.com/moodle/moodle)
- [Frappe Learning](https://github.com/frappe/lms) e [gestione dei gruppi](https://docs.frappe.io/learning/create-a-batch)
- [Open edX](https://github.com/openedx/openedx-platform), [Unstructured](https://github.com/Unstructured-IO/unstructured), [Haystack](https://github.com/deepset-ai/haystack)

La ricerca è una ricognizione documentale. I candidati non sono stati installati o confrontati sperimentalmente in questa attività; versioni e dipendenze saranno fissate con le prove descritte.
