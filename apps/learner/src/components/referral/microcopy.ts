/**
 * Microcopy per il programma Referral "Invita un amico" (TASK-14).
 * Merge ufficiale con ordini/TASK-14_microcopy_chatgpt.md (testi ChatGPT prevalenti).
 */
export const REFERRAL_MICROCOPY = {
  // Area 3 — Referral (ChatGPT)
  'referral.title': 'Invita un amico',
  'referral.badge': 'Invita un amico',
  'referral.subtitle':
    'Per ogni amico che si registra con il tuo codice, ottieni uno slot corso in più.',
  'referral.codeLabel': 'Il tuo codice invito personale',
  'referral.ctaCopy': 'Copia codice',
  'referral.copiedToast': 'Codice copiato',
  'referral.ctaShare': 'Condividi il tuo invito',
  'referral.shareMessage': (code: string, url: string) =>
    `Sto usando questa app per studiare. Registrati con il mio codice ${code} e iniziamo! ${url}`,
  'referral.statsTitle': 'I tuoi inviti',
  'referral.statAccredited': 'Registrazioni completate',
  'referral.statExtra': 'Slot bonus ottenuti',
  'referral.statCap': (cap: number) => `Tetto massimo: ${cap} corsi`,
  'referral.historyTitle': 'I tuoi inviti',
  'referral.historyEmpty':
    'Condividi il tuo codice: qui vedrai le registrazioni dei tuoi amici.',
  'referral.ctaRedeem': 'Hai un codice invito? Collegalo qui',

  // Riscatto Codice / Modalità
  'redeem.modalTitle': 'Hai un codice invito?',
  'redeem.inputPlaceholder': 'Es. REF-XXXXXXXX',
  'redeem.ctaSubmit': 'Collega codice',
  'redeem.hint':
    'Inserisci il codice ricevuto per collegare il tuo account a chi ti ha invitato.',

  // Esiti Riscatto (ChatGPT)
  'redeem.outcome.ACCREDITATO': 'Codice collegato. Buon inizio!',
  'redeem.outcome.GIA_ACCREDITATO': 'Hai già collegato un codice invito per questo account.',
  'redeem.outcome.AUTO_INVITO': 'Non puoi usare il tuo codice invito.',
  'redeem.outcome.EMAIL_GIA_REGISTRATA': 'Questo indirizzo email è già registrato.',
  'redeem.outcome.FINESTRA_SCADUTA': 'Il codice invito va inserito al momento della registrazione.',
  'redeem.outcome.TETTO_RAGGIUNTO': 'Chi ti ha invitato ha già raggiunto il massimo di inviti disponibili.',
  'redeem.outcome.UNKNOWN': 'Codice non riconosciuto. Controlla e riprova.',

  // Errori diretti ChatGPT
  'referral.invite.title': 'Invita un amico',
  'referral.invite.body': 'Per ogni amico che si registra con il tuo codice, ottieni uno slot corso in più.',
  'referral.invite.shareCta': 'Condividi il tuo invito',
  'referral.invite.copyCode': 'Copia codice',
  'referral.invite.copied': 'Codice copiato',
  'referral.invite.shareMessage': (code: string) =>
    `Sto usando questa app per studiare. Registrati con il mio codice ${code} e iniziamo!`,
  'referral.invite.codeLabel': (code: string) => `Il tuo codice: ${code}`,
  'referral.status.title': 'I tuoi inviti',
  'referral.status.earned': (n: number) => `Slot bonus ottenuti: ${n}`,
  'referral.status.registered': (n: number) => `Registrazioni completate: ${n}`,
  'referral.status.pending': (nome: string) => `In attesa che ${nome} si registri`,
  'referral.status.empty': 'Condividi il tuo codice: qui vedrai le registrazioni dei tuoi amici.',
  'referral.redeem.title': 'Hai un codice invito?',
  'referral.redeem.body': 'Inserisci il codice ricevuto per collegare il tuo account a chi ti ha invitato.',
  'referral.redeem.cta': 'Collega codice',
  'referral.redeem.success': 'Codice collegato. Buon inizio!',
  'referral.error.alreadyRedeemed': 'Hai già collegato un codice invito per questo account.',
  'referral.error.selfReferral': 'Non puoi usare il tuo codice invito.',
  'referral.error.invalidCode': 'Codice non riconosciuto. Controlla e riprova.',
  'referral.error.windowExpired': 'Il codice invito va inserito al momento della registrazione.',
  'referral.error.emailAlreadyRegistered': 'Questo indirizzo email è già registrato.',
  'referral.error.capReached': 'Chi ti ha invitato ha già raggiunto il massimo di inviti disponibili.',
};
