# Prima versione eseguibile

Decisione del 15 ottobre 2026.

## Confini

Il primo ambiente è locale, con un solo operatore. Serve a verificare l'intero percorso documento → estrazione → bozza → corso → esame. Organizzazioni, utenti, classi, autorizzazioni e risultati certificabili richiedono successivamente persistenza e valutazione autorevole sul server.

L'interfaccia usa Expo, React Native e React Native for Web. Il contenuto e le regole sono condivisi; la selezione del file e la persistenza locale sono adattatori di piattaforma. Il bundle JavaScript per iOS non equivale a un'app installata e collaudata su iPhone.

## Codice Civis

I sette file estratti sono copie byte per byte, registrate in `packages/civis-engine/provenance.json`. Un test confronta gli hash senza richiedere il repository originale. Gli attributi Git conservano anche i fine riga originali. L'adattatore del nuovo motore invoca la valutazione Civis; le nuove regole di sbarramento vivono in `packages/learning-engine`.

Non si trapianta il componente principale di Civis. Il contratto dei corsi, l'avanzamento, il client API, la persistenza e le schermate hanno responsabilità distinte.

## Documenti e pagine

La scelta PDF usa numeri del file, estremi inclusi. Un intervallo 201–300 mantiene le fonti 201–300. Un DOCX o un foglio Excel non riceve una paginazione inventata: nella prima versione si elabora per intero e la fonte mantiene il riferimento disponibile al paragrafo o alle celle.

L'estrazione nativa permette di provare subito il percorso testuale. Non certifica di aver interpretato tabelle e immagini. OCR e analisi della struttura appartengono all'adattatore Docling, con modelli configurati separatamente. Un parser non disponibile restituisce un errore esplicito.

## Generazione

Il contenuto estratto è un dato, non un insieme di istruzioni per il sistema. La generazione usa un fornitore configurabile e restituisce una bozza da revisionare. Il corso dimostrativo è sintetico e identificato come tale.

Le fonti originali rimangono disponibili dopo la suddivisione del testo. Nessun budget autorizza a tagliare silenziosamente pagine o blocchi: il lavoro deve elaborare il perimetro dichiarato oppure segnalare il limite. La copertura dei blocchi misura il materiale passato attraverso la pipeline; non prova che ogni concetto sia spiegato correttamente.

Il formato di scambio è `Course` versione 1. La validazione strutturale viene accompagnata dai controlli su riferimenti, appartenenza delle domande, opzioni corrette e soglie. I dati generati dal backend devono essere accettati anche dal contratto TypeScript.

## Prossima frontiera

Prima di usare risultati per dipendenti o classi: identità, isolamento organizzazioni, salvataggio server, esame valutato sul server, tentativi atomici, versioni immutabili pubblicate e registro delle attività. Il client locale dimostra il comportamento didattico, ma non costituisce quella infrastruttura.
