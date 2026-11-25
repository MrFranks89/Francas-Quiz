/**
 * Microcopy per Account, Autenticazione e Limiti Corsi (TASK-14).
 * Segnaposto {chiave} predisposti per il merge finale con i testi di ChatGPT.
 */
export const ACCOUNT_MICROCOPY = {
  // Benvenuto & Auth Modal
  'auth.welcome.title': 'Accedi o Crea un Account',
  'auth.welcome.subtitle': 'Sincronizza i tuoi corsi, sfida i colleghi nei duelli e invita amici per sbloccare più corsi.',
  'auth.welcome.ctaLogin': 'Accedi con Email',
  'auth.welcome.ctaRegister': 'Crea un nuovo Account',
  'auth.welcome.guestNote': 'Puoi continuare a utilizzare l’app in locale senza account.',

  // Login
  'auth.login.title': 'Accedi al tuo Account',
  'auth.login.emailPlaceholder': 'La tua email',
  'auth.login.passwordPlaceholder': 'Password',
  'auth.login.ctaSubmit': 'Entra',
  'auth.login.forgotPassword': 'Password dimenticata?',
  'auth.login.noAccount': 'Non hai ancora un account? Registrati',

  // Registrazione
  'auth.register.title': 'Crea il tuo Account',
  'auth.register.namePlaceholder': 'Nome visualizzato (opzionale, max 40 car.)',
  'auth.register.emailPlaceholder': 'La tua email istituzionale o personale',
  'auth.register.passwordPlaceholder': 'Scegli una password sicura (min 6 car.)',
  'auth.register.referralPlaceholder': 'Codice invito (opzionale, es. REF-XXXXXXXX)',
  'auth.register.ctaSubmit': 'Crea Account',
  'auth.register.hasAccount': 'Hai già un account? Accedi',

  // Verifica Email
  'auth.verify.title': 'Controlla la tua Email',
  'auth.verify.description': 'Ti abbiamo inviato un link di conferma. Aprilo per attivare il tuo profilo.',
  'auth.verify.ctaDone': 'Ho verificato l’email, continua',

  // Reset Password
  'auth.reset.title': 'Ripristina Password',
  'auth.reset.description': 'Inserisci l’indirizzo email associato al tuo profilo per ricevere le istruzioni di reset.',
  'auth.reset.ctaSubmit': 'Invia link di ripristino',
  'auth.reset.backToLogin': 'Torna al Login',

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
  'profile.logout': 'Disconnetti account',
  'profile.logoutWarning': 'Disconnettendoti, tornerai alla modalità locale. I corsi associati all’account resteranno al sicuro sul cloud.',

  // Limiti Corsi
  'limit.banner.info': (used: number, limit: number) => `${used} di ${limit} corsi usati`,
  'limit.blocked.title': 'Hai raggiunto il limite di corsi disponibili',
  'limit.blocked.descWithReferral': 'Il tuo piano include un numero limitato di corsi. Invita un amico per sbloccare +1 corso gratuito subito!',
  'limit.blocked.descWithoutReferral': 'Hai raggiunto la capacità massima di corsi per il tuo account. Passa a Pro per corsi illimitati.',
  'limit.cta.invite': 'Invita un amico (+1 corso)',
  'limit.cta.upgrade': 'Passa a Pro',
};
