# Verifiche — 15 ottobre 2026

Stato del prototipo locale in `C:\Piattaforma Formazione`. Questo registro distingue i percorsi eseguiti dalle verifiche ancora aperte; i conteggi delle suite cambiano mentre vengono aggiunti controlli.

| Area | Verifica ed esito |
|---|---|
| Motore Civis | Test originali delle primitive estratte e controllo SHA-256 rispetto al manifest; suite TypeScript passata. Nessuna dipendenza dalla cartella originale per eseguire i test. |
| Contratti e avanzamento | Validazione corso/fonti, intervalli rigorosi, esami, tentativi, versioni e sblocco verificati automaticamente. Typecheck passato. Regressione aggiunta: un limite tentativi invalido non deve diventare `null` (illimitato) modificando un altro campo. |
| API documenti | Test HTTP con TestClient passati: formati, limiti, selezione, anteprima, persistenza ed errori. Prova sul server locale: PDF da 1.000 pagine, selezione 201–300, 100 blocchi con numerazione originale, anteprima PNG e recupero persistente. |
| OCR reale | `smoke_ocr.py` passato con modelli locali e Hugging Face offline: PDF immagine senza testo nativo → 3 blocchi, inclusa 1 tabella Markdown, provenienza pagina 1. Evidenza locale `.cache/ocr-smoke/response.json`. È un esempio sintetico, non una misura di accuratezza su manuali reali. |
| Generazione | Validazione e gestione errori testate con provider iniettato esplicitamente. Il controllo configurazione segnala chiave/modello assenti. Nessuna chiamata AI a pagamento eseguita. |
| Editor e pubblicazione | Test HTTP passati, compreso preflight CORS `PUT`. Percorso browser reale verificato: recupero bozza, modifica esame di sbarramento, salvataggio, conferma revisione e pubblicazione. Nessun errore JavaScript negli scenari controllati prima e dopo l'estrazione dell'editor in moduli. |
| Fruizione browser | Upload reale, selezione intervallo, esame fallito, nuovo tentativo, superamento, sblocco e persistenza dopo ricaricamento verificati sul percorso visibile. |
| Distribuzione | Export dei bundle web, Android e iOS riuscito. Non equivale a build APK/IPA, installazione o collaudo su dispositivi. |
| Layout mobile | Individuato e corretto il menu tagliato a 390 px. Lo stesso controllo dei rettangoli dei pulsanti è fallito prima e passato dopo; screenshot successivo verificato visivamente dalla sessione principale. Controllo finale navigazione passato a 390, 768 e 1440 px; nessun pulsante del quiz tagliato a 390 px. Non basta misurare l'overflow del documento. |
| Dipendenze Python | `pip check` passato dopo installazione ONNX Runtime. |
| Dipendenze npm | Audit finale: 22 segnalazioni (15 high, 7 moderate, nessuna critical), originate da tre advisory. Tentativi di override inefficaci annullati; manifest e lock conservati. Dettagli e limiti in [SICUREZZA_DIPENDENZE.md](SICUREZZA_DIPENDENZE.md). Compatibilità Expo, 117 test, typecheck e export di tutte le piattaforme confermati dopo il ripristino. |
| Lettore in stile Civis (20 ottobre 2026) | Prova nel browser con Playwright sul server locale (API e `expo start --web`), script e registri in `.cache/qa/lettore-civis/` (`qa-lettore.cjs`, `qa-demo.log`, `qa-reale.log`, 106 controlli passati, nessun errore JavaScript). Corso dimostrativo a 390 e 1280 px, tema chiaro e scuro dal sistema: slide una alla volta, nessun altoparlante, fonte chiusa che si apre e si richiude, test non superato con riepilogo (sbagliata scelta in rosso, giusta in verde, spiegazione, «0% · Non superato»), nuovo tentativo, superamento «100% · Perfetto», sblocco del modulo 2, riepilogo conservato dopo il ricaricamento, interruttore del tema che resta dopo il ricaricamento, azzeramento. Nel dimostrativo, con due opzioni, l'ordine del secondo tentativo coincide con il primo (dipende dal seme): l'ordine nuovo è verificato sul corso reale. Corso generato reale (`var/misure/corse/20261020-095746-20c276a6/corso.json`, 9 moduli, 40 domande) importato con «Importa corso JSON» a 1280 px scuro e 390 px chiaro: modulo 1 completo (9 slide), fonte aperta, tentativo all'85% con riepilogo nello stesso ordine visto, nuovo tentativo con 6 domande su 7 riordinate, 100% · Perfetto, azzeramento. Nessun pulsante oltre la larghezza a 390 px (controllo fallito prima della correzione delle pillole dei moduli, passato dopo). Screenshot nella stessa cartella. |

Comandi ripetibili dalla radice:

```powershell
npm test
npm run typecheck
npm run export:all
.venv/Scripts/python.exe -m pytest -c services/api/pytest.ini services/api/tests -q
.venv/Scripts/python.exe -m pip check
.venv/Scripts/python.exe services/api/tools/smoke_ocr.py
```

L'ultimo comando richiede il provisioning OCR descritto in [API.md](API.md). Le prove browser riportate sono state eseguite dalla sessione principale sul servizio locale; non sono tutte automatizzate nella suite ordinaria. Suite Python completa dopo la telemetria: **71 test passati**, `pip check` pulito. Suite TypeScript dopo i controlli degli errori API: **117 test passati**, controllo dei tipi pulito.

Restano da verificare: generazione con provider reale configurato, qualità didattica su documenti rappresentativi, scansioni difficili e tabelle complesse, matrice completa di schermi, build e comportamento su dispositivi Android/iOS. Autenticazione, organizzazioni e classi non sono dimostrate da questi controlli. Git è locale, senza remoto collegato.
