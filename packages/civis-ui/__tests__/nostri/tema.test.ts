/**
 * Test nostro sul comportamento di src/tema.ts (copia identica da Civis):
 * Civis non ha un test dedicato. Fissa i valori così come sono, compresi
 * quelli che sembrano incoerenti (TESTO.titolo 18 contro titoloPiccolo 20):
 * un difetto di Civis si segnala, non si corregge nella copia.
 */
import { C, RAGGIO, SPAZIO, TESTO } from '../../src/tema';

test('le dimensioni di testo restano quelle di Civis', () => {
  expect(TESTO).toEqual({
    minuto: 12, occhiello: 12, minuscolo: 13, piccolo: 14, corpoPiccolo: 15,
    corpo: 16, corpoGrande: 17, sottotitolo: 18, titoloPiccolo: 20, titolo: 18,
    titoloMedio: 26, titoloGrande: 28, titoloEnorme: 28,
  });
});

test('spazi e raggi seguono la scala di Civis', () => {
  expect(SPAZIO).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 });
  expect(RAGGIO).toEqual({ sm: 4, md: 8, lg: 12, xl: 14, pill: 20, tondo: 99 });
});

test('la tavolozza scura ha i colori principali di Civis', () => {
  expect(C.bg).toBe('#0b1120');
  expect(C.text).toBe('#f1f5f9');
  expect(C.indigo).toBe('#4f46e5');
  expect(C.green).toBe('#16a34a');
  expect(C.red).toBe('#dc2626');
  expect(Object.keys(C)).toHaveLength(41);
});
