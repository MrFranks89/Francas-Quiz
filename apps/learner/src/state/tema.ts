/**
 * Preferenza iniziale del tema. Decisione dell'utente: il tema segue il
 * sistema, con un interruttore. Il ThemeProvider copiato da Civis (copia
 * identica, non si modifica) parte da 'dark' e poi legge la preferenza
 * salvata sotto THEME_STORAGE_KEY: se ce n'è una valida, vince quella.
 *
 * Quindi, prima di montare il provider, se non c'è ancora nessuna preferenza
 * salvata se ne salva una: 'system'. Una scelta già fatta dall'utente con
 * l'interruttore non si tocca mai.
 *
 * Il valore 'system' e la lettura dalla chiave sono quelli di
 * packages/civis-ui/src/ThemeProvider.tsx (ThemeMode e l'effetto che legge
 * AsyncStorage): accetta 'light', 'dark' o 'system'.
 */
export type Archivio = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export async function preparaTemaDiSistema(
  archivio: Archivio,
  chiave: string,
): Promise<'salvato' | 'già scelto'> {
  const attuale = await archivio.getItem(chiave);
  if (attuale === 'light' || attuale === 'dark' || attuale === 'system') return 'già scelto';
  await archivio.setItem(chiave, 'system');
  return 'salvato';
}
