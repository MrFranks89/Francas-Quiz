/**
 * Microcopy per Account, Autenticazione e Limiti Corsi (TASK-14).
 * Merge ufficiale con ordini/TASK-14_microcopy_chatgpt.md (testi ChatGPT prevalenti).
 */
export const ACCOUNT_MICROCOPY = {
  // Area 1 — Autenticazione (ChatGPT)
  'auth.welcome.title': 'Studia, ovunque tu sia',
  'auth.welcome.subtitle': 'Crea un account: i tuoi corsi ti seguono su ogni dispositivo.',
  'auth.welcome.ctaLogin': 'Accedi',
  'auth.welcome.ctaRegister': 'Crea un account',
  'auth.welcome.guestNote': 'I dati salvati sul dispositivo restano disponibili.',

  'auth.login.title': 'Accedi',
  'auth.login.emailPlaceholder': 'Email',
  'auth.login.passwordPlaceholder': 'Password',
  'auth.login.ctaSubmit': 'Accedi',
  'auth.login.forgotPassword': 'Reimposta la password',
  'auth.login.noAccount': 'È la prima volta? Crea un account',

  'auth.register.title': 'Crea un account',
  'auth.register.namePlaceholder': 'Nome visualizzato (opzionale)',
  'auth.register.emailPlaceholder': 'Email',
  'auth.register.passwordPlaceholder': 'Password (min 6 caratteri)',
  'auth.register.referralPlaceholder': 'Codice invito (opzionale, es. REF-XXXXXXXX)',
  'auth.register.ctaSubmit': 'Crea un account',
  'auth.register.hasAccount': 'Hai già un account? Accedi',

  'auth.verify.title': 'Controlla la tua email',
  'auth.verify.description': 'Ti abbiamo inviato un link. Aprilo per verificare l’indirizzo e continuare.',
  'auth.verify.ctaDone': 'Email verificata. Benvenuto!',

  'auth.reset.title': 'Reimposta la password',
  'auth.reset.description': 'Inserisci la tua email: ti invieremo un link per scegliere una nuova password.',
  'auth.reset.ctaSubmit': 'Invia link',
  'auth.reset.backToLogin': 'Accedi',

  // Errori e stati Auth ChatGPT
  'auth.verify.success': 'Email verificata. Benvenuto!',
  'auth.verify.expired': 'Il link è scaduto. Richiedine uno nuovo per verificare l’email.',
  'auth.verify.resend': 'Invia un nuovo link',
  'auth.password.reset.sent': 'Se l’indirizzo è registrato, riceverai un link per reimpostare la password.',
  'auth.password.reset.complete': 'Password aggiornata. Puoi accedere con la nuova password.',
  'auth.error.tokenMissing': 'Accedi per continuare.',
  'auth.error.tokenExpired': 'La sessione è scaduta. Accedi di nuovo.',
  'auth.error.invalidCredentials': 'Email o password non corrette. Riprova.',
  'auth.error.network': 'Connessione non disponibile. Controlla la rete e riprova.',
  'auth.logout.confirm.title': 'Vuoi uscire?',
  'auth.logout.confirm.body': 'I dati salvati sul dispositivo restano disponibili. Potrai ritrovarli accedendo di nuovo.',
  'auth.logout.confirm.cta': 'Esci dall’account',
  'auth.logout.success': 'Hai effettuato la disconnessione.',

  // Area 2 — Limite Corsi (ChatGPT)
  'limit.near.title': 'Ti resta uno slot',
  'limit.near.body': (usati: number, effettivo: number) => `Hai usato ${usati} corsi su ${effettivo}.`,
  'limit.banner.info': (usati: number, effettivo: number) => `Hai usato ${usati} corsi su ${effettivo}.`,
  'limit.blocked.title': 'Hai raggiunto il limite',
  'limit.blocked.descWithReferral':
    'Hai usato i corsi disponibili. Invita un amico: con la sua registrazione ottieni uno slot in più.',
  'limit.blocked.descWithoutReferral':
    'Hai usato i corsi disponibili. Elimina un corso per liberare uno slot oppure passa a Pro.',
  'limit.cta.invite': 'Invita un amico',
  'limit.cta.upgrade': 'Scopri Pro',
  'limit.course.delete.title': 'Eliminare questo corso?',
  'limit.course.delete.body': 'Il corso verrà rimosso e lo slot sarà di nuovo disponibile.',
  'limit.course.delete.confirm': 'Elimina il corso',
  'limit.course.delete.cancel': 'Annulla',

  // Profilo
  'profile.title': 'Il tuo Profilo',
  'profile.localModeBadge': 'Modalità Locale (Senza Account)',
  'profile.localModeDesc': 'I tuoi dati risiedono solo su questo dispositivo. Crea un account per abilitare il Cloud Sync e i Duelli Pro.',
  'profile.ctaConnect': 'Crea o Collega Account',
  'profile.nameLabel': 'Nome visualizzato',
  'profile.nameSave': 'Salva',
  'profile.planLabel': 'Piano attuale',
  'profile.planBase': 'Piano Base',
  'profile.planPro': 'Piano Pro Civis',
  'profile.coursesUsed': (used: number, limit: number | null) =>
    limit !== null ? `${used} di ${limit} corsi utilizzati` : `${used} corsi utilizzati (Illimitati)`,
  'profile.extraCourses': (count: number) => `+${count} corsi extra guadagnati con gli inviti`,
  'profile.logout': 'Esci dall’account',
  'profile.logoutWarning': 'I dati salvati sul dispositivo restano disponibili. Potrai ritrovarli accedendo di nuovo.',

  // Trasversali
  'common.error.generic': 'Qualcosa è andato storto. Riprova.',
  'common.error.network': 'Connessione non disponibile. Controlla la rete e riprova.',
  'common.offline.title': 'Sei offline',
  'common.offline.body': 'Alcune funzioni richiedono una connessione. Riprova quando torni online.',
};
