import { z } from 'zod';

export const REFERRAL_CODE_REGEX = /^(REF-)?[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/;

export const RegistrazioneVistaSchema = z.object({
  nome_o_iniziali: z.string(),
  data: z.string(), // ISO datetime string
});
export type RegistrazioneVista = z.infer<typeof RegistrazioneVistaSchema>;

export const ReferralStatoSchema = z.object({
  codice: z.string(),
  registrazioni_accreditate: z.number().int().nonnegative(),
  registrazioni_non_accreditate: z.number().int().nonnegative(),
  corsi_extra_guadagnati: z.number().int().nonnegative(),
  tetto_corsi_extra: z.number().int().nonnegative().nullable(),
  inviti_condivisi: z.number().int().nonnegative().nullable().optional(),
  ultime_registrazioni: z.array(RegistrazioneVistaSchema),
});
export type ReferralStato = z.infer<typeof ReferralStatoSchema>;

export const RiscattoEsitoEnum = z.enum([
  'ACCREDITATO',
  'GIA_ACCREDITATO',
  'AUTO_INVITO',
  'EMAIL_GIA_REGISTRATA',
  'FINESTRA_SCADUTA',
  'TETTO_RAGGIUNTO',
]);
export type RiscattoEsito = z.infer<typeof RiscattoEsitoEnum>;

export const RiscattoRispostaSchema = z.object({
  accreditato: z.boolean(),
  esito: RiscattoEsitoEnum,
  segnali: z.array(z.string()).default([]),
});
export type RiscattoRisposta = z.infer<typeof RiscattoRispostaSchema>;

export const RiscattoRichiestaSchema = z.object({
  codice: z.string().trim().regex(REFERRAL_CODE_REGEX, 'Formato codice referral non valido'),
});
export type RiscattoRichiesta = z.infer<typeof RiscattoRichiestaSchema>;

export const ReferralErrorCodeSchema = z.enum([
  'REFERRAL_CODE_UNKNOWN',
  'REFERRAL_ALREADY_REDEEMED',
  'REFERRAL_CODE_GENERATION_FAILED',
  'AUTH_REQUIRED_FOR_FEATURE',
]);
export type ReferralErrorCode = z.infer<typeof ReferralErrorCodeSchema>;
