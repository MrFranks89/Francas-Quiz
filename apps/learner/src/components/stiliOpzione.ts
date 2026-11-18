import type { usePalette } from '@formazione/civis-ui/src/ThemeProvider';
import type { OptSt } from '@formazione/civis-ui/src/comune/OptLetter';

/**
 * Colori di un'opzione per stato visivo, condivisi dalle viste del test
 * (ExamView) e dell'accoppiamento (AccoppiamentoView). Funzione pura:
 * la tavolozza arriva dal chiamante, che la legge dal tema.
 */

export type Palette = ReturnType<typeof usePalette>;

export function coloriOpzione(C: Palette, stato: OptSt) {
  if (stato === 'sel') return { borderColor: C.selBorder, backgroundColor: C.selBg, text: C.text };
  if (stato === 'cor')
    return { borderColor: C.green, backgroundColor: C.greenBg, text: C.greenText };
  if (stato === 'wr') return { borderColor: C.red, backgroundColor: C.redBg, text: C.redText };
  if (stato === 'dim')
    return { borderColor: C.borderSubtle, backgroundColor: C.surfaceDark, text: C.textDim };
  return { borderColor: C.slate, backgroundColor: C.surfaceDark, text: C.optionText };
}

export const descriviStato = (stato: OptSt) =>
  stato === 'cor' ? ', giusta' : stato === 'wr' ? ', sbagliata, la tua risposta' : '';
