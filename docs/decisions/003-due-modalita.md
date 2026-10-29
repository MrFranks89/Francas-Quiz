# Due modalità: Studio e Formazione

Decisione del 29 ottobre 2026, presa con Federico.

## Contesto

Federico non vuole creare personalmente tutti i corsi. I clienti aziendali arriverebbero su richiesta e oggi sono poco probabili; il pubblico che si serve da solo è lo studente (per esempio universitario sotto esame) che paga un abbonamento per studiare più in fretta. Quello studente **non vuole revisionare** i contenuti: vuole uno strumento che lo aiuti a prepararsi.

## Decisione

Una sola piattaforma, un solo motore (estrazione, registro dei concetti, generazione, verifiche), con **due modalità** che differiscono soprattutto per chi garantisce la qualità.

| | **Studio** (studente, abbonamento) | **Formazione** (aziende, su richiesta) |
|---|---|---|
| Materiale | Caricato dallo studente: dispense, libro, appunti, foto | Caricato da noi o dal formatore |
| Garanzia | Verifiche automatiche severe, fonte sempre visibile, segnalazione degli errori | Revisione e approvazione umana |
| Formato | Quiz, ripasso, simulazione d'esame, domande aperte; slide e schede facoltative | Corso strutturato, sbarramenti, risultati, attestati |
| Organizzazioni e classi | No | Sì |

**Si costruisce prima Studio.** Formazione è la stessa piattaforma con la revisione obbligatoria accesa, usata da noi quando arriva un cliente. Organizzazioni, classi, assegnazioni e attestati (roadmap fasi 8 e 9) sono rimandati finché non c'è un cliente aziendale reale.

## Regole per Studio

1. **Niente revisione umana obbligatoria, ma verifiche più severe.** Il verificatore cieco (un secondo modello risponde leggendo solo la fonte citata) è obbligatorio: una domanda che non lo supera **non viene mostrata**. Meglio meno domande che domande sbagliate.
2. **Fonte a un tocco**: ogni domanda rimanda alla pagina del materiale dello studente.
3. **Pulsante «Questa domanda è sbagliata»**: lo studente segnala e può proporre la correzione.
   - La correzione vale solo per la sua copia; non cambia ciò che vedono altri senza un controllo.
   - Ogni segnalazione è salvata con la correzione proposta: è la misura principale degli errori sfuggiti.

## Conservazione e riuso dei corsi

- **Tutti i corsi generati sono conservati nel nostro database** (sincronizzazione, misure, riuso, Formazione).
- **Riuso ammesso:**
  - stesso file identico (stessa impronta), stessa selezione e configurazione: si riusa il corso già generato invece di rigenerarlo;
  - fonti pubbliche e libere (leggi, normative, documenti con licenza aperta): catalogo riusabile da tutti;
  - appunti propri che lo studente sceglie esplicitamente di mettere in comune.
- **Riuso escluso:** mostrare a uno studente contenuti generati dal materiale protetto di un altro studente perché «simili». Motivi:
  - legale: sarebbe una distribuzione di elaborazioni di opere altrui; il testo generato dall'AI resta un'elaborazione del libro e i diritti dell'autore permangono;
  - tecnico: la domanda non sarebbe più verificabile sul materiale dello studente.
- **Da fare prima del lancio pubblico:** parere legale su conservazione, riuso per impronta identica, termini di servizio, consenso alla condivisione degli appunti e privacy (GDPR). Questa decisione registra i rischi segnalati, non sostituisce il parere.

## Domande aperte

Servono soprattutto per gli esami orali.

- **In generazione:** domanda, risposta modello e **punti chiave attesi**, ciascuno con la sua fonte. La qualità dipende dal fatto che il modello individui con precisione i punti chiave: per questo arrivano **dopo il registro dei concetti**, che è la base da cui si ricavano.
- **Verifica:** il verificatore cieco controlla che ogni punto chiave sia davvero nella fonte citata.
- **In correzione:** una chiamata breve per risposta, che riceve domanda, punti chiave e risposta dello studente, senza il libro, e indica per ogni punto: presente, parziale o mancante, con commento e pagina. Il voto è la percentuale di punti coperti, con la scala dei giudizi già in uso.
- **Costo:** stima da prezzi letti, da misurare, circa 0,0004 USD per correzione con Haiku. Per controllarlo:
  - autovalutazione gratuita come base: lo studente vede la risposta modello e spunta i punti da solo;
  - correzione AI a quota nell'abbonamento;
  - nessuna chiamata per risposte vuote o troppo brevi;
  - dettatura del telefono per l'orale.
- La valutazione AI è fallibile: ogni punto mostra la sua motivazione e la sua fonte, e c'è il pulsante «contesta la valutazione».
- Le domande aperte non entrano nella soglia degli esami a sbarramento, almeno all'inizio.
