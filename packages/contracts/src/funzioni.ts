import { z } from 'zod';

export const FunzioneCatalogoSchema = z.object({
  chiave: z.string(),
  livello: z.enum(['base', 'pro']),
  descrizione: z.string(),
  attiva: z.boolean(),
});
export type FunzioneCatalogo = z.infer<typeof FunzioneCatalogoSchema>;

export const FunzioniResponseSchema = z.object({
  piano: z.enum(['base', 'pro']),
  funzioni: z.array(FunzioneCatalogoSchema),
});
export type FunzioniResponse = z.infer<typeof FunzioniResponseSchema>;
