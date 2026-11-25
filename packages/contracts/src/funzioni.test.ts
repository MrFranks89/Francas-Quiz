import { describe, expect, it } from 'vitest';
import { FunzioniResponseSchema } from './funzioni';

describe('Funzioni Contracts', () => {
  it('valida la risposta del catalogo funzioni', () => {
    const res = {
      piano: 'base',
      funzioni: [
        {
          chiave: 'gamification',
          livello: 'base',
          descrizione: 'XP, streak e flashcard',
          attiva: true,
        },
        {
          chiave: 'gioco_gruppo_sfida',
          livello: 'pro',
          descrizione: 'Sfide multiplayer',
          attiva: false,
        },
      ],
    };
    const parsed = FunzioniResponseSchema.parse(res);
    expect(parsed.piano).toBe('base');
    expect(parsed.funzioni).toHaveLength(2);
    expect(parsed.funzioni[0].attiva).toBe(true);
    expect(parsed.funzioni[1].attiva).toBe(false);
  });
});
