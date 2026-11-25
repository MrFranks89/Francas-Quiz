import { z } from 'zod';

export const DUEL_CODE_REGEX = /^(DUE-)?[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/;

export const StatoDuelloEnum = z.enum([
  'in_attesa',
  'aperto',
  'completato',
  'scaduto',
  'annullato',
]);
export type StatoDuello = z.infer<typeof StatoDuelloEnum>;

export const RuoloDuelloEnum = z.enum(['creatore', 'avversario']);
export type RuoloDuello = z.infer<typeof RuoloDuelloEnum>;

export const StatoGiocataEnum = z.enum(['non_iniziata', 'iniziata', 'consegnata']);
export type StatoGiocata = z.infer<typeof StatoGiocataEnum>;

export const MotivoEsitoEnum = z.enum([
  'PUNTEGGIO',
  'TEMPO',
  'PAREGGIO',
  'FORFAIT',
  'NULLA',
]);
export type MotivoEsito = z.infer<typeof MotivoEsitoEnum>;

export const DomandaPubblicaSchema = z.object({
  domanda_id: z.string(),
  testo: z.string(),
  opzioni: z.array(z.string()),
});
export type DomandaPubblica = z.infer<typeof DomandaPubblicaSchema>;

export const RispostaDuelloSchema = z.object({
  domanda_id: z.string(),
  scelta: z.number().int().min(0).max(9).nullable().default(null),
  ms: z.number().int().min(0).max(600000),
});
export type RispostaDuello = z.infer<typeof RispostaDuelloSchema>;

export const ConsegnaRichiestaSchema = z.object({
  risposte: z.array(RispostaDuelloSchema).max(20),
});
export type ConsegnaRichiesta = z.infer<typeof ConsegnaRichiestaSchema>;

export const ConsegnaRispostaSchema = z.object({
  corrette: z.number().int().nonnegative(),
  tempo_totale_ms: z.number().int().nonnegative(),
  duello_chiuso: z.boolean(),
});
export type ConsegnaRisposta = z.infer<typeof ConsegnaRispostaSchema>;

export const DuelloVistaSchema = z.object({
  duello_id: z.string(),
  stato: StatoDuelloEnum,
  titolo_corso: z.string(),
  n_domande: z.number().int(),
  scade_il: z.string(), // ISO datetime string
  ruolo: RuoloDuelloEnum,
  la_mia_giocata: StatoGiocataEnum,
  giocata_altro: StatoGiocataEnum.nullable().optional(),
  codice_invito: z.string().nullable().optional(),
  avversario_nome: z.string().nullable().optional(),
  creatore_nome: z.string(),
});
export type DuelloVista = z.infer<typeof DuelloVistaSchema>;

export const PunteggioGiocataSchema = z.object({
  corrette: z.number().int().nonnegative(),
  tempo_totale_ms: z.number().int().nonnegative(),
});
export type PunteggioGiocata = z.infer<typeof PunteggioGiocataSchema>;

export const EsitoDuelloSchema = z.object({
  vincitore_id: z.string().nullable(),
  motivo: MotivoEsitoEnum,
  punteggi: z.record(z.string(), PunteggioGiocataSchema),
});
export type EsitoDuello = z.infer<typeof EsitoDuelloSchema>;

export const SoluzioneDomandaSchema = z.object({
  domanda_id: z.string(),
  testo: z.string().optional(),
  opzioni: z.array(z.string()).optional(),
  correctIndex: z.number().int().optional(),
  corretta: z.number().int().optional(),
  explanation: z.string().optional(),
  spiegazione: z.string().optional(),
});
export type SoluzioneDomanda = z.infer<typeof SoluzioneDomandaSchema>;

export const DuelNotEnoughQuestionsErrorSchema = z.object({
  code: z.literal('DUEL_NOT_ENOUGH_QUESTIONS'),
  message: z.string(),
  richieste: z.number().int(),
  eleggibili: z.number().int(),
});
export type DuelNotEnoughQuestionsError = z.infer<typeof DuelNotEnoughQuestionsErrorSchema>;

export const RisultatoDuelloRispostaSchema = z.object({
  stato: StatoDuelloEnum,
  esito: EsitoDuelloSchema.nullable(),
  soluzioni: z.array(SoluzioneDomandaSchema).optional(),
});
export type RisultatoDuelloRisposta = z.infer<typeof RisultatoDuelloRispostaSchema>;

export const CreaDuelloRichiestaSchema = z.object({
  extraction_id: z.string(),
  n_domande: z.number().int().min(5).max(20).default(10),
});
export type CreaDuelloRichiesta = z.infer<typeof CreaDuelloRichiestaSchema>;

export const DuelloCreatoRispostaSchema = z.object({
  duello_id: z.string(),
  codice_invito: z.string(),
  scade_il: z.string(),
});
export type DuelloCreatoRisposta = z.infer<typeof DuelloCreatoRispostaSchema>;

export const AnteprimaInvitoDuelloSchema = z.object({
  duello_id: z.string(),
  titolo_corso: z.string(),
  n_domande: z.number().int(),
  creatore_nome: z.string(),
  scade_il: z.string(),
  stato: StatoDuelloEnum,
});
export type AnteprimaInvitoDuello = z.infer<typeof AnteprimaInvitoDuelloSchema>;

export const IniziaGiocataRispostaSchema = z.object({
  domande: z.array(DomandaPubblicaSchema),
  tempo_max_giocata_s: z.number().int(),
  iniziata_il: z.string(),
});
export type IniziaGiocataRisposta = z.infer<typeof IniziaGiocataRispostaSchema>;

export const DuelloErrorCodeSchema = z.enum([
  'DUEL_NOT_FOUND',
  'DUEL_NOT_ENOUGH_QUESTIONS',
  'DUEL_ACTIVE_LIMIT_REACHED',
  'DUEL_SELF_ACCEPT',
  'DUEL_ALREADY_ACCEPTED',
  'DUEL_EXPIRED',
  'DUEL_NOT_OPEN',
  'DUEL_NOT_STARTED',
  'DUEL_ALREADY_SUBMITTED',
  'DUEL_TIME_LIMIT_EXCEEDED',
  'DUEL_NOT_FINISHED',
  'DUEL_NOT_CANCELLABLE',
  'FEATURE_NOT_ENABLED',
  'AUTH_REQUIRED_FOR_FEATURE',
]);
export type DuelloErrorCode = z.infer<typeof DuelloErrorCodeSchema>;
