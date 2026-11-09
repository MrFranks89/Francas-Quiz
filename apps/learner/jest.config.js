// Configurazione Jest per i test dei componenti dell'app (file *.test.tsx).
// Stesso preset di packages/civis-ui (React Native 0.86.3): i componenti si
// disegnano con react-test-renderer. Le opzioni di Babel stanno qui e non in
// un babel.config.js, che Metro leggerebbe per costruire l'app.
// I test *.test.ts restano a Vitest (vedi vitest.config.ts).
module.exports = {
  rootDir: __dirname,
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '\.[jt]sx?$': [
      'babel-jest',
      { presets: ['module:@react-native/babel-preset'], babelrc: false, configFile: false },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
  // Come in civis-ui: a freddo la prima prova che disegna un componente
  // trasforma i moduli di React Native e supera i 5 s predefiniti.
  testTimeout: 30000,
  setupFiles: [require.resolve('@react-native/jest-preset/jest/setup.js')],
};
