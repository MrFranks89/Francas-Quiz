import { z } from 'zod';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const StreakSchema = z.object({
  days: z.number().int().min(0),
  lastActivityDate: data.nullable(),
});

export const RisultatoDomandaSchema = z.object({
  esiti: z.object({ corrette: z.number().int().min(0), errate: z.number().int().min(0) }),
  ultimoEsito: z.enum(['corretta', 'errata']),
  ultimaData: data,
});

export const CartaFlashcardSchema = z.object({
  box: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  nextDue: data,
});

export const PoteriSchema = z.object({
  fiftyFifty: z.number().int().min(0),
  salta: z.number().int().min(0),
});

// ---------- Eventi ----------

const eventoBase = {
  eventId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  clientDate: data,
  clientTz: z.string().max(64).optional(),
};
const risultatoIn = z.object({ questionId: z.string().min(1).max(120), corretta: z.boolean() });

export const EventoGamificationSchema = z.discriminatedUnion('tipo', [
  z.object({
    ...eventoBase,
    tipo: z.literal('quiz_completato'),
    scopeId: z.string().max(120).optional(),
    risultati: z.array(risultatoIn).min(1).max(50),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('sfida_completata'),
    sfidaId: z.string().min(1).max(120),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('flashcard_valutata'),
    cardId: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/),
    valutazione: z.enum(['facile', 'medio', 'difficile']),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('recupero_completato'),
    scopeId: z.string().min(1).max(120),
    risultati: z.array(risultatoIn).max(50).optional(),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('sopravvivenza_fine'),
    scopeId: z.string().max(120).optional(),
    serie: z.number().int().min(0).max(200),
    risultati: z.array(risultatoIn).max(200).optional(),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('time_attack_fine'),
    scopeId: z.string().max(120).optional(),
    punteggio: z.number().int().min(0).max(200),
    durataSecondi: z.number().int().min(1).max(3600),
    risultati: z.array(risultatoIn).max(200).optional(),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('potere_usato'),
    potere: z.enum(['fiftyFifty', 'salta']),
  }),
  z.object({
    ...eventoBase,
    tipo: z.literal('mastery_avanzata'),
    scopeId: z.string().min(1).max(120),
    nuovoLivello: z.number().int().min(1).max(3),
  }),
]);
export type EventoGamification = z.infer<typeof EventoGamificationSchema>;

// ---------- Risposte ----------

export const EsitoEventoSchema = z.object({
  eventId: z.string(),
  applicato: z.boolean(),
  duplicato: z.boolean(),
  xpAccreditati: z.number().int(),
  livelloPrecedente: z.number().int(),
  livelloAttuale: z.number().int(),
  levelUp: z.boolean(),
  streakAggiornata: z.boolean(),
  warnings: z.array(z.string()),
});
export type EsitoEvento = z.infer<typeof EsitoEventoSchema>;

export const GamificationStateSchema = z.object({
  schemaVersion: z.literal(1),
  extractionId: z.string(),
  xp: z.number().int().min(0),
  livello: z.number().int().min(1),
  xpInizioLivello: z.number().int().min(0),
  xpProssimoLivello: z.number().int().nullable(),
  streak: StreakSchema,
  risultatiQuiz: z.record(z.string(), RisultatoDomandaSchema),
  flashcards: z.record(z.string(), CartaFlashcardSchema),
  recordSopravvivenza: z.number().int().min(0),
  recordTimeAttack: z.number().int().min(0),
  mastery: z.record(z.string(), z.number().int().min(0).max(3)),
  poteri: PoteriSchema,
  aggiornatoAt: z.string().nullable(),
  esito: EsitoEventoSchema.nullable().optional(),
});
export type GamificationState = z.infer<typeof GamificationStateSchema>;

export const CartaMazzoSchema = z.object({
  cardId: z.string(),
  branchId: z.string(),
  nodeId: z.string(),
  fronte: z.string(),
  retro: z.string(),
  fonti: z.array(z.object({ blockId: z.string(), ref: z.string().nullable().optional() })),
  box: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  nextDue: data,
  nuova: z.boolean(),
});
export type CartaMazzo = z.infer<typeof CartaMazzoSchema>;

export const MazzoFlashcardsSchema = z.object({
  oggi: data,
  totaleDovute: z.number().int(),
  totaleNuove: z.number().int(),
  carte: z.array(CartaMazzoSchema),
  warnings: z.array(z.string()),
});
export type MazzoFlashcards = z.infer<typeof MazzoFlashcardsSchema>;
