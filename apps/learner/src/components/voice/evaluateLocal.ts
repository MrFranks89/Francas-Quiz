import type { VoiceRecallReport } from './types';

export function evaluateLocalTranscript(
  rawText: string,
  targetKeywords: string[],
  activeTopic: string,
): VoiceRecallReport {
  const content =
    rawText.trim() ||
    `Nell'ambito di ${activeTopic}, l'aspetto fondamentale riguarda ${targetKeywords.join(', ')}, collegando teoria e applicazione pratica.`;
  const normalized = content.toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];

  targetKeywords.forEach((kw) => {
    if (normalized.includes(kw.toLowerCase())) {
      covered.push(kw);
    } else {
      missing.push(kw);
    }
  });

  const coveredRatio = targetKeywords.length > 0 ? covered.length / targetKeywords.length : 1;
  const score = Math.min(100, Math.max(55, Math.round(coveredRatio * 45 + 55)));
  const advice =
    missing.length > 0
      ? `Buona fluidità nell'esposizione su ${activeTopic}. Per raggiungere il 100%, integra esplicitamente il concetto "${missing[0]}".`
      : `Esposizione completa e ben strutturata su ${activeTopic}: tutte le parole chiave principali sono state citate con chiarezza.`;

  return {
    score,
    transcript: content,
    covered,
    missing,
    advice,
  };
}
