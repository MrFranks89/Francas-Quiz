/**
 * Microcopy per il modulo Duello Asincrono Pro (TASK-14).
 * Merge ufficiale con ordini/TASK-14_microcopy_chatgpt.md (testi ChatGPT prevalenti).
 */
export const DUELS_MICROCOPY = {
  // Guardia Pro
  'guard.title': 'Duelli tra Colleghi',
  'guard.proBadge': 'MODALITÀ PRO',
  'guard.description':
    'Crea un duello su questo corso: 10 domande, 15 minuti di tempo. Chi risponde meglio vince.',
  'guard.ctaUpgrade': 'Sblocca con la Versione Pro',
  'guard.note':
    'Chi ti ha invitato usa una funzione Pro. Passa a Pro per partecipare al duello.',

  // Hub Duelli
  'hub.title': 'I Miei Duelli',
  'hub.ctaNew': '+ Lancia una Sfida',
  'hub.ctaJoin': 'Inserisci Codice Sfida',
  'hub.filterAll': 'Tutti',
  'hub.filterPending': 'In Attesa',
  'hub.filterActive': 'Aperti',
  'hub.filterCompleted': 'Completati',
  'hub.empty':
    'Non hai ancora nessun duello attivo. Crea una nuova sfida dal tuo corso preferito o inserisci un codice ricevuto!',
  'hub.vsLabel': (creator: string, opponent?: string | null) =>
    opponent ? `${creator} vs ${opponent}` : `${creator} (in attesa di sfidante)`,
  'hub.questionsCount': (count: number) => `${count} domande`,
  'hub.expiresIn': (dateStr: string) => `Scade il: ${new Date(dateStr).toLocaleDateString()}`,

  // Creazione Duello (ChatGPT)
  'create.title': 'Scegli il corso',
  'create.selectCourse': 'Seleziona il corso',
  'create.selectQuestions': (count: number) => `Numero di domande: ${count}`,
  'create.ctaGenerate': 'Crea e invita',
  'create.successTitle': 'Sfida Creata!',
  'create.successSubtitle': 'Condividi il codice con il tuo amico:',
  'create.ctaCopyCode': 'Copia codice',
  'create.ctaDone': 'Torna ai Duelli',

  // Anteprima Invito (ChatGPT)
  'invite.title': 'Sfida Ricevuta!',
  'invite.courseLabel': 'Materia del duello',
  'invite.creatorLabel': 'Sfidante',
  'invite.ctaAccept': 'Accetta la Sfida',
  'invite.noSolutionsNote':
    'Rispondi alle 10 domande entro 15 minuti. Puoi giocare quando vuoi, prima della scadenza.',

  // Giocata Duello (ChatGPT)
  'play.questionProgress': (cur: number, tot: number) => `Domanda ${cur} di ${tot}`,
  'play.timerLabel': 'Tempo rimasto',
  'play.ctaNext': 'Prossima Domanda',
  'play.ctaSubmit': 'Consegna le risposte',
  'play.confirmSubmit':
    'Sei sicuro di voler consegnare? Non potrai modificare le risposte inviate.',

  // Risultato & Due Colonne (ChatGPT)
  'result.title': 'Esito del Duello',
  'result.victory': 'Hai vinto il duello!',
  'result.defeat': 'Duello concluso',
  'result.draw': 'Pareggio!',
  'result.forfeit': 'L’avversario non ha consegnato le risposte entro il tempo previsto.',
  'result.xpEarned': (xp: number) =>
    xp === 30
      ? '+30 XP: vittoria meritata!'
      : xp === 15
        ? '+15 XP: un pareggio combattuto!'
        : xp === 5
          ? '+5 XP: ogni sfida è un’occasione per allenarsi.'
          : `+${xp} XP guadagnati!`,
  'result.scoreLabel': (correct: number, tot: number) => `${correct}/${tot} corrette`,
  'result.timeLabel': (sec: number) => `${sec} secondi`,
  'result.solutionsTitle': 'Soluzioni e Spiegazioni della Sfida',
  'result.waitingOpponent': 'In attesa che l’avversario consegni le risposte.',

  // Errori e messaggi diretti ChatGPT
  'duel.xp.win': '+30 XP: vittoria meritata!',
  'duel.xp.draw': '+15 XP: un pareggio combattuto!',
  'duel.xp.loss': '+5 XP: ogni sfida è un’occasione per allenarsi.',
  'duel.error.notEnoughQuestions': (eleggibili: number) =>
    `Servono 10 domande adatte; per questo corso ne troviamo ${eleggibili}. Genera altri quiz e riprova.`,
  'duel.error.expired': 'Questo duello è scaduto.',
  'duel.error.selfAccept': 'Non puoi accettare il duello che hai creato.',
  'duel.error.alreadyAccepted': 'Questo duello è già stato accettato.',
  'duel.error.alreadySubmitted': 'Hai già consegnato le risposte.',
  'duel.error.timeLimitExceeded': 'Il tempo per questo duello è terminato.',
  'duel.error.activeLimitReached': 'Hai già 5 duelli aperti. Concludine uno prima di crearne un altro.',
  'duel.error.notCancellable': 'Questo duello non può più essere annullato.',
  'duel.error.notFound': 'Duello non trovato.',
  'duel.error.network': 'Non è stato possibile aggiornare il duello. Controlla la rete e riprova.',
};
