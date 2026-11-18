/**
 * Regole pure per la tastiera, fuori dalla vista così si provano con Vitest.
 * iOS e Android in edge-to-edge: il sistema non ridimensiona la finestra,
 * quindi serve il padding di KeyboardAvoidingView. Sul web ci pensa il browser.
 */
export function comportamentoTastiera(os: string): 'padding' | undefined {
  return os === 'ios' || os === 'android' ? 'padding' : undefined;
}

/** Distanza dal bordo alto dello schermo al KeyboardAvoidingView: safe area più testata fissa. */
export function offsetTastiera(os: string, insetAlto: number, altezzaTestata: number): number {
  if (os !== 'ios' && os !== 'android') return 0;
  return Math.max(0, Math.round(insetAlto + altezzaTestata));
}
