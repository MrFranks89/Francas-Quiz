# App universale di formazione

Expo SDK 57, React Native e React Native Web: stesso player per web, Android e iOS, con layout fluido per telefono, tablet e desktop.

Da root: `npm install`, `npm run web`. Server API separato sulla porta 8000. Per Android emulator il default API è `http://10.0.2.2:8000`; web e simulatore iOS usano `http://127.0.0.1:8000`. Su telefono fisico configura `EXPO_PUBLIC_API_URL` in `.env` nell'app con un indirizzo raggiungibile dal dispositivo e configura il backend di conseguenza. Non usare il server locale senza autenticazione su Internet.

`npm run android` e `npm run ios` avviano Expo per il rispettivo ambiente di sviluppo. iOS richiede macOS per una build nativa locale. Il bundle JS esportato per una piattaforma non equivale a un'app nativa installata e verificata.

## Percorsi collegati

- Materiali: file picker nativo/web → upload multipart → intervallo pagine PDF validato → preview originali → estrazione API vera. I blocchi sono mostrati 20 per volta senza eliminare il testo completo. Modificare documento, pagine o motore invalida l'estrazione precedente.
- Generazione: stato provider reale; senza chiave e modello il pulsante rimane disabilitato. Con configurazione, il server crea una bozza e la UI apre l'editor. Nessuna generazione viene simulata.
- Editor: recupero bozza tramite ID, modifica lezioni/quiz/regole esame, salvataggio con revisione, conferma esplicita e pubblicazione di uno snapshot sul server locale. I corsi JSON importati sono solo anteprime, senza pubblicazione server.
- Corso dimostrativo: sintetico e dichiarato; usa il motore Civis tramite learning-engine. Il primo test blocca il secondo modulo fino al superamento. Progressi e tentativi in AsyncStorage con chiave corso/versione, riletti tramite replay delle regole del motore.

## Verifica

Da root `npm test` e `npm run typecheck`. `npm run export:web` esporta il sito in `apps/learner/dist`. Per controllare i bundle JS nativi: `npx expo export --platform all` dalla cartella dell'app.

Non sono implementati account, isolamento aziende, classi, distribuzione store, certificazioni o sincronizzazione dei progressi sul server. La bozza recuperata per ID torna da `/drafts/{id}`; lo snapshot pubblicato è disponibile da `/courses/{id}`.
