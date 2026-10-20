// Configurazione Jest del pacchetto civis-ui, ricavata da quella di Civis
// (CivicaApp/jest.config.js, commit db9ff48) tenendo solo ciò che serve qui.
// Stesso preset di Civis (@react-native/jest-preset, allineato a React Native
// 0.86.3 del progetto): i test originali girano nello stesso ambiente per cui
// sono stati scritti.
module.exports = {
  rootDir: __dirname,
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/'],
  // Come in Civis: AsyncStorage è pubblicato come modulo ES e va transpilato.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage)/)',
  ],
  // Senza cache di Jest (prima esecuzione, cache svuotata) la prima prova di
  // ogni suite che disegna un componente trasforma al volo i moduli di React
  // Native che servono e supera i 5 secondi predefiniti: con --no-cache
  // ThemeProvider e stili scadevano così. Il limite più alto evita falsi rossi.
  testTimeout: 30000,
  setupFiles: [
    require.resolve('@react-native/jest-preset/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
};
