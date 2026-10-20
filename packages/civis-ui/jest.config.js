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
  setupFiles: [
    require.resolve('@react-native/jest-preset/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
};
