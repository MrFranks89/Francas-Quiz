export type VoiceMode = 'voice' | 'mic' | 'text';
export type VoiceStatus = 'idle' | 'recording' | 'review' | 'analyzing' | 'analyzed';

export interface VoiceRecallReport {
  transcript: string;
  score: number;
  covered: string[];
  missing: string[];
  advice: string;
  warnings?: string[];
}
