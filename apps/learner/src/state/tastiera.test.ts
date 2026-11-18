import { comportamentoTastiera, offsetTastiera } from './tastiera';

it('usa padding su iOS e Android e nessun comportamento sul web', () => {
  expect(comportamentoTastiera('ios')).toBe('padding');
  expect(comportamentoTastiera('android')).toBe('padding');
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
