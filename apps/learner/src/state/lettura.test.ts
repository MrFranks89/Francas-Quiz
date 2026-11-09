// Corsi salvati o pubblicati prima delle regole di qualità (decisione del 9 novembre 2026): in
// lettura si aprono sempre; nell'editor gli errori si vedono sotto i campi e bloccano salvataggio e
// pubblicazione. Stessa fixture di services/api/tests/test_corsi_prima_delle_regole.py.
import vecchio from '../../../../services/api/tests/fixtures/corso-prima-delle-regole.json';
import { bozzaBloccata, validaBozza } from './bozza';
import { erroriDomande, erroriSoglia } from './editor';
import { corsoDaLeggere, corsoImportato } from './lettura';

describe('lettura di un corso salvato prima delle regole di qualità', () => {
  it('importare il JSON lo mostra', () => {
    const corso = corsoImportato(JSON.stringify(vecchio));
    expect(corso.id).toBe('corso-prima-delle-regole');
    expect(corso.questions).toHaveLength(14);
  });
  it('un JSON strutturalmente rotto resta rifiutato', () => {
    const rotto = structuredClone(vecchio);
    rotto.questions[0].sourceRefs = ['inventata'];
    expect(() => corsoImportato(JSON.stringify(rotto))).toThrow();
    expect(() => corsoImportato('non è JSON')).toThrow();
  });
  it('nell editor gli errori si vedono sotto i campi e bloccano il salvataggio', () => {
    const corso = corsoDaLeggere(vecchio);
    const errori = erroriDomande(corso);
    expect(Object.keys(errori)).toEqual(['0', '7']);
    expect(errori[0].options.join()).toContain('La risposta giusta è più lunga di 1,5 volte');
    expect(errori[7].explanation.join()).toContain('«come indicato»');
    expect(bozzaBloccata(erroriSoglia(corso), errori)).toBe(true);
    expect(() => validaBozza(corso)).toThrow(/^Bozza non valida: .*1,5 volte/);
  });
});
