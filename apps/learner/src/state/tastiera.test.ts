import { calcolaScrollAlFocus, comportamentoTastiera, offsetTastiera } from './tastiera';

it('usa padding su iOS, undefined su Android (gestito da ScrollView) e sul web', () => {
  expect(comportamentoTastiera('ios')).toBe('padding');
  expect(comportamentoTastiera('android')).toBeUndefined();
  expect(comportamentoTastiera('web')).toBeUndefined();
});

it('l’offset somma safe area e testata su mobile ed è zero sul web', () => {
  expect(offsetTastiera('ios', 47, 120)).toBe(167);
  expect(offsetTastiera('android', 24, 96)).toBe(120);
  expect(offsetTastiera('web', 47, 120)).toBe(0);
});

it('l’offset è intero e mai negativo', () => {
  expect(offsetTastiera('ios', 0.4, 10.3)).toBe(11);
  expect(offsetTastiera('android', -5, 2)).toBe(0);
});

it('calcola lo scostamento di scroll solo quando il campo è coperto', () => {
  // Campo a y=500, altezza 50 (fondo=550), viewport visibile 600, margine 24 -> soglia 576 -> nessun scroll
  expect(calcolaScrollAlFocus(500, 50, 600, 24)).toBe(0);

  // Campo a y=560, altezza 50 (fondo=610), viewport visibile 600, margine 24 -> soglia 576 -> serve scroll di 34 px
  expect(calcolaScrollAlFocus(560, 50, 600, 24)).toBe(34);

  // Campo abbondantemente coperto a y=700, altezza 50 (fondo=750), viewport visibile 500, margine 24 -> soglia 476 -> scroll 274 px
  expect(calcolaScrollAlFocus(700, 50, 500, 24)).toBe(274);
});
