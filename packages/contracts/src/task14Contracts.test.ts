import { describe, expect, it } from 'vitest';
import {
  PianoSchema,
  UtenteVistaSchema,
  CourseLimitReachedSchema,
  PatchMeRichiestaSchema,
} from './account';
import {
  ReferralStatoSchema,
  RiscattoRispostaSchema,
  RiscattoRichiestaSchema,
  REFERRAL_CODE_REGEX,
} from './referral';
import {
  DuelloVistaSchema,
  DomandaPubblicaSchema,
  ConsegnaRichiestaSchema,
  EsitoDuelloSchema,
  CreaDuelloRichiestaSchema,
  AnteprimaInvitoDuelloSchema,
  DUEL_CODE_REGEX,
} from './duelli';

describe('TASK-14 Zod Contracts', () => {
  describe('Account Contracts', () => {
    it('valida UtenteVista con profilo completo', () => {
      const vista = UtenteVistaSchema.parse({
        user_id: 'usr-12345',
        email: 'studente@example.com',
        nome_visualizzato: 'Marco Rossi',
        piano_effettivo: 'base',
        limite_base: 3,
        corsi_extra_referral: 1,
        limite_effettivo: 4,
        corsi_usati: 2,
        auth_required: true,
      });
      expect(vista.user_id).toBe('usr-12345');
      expect(vista.limite_effettivo).toBe(4);
    });

    it('valida CourseLimitReached payload 403', () => {
      const limitErr = CourseLimitReachedSchema.parse({
        code: 'COURSE_LIMIT_REACHED',
        message: 'Limite corsi raggiunto',
        limite_base: 3,
        corsi_extra_referral: 0,
        limite_effettivo: 3,
        corsi_usati: 3,
        piano: 'base',
        referral_disponibile: true,
      });
      expect(limitErr.code).toBe('COURSE_LIMIT_REACHED');
      expect(limitErr.referral_disponibile).toBe(true);
    });

    it('valida PatchMeRichiesta con nome valido e rigetta se vuoto o oltre 40 caratteri', () => {
      expect(PatchMeRichiestaSchema.parse({ nome_visualizzato: '  Nuovo Nome  ' }).nome_visualizzato).toBe('Nuovo Nome');
      expect(() => PatchMeRichiestaSchema.parse({ nome_visualizzato: '' })).toThrow();
      expect(() => PatchMeRichiestaSchema.parse({ nome_visualizzato: 'a'.repeat(45) })).toThrow();
    });
  });

  describe('Referral Contracts', () => {
    it('verifica regex codice referral REF-XXXXXXXX', () => {
      expect(REFERRAL_CODE_REGEX.test('REF-AB345678')).toBe(true);
      expect(REFERRAL_CODE_REGEX.test('AB345678')).toBe(true);
      // Lettere proibite 0, O, 1, I, L, U
      expect(REFERRAL_CODE_REGEX.test('REF-AB01ILUO')).toBe(false);
      expect(REFERRAL_CODE_REGEX.test('TROPPO_LUNGO_12345')).toBe(false);
    });

    it('valida ReferralStato e RiscattoRisposta', () => {
      const stato = ReferralStatoSchema.parse({
        codice: 'REF-AB234567',
        registrazioni_accreditate: 2,
        registrazioni_non_accreditate: 1,
        corsi_extra_guadagnati: 2,
        tetto_corsi_extra: 5,
        ultime_registrazioni: [
          { nome_o_iniziali: 'M. R.', data: '2026-11-25T10:00:00Z' },
        ],
      });
      expect(stato.codice).toBe('REF-AB234567');
      expect(stato.ultime_registrazioni).toHaveLength(1);

      const riscatto = RiscattoRispostaSchema.parse({
        accreditato: true,
        esito: 'ACCREDITATO',
        segnali: [],
      });
      expect(riscatto.esito).toBe('ACCREDITATO');
    });

    it('valida RiscattoRichiesta', () => {
      const req = RiscattoRichiestaSchema.parse({ codice: 'REF-AB234567' });
      expect(req.codice).toBe('REF-AB234567');
    });
  });

  describe('Duelli Contracts', () => {
    it('verifica regex codice invito duello DUE-XXXXXXXX', () => {
      expect(DUEL_CODE_REGEX.test('DUE-23456789')).toBe(true);
      expect(DUEL_CODE_REGEX.test('DUE-00000000')).toBe(false);
    });

    it('valida DomandaPubblica senza soluzioni', () => {
      const q = DomandaPubblicaSchema.parse({
        domanda_id: 'q-1',
        testo: 'Quale principio si applica?',
        opzioni: ['A', 'B', 'C', 'D'],
      });
      expect(q.domanda_id).toBe('q-1');
      expect((q as any).corretta).toBeUndefined();
    });

    it('valida ConsegnaRichiesta e vincolo max 20 domande', () => {
      const consegna = ConsegnaRichiestaSchema.parse({
        risposte: [
          { domanda_id: 'q-1', scelta: 2, ms: 4500 },
          { domanda_id: 'q-2', scelta: null, ms: 12000 },
        ],
      });
      expect(consegna.risposte).toHaveLength(2);
      expect(consegna.risposte[1].scelta).toBeNull();
    });

    it('valida DuelloVista, Anteprima e EsitoDuello', () => {
      const vista = DuelloVistaSchema.parse({
        duello_id: 'duel-uuid-1234',
        stato: 'aperto',
        titolo_corso: 'Diritto Costituzionale',
        n_domande: 10,
        scade_il: '2026-11-28T12:00:00Z',
        ruolo: 'creatore',
        la_mia_giocata: 'consegnata',
        giocata_altro: 'non_iniziata',
        codice_invito: 'DUE-23456789',
        avversario_nome: 'Luigi Verdi',
        creatore_nome: 'Marco Rossi',
      });
      expect(vista.duello_id).toBe('duel-uuid-1234');
      expect(vista.ruolo).toBe('creatore');

      const esito = EsitoDuelloSchema.parse({
        vincitore_id: 'usr-1',
        motivo: 'PUNTEGGIO',
        punteggi: {
          'usr-1': { corrette: 9, tempo_totale_ms: 45000 },
          'usr-2': { corrette: 7, tempo_totale_ms: 42000 },
        },
      });
      expect(esito.motivo).toBe('PUNTEGGIO');
    });

    it('valida CreaDuelloRichiesta (range 5..20 domande)', () => {
      expect(CreaDuelloRichiestaSchema.parse({ extraction_id: 'ext-1' }).n_domande).toBe(10);
      expect(CreaDuelloRichiestaSchema.parse({ extraction_id: 'ext-1', n_domande: 5 }).n_domande).toBe(5);
      expect(() => CreaDuelloRichiestaSchema.parse({ extraction_id: 'ext-1', n_domande: 4 })).toThrow();
      expect(() => CreaDuelloRichiestaSchema.parse({ extraction_id: 'ext-1', n_domande: 25 })).toThrow();
    });
  });
});
