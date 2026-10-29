# Niente fogli di calcolo come fonte

Decisione del 29 ottobre 2026, presa con Federico.

## Decisione

XLSX e CSV non sono ammessi come materiale da cui generare corsi, in nessuna delle due modalità (Studio e Formazione, [decisione 003](003-due-modalita.md)). Restano PDF, DOCX, TXT e Markdown.

**Motivo:** con un foglio di dati sarebbe facile «barare».

È una decisione a sé, non una riga della 003: vale per entrambe le modalità e riguarda il motore comune, non chi garantisce la qualità.

## Come è applicata

- Il caricamento rifiuta un foglio di calcolo con 422 e il messaggio «Formato non supportato: i fogli di calcolo (XLSX, CSV) non sono ammessi come fonte.», per estensione e, qualunque sia l'estensione, per contenuto (un archivio con `xl/workbook.xml`).
- Un documento XLSX o CSV salvato prima della decisione non si riapre: l'estrazione risponde con lo stesso errore.
- Il selettore dell'app non propone più questi formati; il server resta comunque il controllo che decide.
- Il documento del corpus `07-istat-asi-2024-d08` è nella sezione `esclusi` del manifest; i file restano su disco.

## Limite noto

Un CSV rinominato in `.txt` è testo semplice e non si distingue da un testo qualunque senza rifiutare anche testi legittimi: viene accettato come testo.
