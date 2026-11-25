/**
 * Microcopy per il programma Referral "Invita un amico" (TASK-14).
 * Segnaposto {chiave} predisposti per il merge finale con i testi di ChatGPT.
 */
export const REFERRAL_MICROCOPY = {
  // Referral Card
  'referral.title': 'Invita un Amico',
  'referral.badge': 'Programma Referral',
  'referral.subtitle': 'Condividi il tuo codice con amici e colleghi. Per ogni persona che si registra e accede, ricevi +1 corso caricabile per sempre.',
  'referral.codeLabel': 'Il tuo codice invito personale',
  'referral.ctaCopy': 'Copia Codice',
  'referral.copiedToast': 'Codice copiato negli appunti!',
  'referral.ctaShare': 'Condividi Link',
  'referral.shareMessage': (code: string, url: string) =>
    `Unisciti a me su Civis Formazione per preparare concorsi e materie con quiz e flashcard! Usa il mio codice ${code} oppure registrati da qui: ${url}`,
  'referral.statsTitle': 'Le tue Statistiche',
  'referral.statAccredited': 'Registrazioni accreditate',
  'referral.statExtra': 'Corsi extra guadagnati',
  'referral.statCap': (cap: number) => `Tetto massimo: ${cap} corsi`,
  'referral.historyTitle': 'Ultime registrazioni con il tuo codice',
  'referral.historyEmpty': 'Nessun amico si è ancora registrato con il tuo codice. Condividilo ora!',
  'referral.ctaRedeem': 'Hai ricevuto un codice invito? Riscattalo qui',

  // Riscatto Codice
  'redeem.modalTitle': 'Riscatta un Codice Invito',
  'redeem.inputPlaceholder': 'Es. REF-ABCDEFGH',
  'redeem.ctaSubmit': 'Riscatta Codice',
  'redeem.hint': 'Puoi riscattare il codice entro 24 ore dalla registrazione del tuo account.',

  // Esiti Riscatto
  'redeem.outcome.ACCREDITATO': 'Codice riscattato con successo! +1 corso accreditato al tuo amico.',
  'redeem.outcome.GIA_ACCREDITATO': 'Hai già utilizzato un codice invito in precedenza.',
  'redeem.outcome.AUTO_INVITO': 'Non puoi utilizzare il tuo stesso codice invito.',
  'redeem.outcome.EMAIL_GIA_REGISTRATA': 'Questa email risulta già utilizzata in passato.',
  'redeem.outcome.FINESTRA_SCADUTA': 'La finestra di 24 ore per riscattare un codice invito è scaduta.',
  'redeem.outcome.TETTO_RAGGIUNTO': 'L’utente che ti ha invitato ha già raggiunto il tetto massimo di corsi extra.',
  'redeem.outcome.UNKNOWN': 'Codice referral non valido o sconosciuto.',
};
