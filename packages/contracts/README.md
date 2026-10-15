# Contratti del corso v1

`CourseSchema` valida forma e coerenza semantica. `courseJsonSchema` esporta
solo la forma strutturale: i riferimenti incrociati devono sempre essere
controllati anche con `CourseSchema` sul server.

Gli ID delle domande sono univoci nel corso; gli ID delle opzioni nella
domanda. Le pagine delle fonti conservano il numero originale del PDF.
`page: null` rappresenta una fonte senza paginazione (es. appunti).

La selezione ha forma `{ mode: 'all' }` oppure
`{ mode: 'range', fromPage: 201, toPage: 300 }`, estremi inclusi.
`parsePageSelection` riceve le due pagine come stringhe UI e rifiuta
decimali, suffissi, spazi, valori non sicuri e intervalli fuori documento.

`passingScore` è il numero minimo di risposte corrette, non una percentuale.
La fixture è sintetica e non riproduce materiale di Civis.
