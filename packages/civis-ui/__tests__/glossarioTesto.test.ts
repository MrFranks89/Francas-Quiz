import {
  elencoForme, trovaOccorrenze, chiaviDefiniteIn, nuovoBudgetBlocco, applicaBudgetBlocco,
  parseDove, idCorrisponde, ordinaSignificati, Glossario,
} from '../src/glossarioTesto';

const G: Glossario = {
  collegio: {
    forme: ['collegio', 'collegi'],
    significati: [{ senso: 'il collegio elettorale', dove: ['2-3'], esempio: '' }],
  },
  'collegio uninominale': {
    forme: ['collegio uninominale', 'collegi uninominali'],
    significati: [{ senso: 'un solo eletto', dove: ['2-3'], esempio: '' }],
  },
  maggioranza: {
    forme: ['maggioranza', 'maggioranze'],
    significati: [
      {
        senso: 'la soglia di voti',
        dove: ['1-1', '2-3 › Due filosofie › «maggioranza assoluta»', '6-2 › Come si elegge › «maggioranza assoluta»'],
        esempio: '',
      },
      {
        senso: 'la maggioranza di governo',
        dove: ['2-3 › Due filosofie › «formazione delle maggioranze»', '4-2', `6-2 › L'arbitro della Repubblica`],
        esempio: '',
      },
    ],
  },
  decreto: {
    forme: ['decreto', 'decreti'],
    significati: [
      { senso: 'atto con forza di legge', dove: ['22-1 › Il decreto legge'], esempio: '' },
      { senso: 'atto amministrativo', dove: ['22-1 › Il DPCM'], esempio: '' },
    ],
  },
  vigore: {
    forme: ['vigore'],
    significati: [{ senso: 'in vigore', dove: ['1-1', '1-7', '2-*'], esempio: '' }],
  },
};

describe('elencoForme', () => {
  test('le espressioni a più parole vengono prima delle parole singole che contengono', () => {
    const forme = elencoForme(G);
    const idxUninominale = forme.findIndex(f => f.forma === 'collegio uninominale');
    const idxCollegio = forme.findIndex(f => f.forma === 'collegio');
    expect(idxUninominale).toBeLessThan(idxCollegio);
  });
});

describe('trovaOccorrenze', () => {
  test('trova una forma semplice', () => {
    const occ = trovaOccorrenze('Il collegio elegge un deputato.', G);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ chiave: 'collegio', forma: 'collegio' });
  });

  test('un\'espressione a più parole non produce anche il match della parola singola contenuta', () => {
    const occ = trovaOccorrenze('Il collegio uninominale elegge un solo deputato.', G);
    expect(occ).toHaveLength(1);
    expect(occ[0].chiave).toBe('collegio uninominale');
  });

  test('trova la forma plurale grazie a "forme"', () => {
    const occ = trovaOccorrenze('Servono maggioranze più larghe.', G);
    expect(occ.some(o => o.chiave === 'maggioranza' && o.forma === 'maggioranze')).toBe(true);
  });

  test('due occorrenze diverse della stessa voce, in ordine di posizione', () => {
    const testo = 'serve la maggioranza assoluta, poi la formazione delle maggioranze.';
    const occ = trovaOccorrenze(testo, G);
    expect(occ).toHaveLength(2);
    expect(occ[0].inizio).toBeLessThan(occ[1].inizio);
  });

  test('nessuna occorrenza in un testo senza voci', () => {
    expect(trovaOccorrenze('Il gatto dorme sul divano.', G)).toEqual([]);
  });
});

describe('chiaviDefiniteIn', () => {
  test('la voce il cui termine compare nel testo che definisce (heading/front) è esclusa', () => {
    const chiavi = chiaviDefiniteIn('🏆 Premio di maggioranza', G);
    expect(chiavi.has('maggioranza')).toBe(true);
  });

  test('testo senza il termine: nessuna chiave esclusa', () => {
    expect(chiaviDefiniteIn('Le tappe della legge', G).size).toBe(0);
  });

  test('testo assente (undefined): nessuna chiave esclusa', () => {
    expect(chiaviDefiniteIn(undefined, G).size).toBe(0);
  });
});

describe('applicaBudgetBlocco', () => {
  test('la stessa voce ripetuta due volte nel blocco resta sottolineata solo la prima', () => {
    const occ = [
      { chiave: 'maggioranza', forma: 'maggioranza', inizio: 0, fine: 11 },
      { chiave: 'maggioranza', forma: 'maggioranza', inizio: 30, fine: 41 },
    ];
    const budget = nuovoBudgetBlocco(3);
    const accettate = applicaBudgetBlocco(occ, new Set(), budget);
    expect(accettate).toHaveLength(1);
    expect(budget.restanti).toBe(2);
  });

  test('tetto di 3 per blocco: la quarta voce diversa resta esclusa', () => {
    const occ = [
      { chiave: 'a', forma: 'a', inizio: 0, fine: 1 },
      { chiave: 'b', forma: 'b', inizio: 2, fine: 3 },
      { chiave: 'c', forma: 'c', inizio: 4, fine: 5 },
      { chiave: 'd', forma: 'd', inizio: 6, fine: 7 },
    ];
    const budget = nuovoBudgetBlocco(3);
    const accettate = applicaBudgetBlocco(occ, new Set(), budget);
    expect(accettate.map(o => o.chiave)).toEqual(['a', 'b', 'c']);
    expect(budget.restanti).toBe(0);
  });

  test('il budget è condiviso fra più chiamate (più campi dello stesso blocco)', () => {
    const budget = nuovoBudgetBlocco(3);
    applicaBudgetBlocco(
      [{ chiave: 'a', forma: 'a', inizio: 0, fine: 1 }, { chiave: 'b', forma: 'b', inizio: 2, fine: 3 }],
      new Set(), budget,
    );
    const secondCampo = applicaBudgetBlocco(
      [{ chiave: 'c', forma: 'c', inizio: 0, fine: 1 }, { chiave: 'd', forma: 'd', inizio: 2, fine: 3 }],
      new Set(), budget,
    );
    expect(secondCampo.map(o => o.chiave)).toEqual(['c']);
    expect(budget.restanti).toBe(0);
  });

  test('una chiave definita in questo step (regola 4) resta sempre esclusa', () => {
    const occ = [{ chiave: 'maggioranza', forma: 'maggioranza', inizio: 0, fine: 11 }];
    const budget = nuovoBudgetBlocco(3);
    const accettate = applicaBudgetBlocco(occ, new Set(['maggioranza']), budget);
    expect(accettate).toEqual([]);
    expect(budget.restanti).toBe(3); // non consuma budget
  });
});

describe('parseDove / idCorrisponde', () => {
  test('solo id', () => {
    expect(parseDove('1-1')).toEqual({ id: '1-1', titolo: undefined, frammento: undefined });
  });
  test('id e titolo', () => {
    expect(parseDove('6-2 › Come si elegge')).toEqual({ id: '6-2', titolo: 'Come si elegge', frammento: undefined });
  });
  test('id, titolo e frammento', () => {
    expect(parseDove('2-3 › Due filosofie › «maggioranza assoluta»'))
      .toEqual({ id: '2-3', titolo: 'Due filosofie', frammento: 'maggioranza assoluta' });
  });
  test('wildcard di modulo', () => {
    expect(idCorrisponde('2-*', '2-7')).toBe(true);
    expect(idCorrisponde('2-*', '20-1')).toBe(false);
    expect(idCorrisponde('2-3', '2-3')).toBe(true);
    expect(idCorrisponde('2-3', '2-4')).toBe(false);
  });
});

describe('ordinaSignificati', () => {
  test('lezione con un solo senso: id semplice basta, va in "corrente"', () => {
    const ord = ordinaSignificati(G.vigore, '1-1');
    expect(ord.corrente).toHaveLength(1);
    expect(ord.stessaLezione).toHaveLength(0);
    expect(ord.altre).toHaveLength(0);
  });

  test('wildcard di modulo: "2-*" copre "2-7"', () => {
    const ord = ordinaSignificati(G.vigore, '2-7');
    expect(ord.corrente).toHaveLength(1);
  });

  test('lezione con due sensi in step diversi: il titolo decide qual è "corrente"', () => {
    const ord = ordinaSignificati(G.decreto, '22-1', 'Il decreto legge');
    expect(ord.corrente.map(s => s.senso)).toEqual(['atto con forza di legge']);
    expect(ord.stessaLezione.map(s => s.significato.senso)).toEqual(['atto amministrativo']);
    expect(ord.stessaLezione[0].titolo).toBe('Il DPCM');
  });

  test('lezione con frammenti nella stessa card: il frammento del testo toccato decide', () => {
    const ordAssoluta = ordinaSignificati(G.maggioranza, '2-3', 'Due filosofie', 'serve la maggioranza assoluta, per la Costituzione');
    expect(ordAssoluta.corrente.map(s => s.senso)).toEqual(['la soglia di voti']);
    expect(ordAssoluta.stessaLezione.map(s => s.significato.senso)).toEqual(['la maggioranza di governo']);

    const ordFormazione = ordinaSignificati(G.maggioranza, '2-3', 'Due filosofie', 'la formazione delle maggioranze è decisiva');
    expect(ordFormazione.corrente.map(s => s.senso)).toEqual(['la maggioranza di governo']);
    expect(ordFormazione.stessaLezione.map(s => s.significato.senso)).toEqual(['la soglia di voti']);
  });

  test('senso usato solo in altre lezioni finisce in "altre"', () => {
    const ord = ordinaSignificati(G.maggioranza, '9-9');
    expect(ord.corrente).toHaveLength(0);
    expect(ord.stessaLezione).toHaveLength(0);
    expect(ord.altre).toHaveLength(2);
  });
});
