export type ActiveGamifyMode = 'idle' | 'survival' | 'speed' | 'flashcard' | 'recovery';

export interface PowerUps {
  fiftyFifty: number;
  salta: number;
}

export interface GamificationStreak {
  days: number;
  lastActivityDate?: string;
}

export interface GameOption {
  id: string;
  text: string;
  rationale?: string;
}

export interface GameQuestion {
  id: string;
  prompt: string;
  options: GameOption[];
  correctOptionId: string;
  explanation?: string;
  difficulty?: 'base' | 'medio' | 'avanzato';
  sourceRefs?: string[];
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  topic?: string;
  intervalDays?: number;
  lastReviewed?: string;
}

export interface GamificationState {
  xp: number;
  livello: string;
  streak: GamificationStreak;
  recordSopravvivenza: number;
  recordTimeAttack: number;
  mastery: Record<string, number>;
  poteri: PowerUps;
  erroriRecenti: GameQuestion[];
}

export type GamificationEventType =
  | 'quiz_completed'
  | 'sopravvivenza_fine'
  | 'time_attack_fine'
  | 'flashcard_rated'
  | 'recovery_completed'
  | 'potere_usato'
  | 'mastery_avanzata';

export interface GamificationEvent {
  type: GamificationEventType;
  xpGained: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface VoiceRecallReport {
  transcript: string;
  score: number;
  covered: string[];
  missing: string[];
  advice: string;
  warnings?: string[];
}
