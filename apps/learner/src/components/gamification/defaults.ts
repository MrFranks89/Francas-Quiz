import type { FlashcardItem, GameQuestion } from './types';

export const DEFAULT_QUESTIONS: GameQuestion[] = [
  {
    id: 'q-demo-1',
    prompt: 'Qual è l’obiettivo della verifica preventiva dei concetti chiave prima dei quiz?',
    options: [
      { id: 'opt-1', text: 'Individuare definizioni portanti e nessi logici' },
      { id: 'opt-2', text: 'Memorizzare passivamente il testo' },
      { id: 'opt-3', text: 'Sostituire la lettura del materiale originale' },
      { id: 'opt-4', text: 'Ignorare le fonti certificate' },
    ],
    correctOptionId: 'opt-1',
    explanation: 'La verifica preventiva serve ad ancorare i nessi concettuali prima delle prove di autovalutazione.',
  },
  {
    id: 'q-demo-2',
    prompt: 'Perché la ripetizione spaziata (SRS / Leitner) migliora l’apprendimento permanente?',
    options: [
      { id: 'opt-1', text: 'Richiama il concetto vicino alla curva dell’oblio' },
      { id: 'opt-2', text: 'Elimina del tutto la necessità di ripassare' },
      { id: 'opt-3', text: 'Riduce il punteggio XP' },
      { id: 'opt-4', text: 'Richiede sessioni di studio di 8 ore continuative' },
    ],
    correctOptionId: 'opt-1',
    explanation: 'Il richiamo attivo prima della soglia di decadimento rafforza le connessioni neurali.',
  },
  {
    id: 'q-demo-3',
    prompt: 'Quale tra questi è un principio cardine del metodo di studio sintetico e mirato?',
    options: [
      { id: 'opt-1', text: 'Autovalutazione frequente a ciclo breve' },
      { id: 'opt-2', text: 'Evitare qualsiasi feedback immediato' },
      { id: 'opt-3', text: 'Rinunciare alle mappe concettuali' },
      { id: 'opt-4', text: 'Studiare solo la vigilia dell’esame' },
    ],
    correctOptionId: 'opt-1',
    explanation: 'I cicli brevi di verifica diagnosticano tempestivamente i punti deboli del percorso.',
  },
];

export const DEFAULT_FLASHCARDS: FlashcardItem[] = [
  {
    id: 'fc-1',
    front: 'Qual è l’obiettivo della verifica preventiva dei concetti chiave?',
    back: 'Individuare subito definizioni portanti e nessi logici prima di passare ai quiz.',
    topic: 'Metodo Didattico',
  },
  {
    id: 'fc-2',
    front: 'Perché la ripetizione spaziata migliora la memoria a lungo termine?',
    back: 'Richiama il concetto vicino alla curva dell’oblio, rafforzando il recupero attivo.',
    topic: 'Scienze dell’Apprendimento',
  },
  {
    id: 'fc-3',
    front: 'A cosa servono i poteri 50/50 e Salta nei giochi di apprendimento?',
    back: 'A superare momenti di blocco senza frustrazione e mantenere vivo il ritmo dello studio.',
    topic: 'Gamification',
  },
];
