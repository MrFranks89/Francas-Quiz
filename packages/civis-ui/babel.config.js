// Configurazione Babel usata solo da Jest dentro questo pacchetto: è la stessa
// di Civis (CivicaApp/babel.config.js), così i file copiati vengono trasformati
// come nel progetto d'origine. Metro dell'app Expo non la legge: Babel cerca
// babel.config.js solo nella radice da cui parte (apps/learner).
module.exports = {
  presets: ['module:@react-native/babel-preset'],
};
