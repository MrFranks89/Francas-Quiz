jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k, v) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k) => {
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
