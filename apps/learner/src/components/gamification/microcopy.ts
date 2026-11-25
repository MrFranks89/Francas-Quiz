/**
 * Microcopy ufficiale validata da ChatGPT per il modulo Gamification e Coach Orale (TASK-12/13).
 */
export const MICROCOPY = {
  // Sopravvivenza
  'game.survival.title': 'Sopravvivenza',
  'game.survival.description': 'Rispondi finché hai vite: ogni errore ne toglie una. Supera il tuo record di risposte consecutive.',
  'game.survival.lives': (count: number) => `Cuori rimasti: ${count}`,
  'game.survival.record': (count: number) => `Nuovo record! Hai risposto correttamente ${count} volte di fila.`,

  // Time Attack
  'game.timeAttack.title': 'Corsa contro il Tempo',
  'game.timeAttack.description': 'Rispondi più che puoi prima che il tempo finisca. Le risposte corrette aggiungono 2 secondi.',
  'game.timeAttack.multiplier2': (count: number) => `Serie di ${count}: punti raddoppiati!`,
  'game.timeAttack.multiplier3': (count: number) => `Serie di ${count}: punti triplicati!`,
  'game.timeAttack.bonusSeconds': '+2 s: risposta corretta',

  // Audio / Zoom Pro
  'game.audioBlind.title': 'Sfida Audio al buio',
  'game.audioBlind.description': 'Ascolta il brano e rispondi senza vedere il testo.',
  'game.zoomIn.title': 'Dettaglio da scoprire',
  'game.zoomIn.description': 'Osserva l’immagine mentre si mette a fuoco e prova a riconoscerla il prima possibile.',

  // Mastery
  'mastery.level.beginner': 'Principiante',
  'mastery.level.growing': 'In crescita',
  'mastery.level.expert': 'Esperto',
  'mastery.level.master': 'Maestro',
  'mastery.badge.earned': (name: string) => `Badge ottenuto: ${name}`,
  'mastery.badge.topic': (topic: string) => `Argomento padroneggiato: ${topic}`,

  // Poteri
  'power.fiftyFifty.name': '50/50',
  'power.fiftyFifty.description': 'Elimina due risposte sbagliate.',
  'power.skip.name': 'Salta',
  'power.skip.description': 'Passa alla prossima domanda senza perdere la serie.',
  'power.exhausted': 'Hai esaurito questo aiuto.',

  // Streak
  'streak.kept': 'Serie mantenuta! Hai studiato anche oggi.',
  'streak.atRisk': 'La tua serie è a rischio: completa ancora un mini quiz oggi.',
  'streak.lost': 'La serie si è interrotta. Riparti con un mini quiz oggi.',
  'streak.recovered': 'Serie ripresa: continua con un mini quiz al giorno.',

  // Coach Orale Voice
  'voice.mic.ready': 'Pronto quando vuoi.',
  'voice.mic.recording': 'Sto ascoltando… Tocca per terminare.',
  'voice.mic.sending': 'Sto trascrivendo e valutando la tua esposizione…',
  'voice.error.permission': 'Non posso accedere al microfono. Controlla i permessi oppure scrivi la tua esposizione.',
  'voice.error.tooLong': 'La registrazione supera i 5 minuti. Registrane una più breve oppure scrivi la tua esposizione.',
  'voice.error.emptyTranscript': 'Non ho riconosciuto parole nella registrazione. Riprova oppure scrivi la tua esposizione.',
  'voice.cta.writeInstead': 'Scrivi invece la tua esposizione',
  'voice.report.title': 'Esito dell’esposizione',
  'voice.report.score': 'Punteggio',
  'voice.report.covered': 'Concetti espressi correttamente',
  'voice.report.missing': 'Concetti da ripassare',
  'voice.report.advice': 'Il consiglio del tutor',

  // Flashcards
  'flashcard.rating.easy': 'Facile — ripassa tra 7 giorni.',
  'flashcard.rating.medium': 'Medio — ripassa tra 3 giorni.',
  'flashcard.rating.hard': 'Difficile — ripassa tra 1 giorno.',
  'flashcard.deck.complete': 'Hai completato il mazzo. Ottimo lavoro!',

  // Recovery
  'recovery.empty': 'Nessun errore da recuperare, ottimo!',
} as const;
