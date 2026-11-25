import { describe, expect, it } from 'vitest';
import {
  EventoGamificationSchema,
  GamificationStateSchema,
  MazzoFlashcardsSchema,
} from './gamification';

describe('Gamification Contracts', () => {
  it('valida lo stato di gamification completo', () => {
    const stato = {
      schemaVersion: 1,
      extractionId: 'ext-12345',
      xp: 120,
      livello: 2,
      xpInizioLivello: 100,
      xpProssimoLivello: 300,
      streak: {
        days: 3,
        lastActivityDate: '2026-11-23',
      },
      risultatiQuiz: {
        'q-1': {
          esiti: { corrette: 2, errate: 1 },
          ultimoEsito: 'corretta',
          ultimaData: '2026-11-23',
        },
      },
      flashcards: {
        'card-node-1': {
          box: 2,
          nextDue: '2026-11-26',
        },
      },
      recordSopravvivenza: 7,
      recordTimeAttack: 15,
      mastery: { 'branch-1': 1 },
      poteri: { fiftyFifty: 3, salta: 2 },
      aggiornatoAt: '2026-11-24T10:00:00Z',
      esito: null,
    };
    const parsed = GamificationStateSchema.parse(stato);
    expect(parsed.extractionId).toBe('ext-12345');
    expect(parsed.xp).toBe(120);
    expect(parsed.streak.days).toBe(3);
  });

  it('valida ciascun tipo di evento discriminato', () => {
    // 1. quiz_completato
    const evQuiz = EventoGamificationSchema.parse({
      tipo: 'quiz_completato',
      eventId: 'ev-quiz-1234',
      clientDate: '2026-11-24',
      risultati: [{ questionId: 'q-1', corretta: true }],
    });
    expect(evQuiz.tipo).toBe('quiz_completato');

    // 2. sfida_completata
    const evSfida = EventoGamificationSchema.parse({
      tipo: 'sfida_completata',
      eventId: 'ev-sfida-123',
      clientDate: '2026-11-24',
      sfidaId: 'sfida-1',
    });
    expect(evSfida.tipo).toBe('sfida_completata');

    // 3. flashcard_valutata
    const evFc = EventoGamificationSchema.parse({
      tipo: 'flashcard_valutata',
      eventId: 'ev-fc-123456',
      clientDate: '2026-11-24',
      cardId: 'card-1',
      valutazione: 'facile',
    });
    expect(evFc.tipo).toBe('flashcard_valutata');

    // 4. recupero_completato
    const evRec = EventoGamificationSchema.parse({
      tipo: 'recupero_completato',
      eventId: 'ev-rec-12345',
      clientDate: '2026-11-24',
      scopeId: 'branch-1',
    });
    expect(evRec.tipo).toBe('recupero_completato');

    // 5. sopravvivenza_fine
    const evSop = EventoGamificationSchema.parse({
      tipo: 'sopravvivenza_fine',
      eventId: 'ev-sop-12345',
      clientDate: '2026-11-24',
      serie: 8,
    });
    expect(evSop.tipo).toBe('sopravvivenza_fine');

    // 6. time_attack_fine
    const evTa = EventoGamificationSchema.parse({
      tipo: 'time_attack_fine',
      eventId: 'ev-ta-1234567',
      clientDate: '2026-11-24',
      punteggio: 12,
      durataSecondi: 60,
    });
    expect(evTa.tipo).toBe('time_attack_fine');

    // 7. potere_usato
    const evPot = EventoGamificationSchema.parse({
      tipo: 'potere_usato',
      eventId: 'ev-pot-12345',
      clientDate: '2026-11-24',
      potere: 'fiftyFifty',
    });
    expect(evPot.tipo).toBe('potere_usato');

    // 8. mastery_avanzata
    const evMas = EventoGamificationSchema.parse({
      tipo: 'mastery_avanzata',
      eventId: 'ev-mas-12345',
      clientDate: '2026-11-24',
      scopeId: 'branch-1',
      nuovoLivello: 2,
    });
    expect(evMas.tipo).toBe('mastery_avanzata');
  });

  it('rifiuta un tipo di evento sconosciuto', () => {
    expect(() =>
      EventoGamificationSchema.parse({
        tipo: 'tipo_inventato',
        eventId: 'ev-inv-12345',
        clientDate: '2026-11-24',
      })
    ).toThrow();
  });

  it('valida il mazzo flashcard', () => {
    const mazzo = {
      oggi: '2026-11-24',
      totaleDovute: 1,
      totaleNuove: 2,
      carte: [
        {
          cardId: 'card-1',
          branchId: 'b-1',
          nodeId: 'n-1',
          fronte: 'Domanda Fronte',
          retro: 'Risposta Retro',
          fonti: [{ blockId: 'b1', ref: 'p. 1' }],
          box: 1,
          nextDue: '2026-11-24',
          nuova: false,
        },
      ],
      warnings: [],
    };
    const parsed = MazzoFlashcardsSchema.parse(mazzo);
    expect(parsed.totaleDovute).toBe(1);
    expect(parsed.carte[0].cardId).toBe('card-1');
  });
});
