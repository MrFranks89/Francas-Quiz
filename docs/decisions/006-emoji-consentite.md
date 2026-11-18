# 006 - Emoji e icone consentite nell'interfaccia

Decisione del 18 novembre 2026 (Committente).

## Contesto

La decisione 002 (20 ottobre 2026) vietava emoji, icone e glifi nell'interfaccia, e la decisione 005 (16 novembre 2026, punto 5) lo aveva confermato. Nel frattempo la versione upstream del 18 novembre 2026 (commit `75786e8`, tema scuro e flusso di studio in tre passi) ha introdotto emoji come iconografia deliberata e diffusa: prop `icon` nei moduli di studio, badge di gamification (serie giornaliera, obiettivi), marcatori di stato nelle card.

## Decisione approvata

1. **Emoji e icone sono consentite** nell'interfaccia. Il punto 5 della decisione 005 e la parte iconografica della decisione 002 sono superati; il resto delle decisioni 002 e 005 resta in vigore.
2. **Uso sobrio e coerente:** le emoji veicolano stato e riconoscibilità delle sezioni (come nei componenti `StudyConfigCard`, `GamificationCard`, `StudyExperienceView`); non sostituiscono mai il testo — ogni controllo resta leggibile e accessibile anche senza di esse (`accessibilityLabel` testuali ovunque).
3. Il lavoro di rimozione dei simboli già pianificato (Ordine n. 2, blocco F3) è **annullato**; le stringhe esistenti restano come sono.

## Conseguenze

- I nuovi componenti possono usare emoji, con moderazione e coerenza cromatica col tema attivo.
- I test che citano stringhe con emoji non vanno più modificati per questo motivo.
