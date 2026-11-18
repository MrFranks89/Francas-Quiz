# 005 - Guscio mobile responsivo, safe area e unificazione del tema

Decisione del 16 novembre 2026.

## Contesto
La decisione 002 (20 ottobre 2026) stabiliva un tema bicolore per il lettore ma imponeva un fondo chiaro fisso (`#f3f7f8`) per gli strumenti (importazione ed editor). Inoltre, l'applicazione montava un'unica `ScrollView` radice e la `SafeAreaView` deprecata del core di React Native. Con l'adozione su smartphone Android e iOS, questo comportava:
1. Scomparsa dell'header istituzionale e della navigazione durante lo scorrimento dei contenuti.
2. Forte riverbero/stacco visivo aprendo editor e importazione in modalità scura.
3. Occlusione dei campi di digitazione ad opera della tastiera software sui form.

## Decisioni Approvate
1. **Superamento del fondo chiaro fisso per gli strumenti:** `ImportScreen`, `EditorScreen` e le card di ripresa ID bozza adottano integralmente i token di `usePalette()` (`C.surface`, `C.surfaceDark`, `C.text`, `C.border`, `C.inputBg`). La leggibilità è garantita dal rispetto rigoroso dei contrasti WCAG 2.1 AA già insiti nei token di `civis-ui`.
2. **Guscio a Viewport Fissa e Scroll Locali:** L'header istituzionale e la barra delle pillole rimangono ancorati in cima alla finestra. Ogni schermata gestisce autonomamente il proprio scorrimento e la propria vista di evitamento tastiera (`KeyboardAvoidingView`).
3. **Navigazione Orizzontale a Scorrimento Fluido:** Sotto i 600 px la riga di pillole non va a capo disordinatamente, ma scorre orizzontalmente in modo continuo.
4. **Target di Tocco Accessibili:** Nessun elemento cliccabile ha un'altezza interattiva inferiore a 44 pt (iOS) o 48 dp (Android).
5. **Permanenza del divieto di Icone ed Emoji:** Resta confermato il principio della decisione 002: nessuna emoji, nessuna icona né spunte grafiche nel codice dell'interfaccia. L'identità visiva è veicolata esclusivamente da tipografia, proporzioni e palette.
