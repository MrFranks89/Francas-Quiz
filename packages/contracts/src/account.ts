import { z } from 'zod';

export const PianoSchema = z.enum(['base', 'pro']);
export type Piano = z.infer<typeof PianoSchema>;

export const UtenteVistaSchema = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  nome_visualizzato: z.string().max(40).nullable(),
  piano_effettivo: PianoSchema,
  limite_base: z.number().int().nonnegative().nullable(),
  corsi_extra_referral: z.number().int().nonnegative(),
  limite_effettivo: z.number().int().nonnegative().nullable(),
  corsi_usati: z.number().int().nonnegative(),
  auth_required: z.boolean(),
});
export type UtenteVista = z.infer<typeof UtenteVistaSchema>;

export const CourseLimitReachedSchema = z.object({
  code: z.literal('COURSE_LIMIT_REACHED'),
  message: z.string(),
  limite_base: z.number().int().nonnegative(),
  corsi_extra_referral: z.number().int().nonnegative(),
  limite_effettivo: z.number().int().nonnegative(),
  corsi_usati: z.number().int().nonnegative(),
  piano: PianoSchema,
  referral_disponibile: z.boolean(),
});
export type CourseLimitReached = z.infer<typeof CourseLimitReachedSchema>;

export const PatchMeRichiestaSchema = z.object({
  nome_visualizzato: z.string().trim().min(1).max(40),
});
export type PatchMeRichiesta = z.infer<typeof PatchMeRichiestaSchema>;

export const AccountErrorCodeSchema = z.enum([
  'AUTH_TOKEN_MISSING',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_REQUIRED_FOR_FEATURE',
  'FEATURE_NOT_ENABLED',
  'COURSE_LIMIT_REACHED',
  'RATE_LIMITED',
]);
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;
