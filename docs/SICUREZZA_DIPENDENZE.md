# Verifica dipendenze JavaScript — 15 ottobre 2026

Audit finale salvato in `.cache/qa/npm-audit.final.json`: **22 pacchetti segnalati, 15 high, 7 moderate, 0 critical**. Sono tre advisory di origine propagati lungo le dipendenze; non 22 difetti indipendenti. L'audit non è stato disattivato o filtrato.

| Origine | Catena verificata con npm explain | Stato alla verifica |
|---|---|---|
| braces 3.0.3 | Expo/Metro → metro-file-map → micromatch → braces | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): ricorsione profonda nei pattern può esaurire lo stack; tutte le versioni fino a 3.0.3 coinvolte, nessuna versione corretta indicata. Il registro npm indica ancora 3.0.3 come ultima. |
| node-forge 1.4.0 | Expo CLI e code-signing-certificates → node-forge | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): verifica RSA può accettare strutture ASN.1 annidate non valide; nessuna versione corretta indicata. Il registro npm indica ancora 1.4.0 come ultima. |
| uuid 7.0.3 | Expo config-plugins → xcode 3.0.1 → uuid | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): limiti dei buffer nelle API v3/v5/v6; fix dichiarato 11.1.1. xcode usa soltanto `require('uuid').v4()` senza buffer, ma il pacchetto installato rimane segnalato e non è dichiarato corretto. |

Queste catene appartengono agli strumenti Expo/Metro, alla configurazione dei progetti nativi e alla firma. Non ne segue automaticamente che siano sfruttabili dall'interfaccia del corso, né che siano innocue: l'esposizione dipende da pattern, certificati e progetti forniti a tali strumenti. Il server di sviluppo va mantenuto locale; evitare configurazioni e progetti non fidati e verificare gli aggiornamenti upstream prima del rilascio pubblico.

Non è stato eseguito `npm audit fix --force`: proponeva Expo 44 e React Native 0.72, incompatibili con l'attuale SDK 57 / RN 0.86. È stato provato un override mirato xcode→uuid 11.1.1, dopo aver verificato sul registro il supporto CommonJS. npm ha mantenuto uuid 7.0.3 e non ha applicato l'override anche con risoluzione esplicita workspace e rigenerazione del lockfile. Quindi il tentativo è stato annullato: nessun override inefficace rimane nel progetto. Non è stata modificata manualmente la risoluzione nel lockfile.

`package.json` e `package-lock.json` non hanno differenze Git rispetto allo stato precedente; il lockfile è stato ripristinato dalla copia precedente, con SHA256 identico `DCA564115AABEC86447BFE2B4EC4EDED477479EF1FFF413FEF76F966DF6F6C75`. SHA256 del manifest corrente: `86AE41AC714CB015E51AF93A539C0720E3DCDEA082B5851CDFDC021A5C264FF3`.

Controlli dopo il ripristino: 117 test JavaScript passati, typecheck pulito, `expo install --check` conferma compatibilità delle dipendenze. L'export multipiattaforma verifica bundle JavaScript web/Android/iOS; non equivale a una compilazione o prova di APK/IPA. Il prossimo intervento sarà verificare release upstream corrette, oppure isolare una riproduzione del problema npm prima di tentare un nuovo override: il rischio residuo resta aperto.
