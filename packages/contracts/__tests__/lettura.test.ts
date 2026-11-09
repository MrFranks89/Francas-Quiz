// Corsi salvati o pubblicati prima delle regole di qualità di singola domanda (decisione del 9
// novembre 2026): in lettura vale solo la validazione strutturale (CorsoLeggibileSchema), in scrittura
// anche la qualità (CourseSchema). Stessa fixture di services/api/tests/test_corsi_prima_delle_regole.py.
import { readFileSync } from 'node:fs';
import { CorsoLeggibileSchema, CourseSchema } from '@formazione/contracts';

const base = new URL('../../../services/api/tests/fixtures/', import.meta.url);
const leggi = (nome: string) => JSON.parse(readFileSync(new URL(nome, base), 'utf8'));

describe('corso salvato prima delle regole di qualità', () => {
  it('si legge, ma non si salva né si pubblica', () => {
    const vecchio = leggi('corso-prima-delle-regole.json');
    expect(CorsoLeggibileSchema.safeParse(vecchio).success).toBe(true);
    const scritto = CourseSchema.safeParse(vecchio);
    expect(scritto.success).toBe(false);
    const messaggi = scritto.error!.issues.map(i => i.message).join('\n');
    expect(messaggi).toContain('La risposta giusta è più lunga di 1,5 volte');
    expect(messaggi).toContain('«come indicato»');
    expect(messaggi).toContain('«secondo il testo»');
  });

  it('i corsi validi restano validi in entrambi i modi', () => {
    for (const nome of ['generated-course.json', 'generated-course-con-scarti.json']) {
      expect(CorsoLeggibileSchema.safeParse(leggi(nome)).success, nome).toBe(true);
      expect(CourseSchema.safeParse(leggi(nome)).success, nome).toBe(true);
    }
  });
});

describe('casi condivisi', () => {
  // I casi con `rule` sono le regole di qualità: rifiutati in scrittura, accettati in lettura.
  // Tutti gli altri sono strutturali: rifiutati anche in lettura.
  type Change = { path: (string | number)[]; value: unknown };
  type Caso = (Change | { changes: Change[] }) & { rule?: string };
  const corso = leggi('generated-course.json');
  const casi = leggi('invalid-course-cases.json') as Caso[];
  const applica = (caso: Caso) => {
    const invalido = structuredClone(corso);
    for (const change of 'changes' in caso ? caso.changes : [caso]) {
      let target = invalido;
      for (const key of change.path.slice(0, -1)) target = target[key];
      target[change.path.at(-1)!] = change.value;
    }
    return invalido;
  };
  const nome = (caso: Caso) => ('changes' in caso ? caso.changes : [caso]).map(c => c.path.join('.')).join(' + ');

  it('ci sono casi di entrambi i livelli', () => {
    expect(casi.filter(c => c.rule).length).toBeGreaterThan(0);
    expect(casi.filter(c => !c.rule).length).toBeGreaterThan(0);
  });

  it('le regole di qualità non bloccano la lettura', () => {
    for (const caso of casi.filter(c => c.rule)) {
      expect(CourseSchema.safeParse(applica(caso)).success, nome(caso)).toBe(false);
      expect(CorsoLeggibileSchema.safeParse(applica(caso)).success, `${caso.rule}: ${nome(caso)}`).toBe(true);
    }
  });

  it('le regole strutturali valgono anche in lettura', () => {
    for (const caso of casi.filter(c => !c.rule)) {
      expect(CorsoLeggibileSchema.safeParse(applica(caso)).success, nome(caso)).toBe(false);
    }
  });
});
