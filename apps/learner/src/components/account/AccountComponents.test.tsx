import React from 'react';
import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { ProfileCard } from './ProfileCard';
import { CourseLimitBanner } from './CourseLimitBanner';
import { AuthModal } from './AuthModal';
import { type UtenteVista } from '@formazione/contracts';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('TASK-14: Account & Auth Components', () => {
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

  describe('ProfileCard', () => {
    test('mostra lo stato di modalità locale quando non autenticato', () => {
      const onOpenAuth = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <ProfileCard utente={null} onOpenAuth={onOpenAuth} />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Modalità Locale');
      expect(text).toContain('Piano Base');

      const connectBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Collega o crea account',
      });
      act(() => {
        connectBtn.props.onPress();
      });
      expect(onOpenAuth).toHaveBeenCalledTimes(1);
    });

    test('mostra il profilo completo per utente autenticato con corsi usati e corsi extra', () => {
      const mockUtente: UtenteVista = {
        user_id: 'usr-456',
        email: 'studente@civis.it',
        nome_visualizzato: 'Marco Rossi',
        piano_effettivo: 'base',
        limite_base: 3,
        corsi_extra_referral: 2,
        limite_effettivo: 5,
        corsi_usati: 3,
        auth_required: true,
      };

      act(() => {
        renderer = ReactTestRenderer.create(
          <ProfileCard utente={mockUtente} />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Marco Rossi');
      expect(text).toContain('studente@civis.it');
      expect(text).toContain('3 di 5 corsi utilizzati');
      expect(text).toContain('+2 corsi extra guadagnati con gli inviti');
    });

    test('permette di modificare il nome visualizzato e salvare', async () => {
      const mockUtente: UtenteVista = {
        user_id: 'usr-456',
        email: 'studente@civis.it',
        nome_visualizzato: 'Nome Vecchio',
        piano_effettivo: 'base',
        limite_base: 3,
        corsi_extra_referral: 0,
        limite_effettivo: 3,
        corsi_usati: 1,
        auth_required: true,
      };

      const onUpdateName = jest.fn().mockImplementation(() => Promise.resolve());

      act(() => {
        renderer = ReactTestRenderer.create(
          <ProfileCard utente={mockUtente} onUpdateName={onUpdateName} />,
        );
      });

      const editBtn = renderer!.root.findByProps({ accessibilityLabel: 'Modifica nome' });
      act(() => {
        editBtn.props.onPress();
      });

      const input = renderer!.root.findByType(TextInput);
      act(() => {
        input.props.onChangeText('Nuovo Nome Salvo');
      });

      const saveBtn = renderer!.root.findAllByProps({ accessibilityRole: 'button' })
        .find((b) => {
          const children = b.props.children;
          return Array.isArray(children) ? false : children?.props?.children === 'Salva' || children === 'Salva';
        });

      await act(async () => {
        await saveBtn?.props.onPress();
      });

      expect(onUpdateName).toHaveBeenCalledWith('Nuovo Nome Salvo');
    });
  });

  describe('CourseLimitBanner', () => {
    test('mostra banner informativo quando i corsi sono sotto il limite', () => {
      act(() => {
        renderer = ReactTestRenderer.create(
          <CourseLimitBanner
            corsiUsati={2}
            limiteEffettivo={3}
            limiteBase={3}
            corsiExtraReferral={0}
            piano="base"
            referralDisponibile={true}
          />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('2 di 3 corsi usati');
    });

    test('mostra stato blocco con CTA referral se referralDisponibile è true', () => {
      const onInvite = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <CourseLimitBanner
            corsiUsati={3}
            limiteEffettivo={3}
            limiteBase={3}
            corsiExtraReferral={0}
            piano="base"
            referralDisponibile={true}
            onInviteFriend={onInvite}
          />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Hai raggiunto il limite di corsi disponibili');
      expect(text).toContain('Invita un amico per sbloccare +1 corso gratuito');

      const inviteBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Invita un amico per sbloccare un corso extra',
      });
      act(() => {
        inviteBtn.props.onPress();
      });
      expect(onInvite).toHaveBeenCalledTimes(1);
    });

    test('mostra stato blocco senza CTA referral se referralDisponibile è false', () => {
      act(() => {
        renderer = ReactTestRenderer.create(
          <CourseLimitBanner
            corsiUsati={5}
            limiteEffettivo={5}
            limiteBase={3}
            corsiExtraReferral={2}
            piano="base"
            referralDisponibile={false}
          />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Hai raggiunto la capacità massima di corsi');
      expect(text).not.toContain('Invita un amico per sbloccare +1 corso gratuito');
    });
  });

  describe('AuthModal', () => {
    test('visualizza la modalità di benvenuto e permette di passare a login e registrazione', () => {
      const onClose = jest.fn();
      const onAuthSuccess = jest.fn();

      act(() => {
        renderer = ReactTestRenderer.create(
          <AuthModal visible={true} onClose={onClose} onAuthSuccess={onAuthSuccess} />,
        );
      });

      let text = readAllText(renderer!);
      expect(text).toContain('Accedi o Crea un Account');
      expect(text).toContain('Accedi con Email');
      expect(text).toContain('Crea un nuovo Account');

      // Passa a Login
      const loginBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Vai al login con email',
      });
      act(() => {
        loginBtn.props.onPress();
      });

      text = readAllText(renderer!);
      expect(text).toContain('Accedi al tuo Account');
      expect(text).toContain('Non hai ancora un account? Registrati');

      // Passa a Registrazione
      const registerLink = renderer!.root.findAllByProps({ accessibilityRole: 'button' })
        .find((b) => {
          const t = b.props.children;
          return t?.props?.children === 'Non hai ancora un account? Registrati';
        });
      act(() => {
        registerLink?.props.onPress();
      });

      text = readAllText(renderer!);
      expect(text).toContain('Crea il tuo Account');
    });
  });
});
