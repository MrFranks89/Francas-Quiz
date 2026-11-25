import React from 'react';
import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { ReferralCard } from './ReferralCard';
import { RedeemCodeModal } from './RedeemCodeModal';
import { type ReferralStato } from '@formazione/contracts';
import * as referralApi from '../../api/referral';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('TASK-14: Referral Components', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
    jest.clearAllMocks();
  });

  const mockReferralStato: ReferralStato = {
    codice: 'REF-23456789',
    registrazioni_accreditate: 3,
    registrazioni_non_accreditate: 1,
    corsi_extra_guadagnati: 3,
    tetto_corsi_extra: 5,
    ultime_registrazioni: [
      { nome_o_iniziali: 'Luigi V.', data: '2026-11-24T14:30:00Z' },
      { nome_o_iniziali: 'G. B.', data: '2026-11-23T09:15:00Z' },
    ],
  };

  describe('ReferralCard', () => {
    test('mostra il codice invito personale ben visibile con pulsante copia', () => {
      act(() => {
        renderer = ReactTestRenderer.create(
          <ReferralCard stato={mockReferralStato} />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('REF-23456789');
      expect(text).toContain('Copia codice');
      expect(text).toContain('Condividi il tuo invito');

      const copyBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Copia codice referral',
      });
      act(() => {
        copyBtn.props.onPress();
      });
      expect(readAllText(renderer!)).toContain('✓ Copiato!');
    });

    test('mostra le statistiche degli accrediti e la cronologia anonimizzata', () => {
      act(() => {
        renderer = ReactTestRenderer.create(
          <ReferralCard stato={mockReferralStato} />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Registrazioni completate');
      expect(text).toContain('+3');
      expect(text).toContain('Tetto massimo: 5 corsi');
      expect(text).toContain('Luigi V.');
      expect(text).toContain('G. B.');
    });

    test('apre la modale di riscatto manuale del codice', () => {
      const onOpenRedeem = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <ReferralCard stato={mockReferralStato} onOpenRedeemModal={onOpenRedeem} />,
        );
      });

      const redeemBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Riscatta un codice invito ricevuto',
      });
      act(() => {
        redeemBtn.props.onPress();
      });
      expect(onOpenRedeem).toHaveBeenCalledTimes(1);
    });
  });

  describe('RedeemCodeModal', () => {
    test('permette di inserire un codice valido e gestisce esito ACCREDITATO', async () => {
      const onClose = jest.fn();
      const onSuccess = jest.fn();

      jest.spyOn(referralApi, 'redeemReferralCode').mockResolvedValueOnce({
        accreditato: true,
        esito: 'ACCREDITATO',
        segnali: [],
      });

      act(() => {
        renderer = ReactTestRenderer.create(
          <RedeemCodeModal visible={true} onClose={onClose} onSuccess={onSuccess} />,
        );
      });

      const input = renderer!.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('REF-AB345678');
      });

      const submitBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Invia codice referral',
      });

      await act(async () => {
        await submitBtn.props.onPress();
      });

      expect(referralApi.redeemReferralCode).toHaveBeenCalledWith('REF-AB345678');
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(readAllText(renderer!)).toContain('Codice collegato. Buon inizio!');
    });

    test('mostra messaggio informativo per codice già accreditato', async () => {
      const onClose = jest.fn();
      const onSuccess = jest.fn();

      jest.spyOn(referralApi, 'redeemReferralCode').mockResolvedValueOnce({
        accreditato: false,
        esito: 'GIA_ACCREDITATO',
        segnali: [],
      });

      act(() => {
        renderer = ReactTestRenderer.create(
          <RedeemCodeModal visible={true} onClose={onClose} onSuccess={onSuccess} />,
        );
      });

      const input = renderer!.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('REF-AB345678');
      });

      const submitBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Invia codice referral',
      });

      await act(async () => {
        await submitBtn.props.onPress();
      });

      expect(readAllText(renderer!)).toContain('Hai già collegato un codice invito per questo account.');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
