# Basi dell'interfaccia da Civis

Decisione del 20 ottobre 2026.

## Decisioni dell'utente

1. **Jest è approvato**, solo per il pacchetto dell'interfaccia
   (`packages/civis-ui`). Il resto del progetto resta su Vitest.
2. **Tema chiaro e scuro**, come in Civis: segue il sistema e ha un
   interruttore.
3. **Per ora nessuna icona e nessuna emoji.** Non entrano asset PNG, il logo,
   le icone SVG di `AppIcon`, i componenti `StepIcon` ed `Emoji`. Le spunte di
   `OptMark` contano come icone.

## Strategia: copia identica più sostituti dichiarati

Tema e componenti di base si copiano da Civis (commit `db9ff48`) byte per
byte, negli stessi percorsi relativi, con i loro test originali identici. Il
modello è quello di `packages/civis-engine`: `provenance.json` registra
percorso d'origine e SHA256 di ogni copia, un test verifica gli hash senza il
repository di Civis e `.gitattributes` conserva i fine riga.

Quando un file copiato importa qualcosa che non deve entrare (icone, emoji,
dati, logo), nello stesso percorso c'è un **modulo sostitutivo nostro**,
dichiarato in `provenance.json` con `"tipo": "sostituto"` e con un commento che
dice cosa sostituisce e perché. I file copiati non si modificano mai. Dove un
test originale non è portabile identico, il test è nostro e lo dichiara.

Il test di integrità rifiuta anche i file non dichiarati: ogni file del
pacchetto è una copia, un sostituto o un file nostro.

## Esecuzione

Jest usa `@react-native/jest-preset`, lo stesso preset di Civis, allineato a
React Native 0.86.3. `npm test` esegue Vitest e poi Jest; `npm run typecheck`
controlla anche il pacchetto con il suo `tsconfig.json`.

Il lettore non usa ancora il pacchetto: lo adotterà nel passo successivo.
