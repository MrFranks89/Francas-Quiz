# Motore Civis

Prima estrazione dei moduli puri di ripasso, stato delle lezioni ed esame.
Proprietario: Federico. Fonte: repository locale `C:/Civica`, commit
`b6595b8`, directory `CivicaApp`.

I tre sorgenti e i quattro test originali sono copiati byte per byte:
`provenance.json` registra i rispettivi hash SHA256. I file originali non
sono stati modificati e questa estrazione non introduce adattamenti.

L'indice `src/index.ts` espone le funzioni al futuro lettore dei corsi.
Eseguire `npm test` e `npm run typecheck` dalla radice del workspace.
La suite originale verifica direttamente i moduli. L'integrazione nel
lettore app/web è un passo successivo: al momento non esiste ancora un
percorso utente che invoca il pacchetto.
