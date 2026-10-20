/**
 * Impostazione dei test Jest di civis-ui. File nostro: riprende alla lettera
 * i due blocchi che servono qui da CivicaApp/jest.setup.js (commit db9ff48),
 * cioè il finto AsyncStorage e il finto useReducedMotion. Gli altri finti di
 * Civis (sintesi vocale, notifiche, pubblicità) riguardano moduli che questo
 * pacchetto non usa e non sono stati portati.
 */

/**
 * Mock condiviso di AsyncStorage per tutti i test: evita che ogni suite se lo
 * ricostruisca da sola (e diverga). In memoria, resettabile con __reset().
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(k => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k, v) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn(k => {
        delete store[k];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});
