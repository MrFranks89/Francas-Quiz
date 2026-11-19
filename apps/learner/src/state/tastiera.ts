/**
 * Regole pure per la tastiera, fuori dalla vista così si provano con Vitest.
 * iOS usa 'padding' di KeyboardAvoidingView.
 * Su Android (edge-to-edge / Android 14-15), 'height' collassa la ScrollView in layout
 * complessi: la strategia verificata empiricamente su Pixel 7 API 34 è 'undefined'
 * con paddingBottom dinamico su ScrollView e scroll mirato tramite calcolaScrollAlFocus.
 * Sul web ci pensa il browser.
 */
export function comportamentoTastiera(os: string): 'padding' | 'height' | undefined {
  if (os === 'ios') return 'padding';
  return undefined;
}

/** Distanza dal bordo alto dello schermo al KeyboardAvoidingView: safe area più testata fissa. */
export function offsetTastiera(os: string, insetAlto: number, altezzaTestata: number): number {
  if (os !== 'ios' && os !== 'android') return 0;
  return Math.max(0, Math.round(insetAlto + altezzaTestata));
}

/**
 * Calcola lo scostamento di scroll per portare in vista un campo testo quando la tastiera è aperta.
 * @param yInWindow Coordinata Y del campo nella finestra (da measureInWindow).
 * @param altezzaCampo Altezza del campo testo.
 * @param altezzaVisibile Altezza dell'area visibile sopra la tastiera.
 * @param margine Spazio di margine aggiuntivo desiderato sotto il campo (default 24 px).
 */
export function calcolaScrollAlFocus(
  yInWindow: number,
  altezzaCampo: number,
  altezzaVisibile: number,
  margine: number = 24,
): number {
  const fondo = yInWindow + altezzaCampo;
  const soglia = altezzaVisibile - margine;
  if (fondo > soglia) {
    return Math.round(fondo - soglia);
  }
  return 0;
}
