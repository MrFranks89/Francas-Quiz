/**
 * Test nostro sul comportamento di src/comune/contrast.ts (copia identica da
 * Civis): in Civis la funzione è verificata solo dentro test di componenti
 * che qui non si portano.
 */
import { buttonForeground, contrastRatio } from '../../src/comune/contrast';

test('il contrasto WCAG va da 1 (stesso colore) a 21 (bianco su nero)', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrastRatio('#4f46e5', '#4f46e5')).toBe(1);
});

test('accetta la forma breve a tre cifre', () => {
  expect(contrastRatio('#fff', '#ffffff')).toBe(1);
});

test('rifiuta colori non opachi o non esadecimali', () => {
  expect(() => contrastRatio('rgba(255,255,255,0.04)', '#000')).toThrow('Expected opaque hex color');
  expect(() => contrastRatio('#12345', '#000')).toThrow();
});

test('il testo del bottone è bianco o nero, quello che contrasta di più', () => {
  expect(buttonForeground('#4f46e5')).toBe('#ffffff');
  expect(buttonForeground('#facc15')).toBe('#000000');
  expect(buttonForeground('#0b1120')).toBe('#ffffff');
  expect(buttonForeground('#f5f7fa')).toBe('#000000');
});
