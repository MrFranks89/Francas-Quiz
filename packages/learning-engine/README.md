# Motore di avanzamento

Funzioni pure esportate tramite `@formazione/learning-engine`. Nessuna
dipendenza UI, rete o storage; gli aggiornamenti restituiscono nuovo stato.
Lo stato appartiene a una precisa coppia corso/versione e va conservato
dal server. Non accettare completamenti o risultati autocertificati dal client.

Le lezioni del modulo devono essere completate prima dell'esame.
Il modulo successivo richiede tutti i moduli precedenti completati e i loro
esami `gate` superati. Gli esami `practice` non bloccano l'accesso.
`maxAttempts` vale per entrambe le modalità; `null` significa senza limite.
Un gate superato non si ripete; la pratica si può ripetere entro il limite.

`attemptId` identifica un invio: ripetere lo stesso payload restituisce lo
stesso stato senza consumare tentativi. Riutilizzarlo con dati differenti
è un conflitto. La persistenza server dovrà rendere questa operazione
atomica per gestire richieste contemporanee.

L'adattatore usa gli ID stabili esterni e traduce internamente opzioni e
moduli per chiamare `valutaEsame` del pacchetto Civis reale. Non modifica
nessun sorgente estratto. Le risposte mancanti contano come errate.

I test attraversano contratto, adattatore, valutazione Civis e avanzamento.
Il collegamento con pagina app/web e persistenza è ancora da implementare.
