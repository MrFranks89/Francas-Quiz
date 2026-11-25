/**
 * Microcopy per il modulo Duello Asincrono Pro (TASK-14).
 * Segnaposto {chiave} predisposti per il merge finale con i testi di ChatGPT.
 */
export const DUELS_MICROCOPY = {
  // Guardia Pro
  'guard.title': 'Duelli tra Colleghi',
  'guard.proBadge': 'MODALITÀ PRO',
  'guard.description': 'Sfida colleghi e compagni di studio su set di domande mirate. Consegna quando vuoi entro 72 ore e scopri chi ottiene il punteggio migliore.',
  'guard.ctaUpgrade': 'Sblocca con la Versione Pro',
  'guard.note': 'La versione Pro include sfide asincrone, Live Arena e corsi illimitati.',

  // Hub Duelli
  'hub.title': 'I Miei Duelli',
  'hub.ctaNew': '+ Lancia una Sfida',
  'hub.ctaJoin': 'Inserisci Codice Sfida',
  'hub.filterAll': 'Tutti',
  'hub.filterPending': 'In Attesa',
  'hub.filterActive': 'Aperti',
  'hub.filterCompleted': 'Completati',
  'hub.empty': 'Non hai ancora nessun duello attivo. Crea una nuova sfida dal tuo corso preferito o inserisci un codice ricevuto!',
  'hub.vsLabel': (creator: string, opponent?: string | null) =>
    opponent ? `${creator} vs ${opponent}` : `${creator} (in attesa di sfidante)`,
  'hub.questionsCount': (count: number) => `${count} domande`,
  'hub.expiresIn': (dateStr: string) => `Scade il: ${new Date(dateStr).toLocaleDateString()}`,

  // Creazione Duello
  'create.title': 'Crea un Duello Asincrono',
  'create.selectCourse': 'Seleziona il corso',
  'create.selectQuestions': (count: number) => `Numero di domande: ${count}`,
  'create.ctaGenerate': 'Genera Sfida e Codice',
  'create.successTitle': 'Sfida Creata!',
  'create.successSubtitle': 'Condividi questo codice con il collega che vuoi sfidare:',
  'create.ctaCopyCode': 'Copia Codice Sfida',
  'create.ctaDone': 'Torna ai Duelli',

  // Anteprima Invito
  'invite.title': 'Sfida Ricevuta!',
  'invite.courseLabel': 'Materia del duello',
  'invite.creatorLabel': 'Sfidante',
  'invite.ctaAccept': 'Accetta la Sfida',
  'invite.noSolutionsNote': '🔒 Le domande verranno mostrate senza soluzioni durante la prova.',

  // Giocata Duello
  'play.questionProgress': (cur: number, tot: number) => `Domanda ${cur} di ${tot}`,
  'play.timerLabel': 'Tempo rimasto',
  'play.ctaNext': 'Prossima Domanda',
  'play.ctaSubmit': 'Consegna Prova',
  'play.confirmSubmit': 'Sei sicuro di voler consegnare? Non potrai modificare le risposte inviate.',

  // Risultato & Due Colonne
  'result.title': 'Esito del Duello',
  'result.victory': '🏆 Vittoria!',
  'result.defeat': 'Sconfitta',
  'result.draw': '🤝 Pareggio',
  'result.forfait': 'Vittoria per abbandono dell’avversario',
  'result.xpEarned': (xp: number) => `+${xp} XP guadagnati!`,
  'result.scoreLabel': (correct: number, tot: number) => `${correct}/${tot} corrette`,
  'result.timeLabel': (sec: number) => `${sec} secondi`,
  'result.solutionsTitle': 'Soluzioni e Spiegazioni della Sfida',
  'result.waitingOpponent': '⏳ Hai completato la tua prova! L’esito finale e le soluzioni saranno visibili appena l’avversario avrà consegnato.',
};
