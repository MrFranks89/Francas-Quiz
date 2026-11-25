import React from 'react';
import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ProDuelGuardCard } from './ProDuelGuardCard';
import { DuelsHubCard } from './DuelsHubCard';
import { CreateDuelModal } from './CreateDuelModal';
import { DuelInvitePreviewModal } from './DuelInvitePreviewModal';
import { DuelPlayModal } from './DuelPlayModal';
import { DuelResultModal } from './DuelResultModal';
import { type DuelloVista } from '@formazione/contracts';
import * as duelsApi from '../../api/duels';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('TASK-14: Duels Components (Pro)', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('ProDuelGuardCard', () => {
    test('mostra lo stato bloccato elegante per utente base con upsell sobrio', () => {
      const onUpgrade = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <ProDuelGuardCard onUpgradePro={onUpgrade} />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Duelli tra Colleghi');
      expect(text).toContain('MODALITÀ PRO');
      expect(text).toContain('Sblocca con la Versione Pro');

      const btn = renderer!.root.findByProps({
        accessibilityLabel: 'Passa alla versione Pro per sbloccare i duelli',
      });
      act(() => {
        btn.props.onPress();
      });
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('DuelsHubCard', () => {
    const mockDuelli: DuelloVista[] = [
      {
        duello_id: 'd-1',
        stato: 'aperto',
        titolo_corso: 'Diritto Amministrativo',
        n_domande: 10,
        scade_il: '2026-11-28T12:00:00Z',
        ruolo: 'creatore',
        la_mia_giocata: 'consegnata',
        giocata_altro: 'non_iniziata',
        codice_invito: 'DUE-23456789',
        avversario_nome: 'Giulia B.',
        creatore_nome: 'Marco R.',
      },
      {
        duello_id: 'd-2',
        stato: 'completato',
        titolo_corso: 'Economia Politica',
        n_domande: 5,
        scade_il: '2026-11-27T12:00:00Z',
        ruolo: 'avversario',
        la_mia_giocata: 'consegnata',
        giocata_altro: 'consegnata',
        avversario_nome: 'Marco R.',
        creatore_nome: 'Elena V.',
      },
    ];

    test('mostra l’elenco dei duelli e permette di filtrare per stato', () => {
      const onOpen = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <DuelsHubCard duelli={mockDuelli} onOpenDuel={onOpen} />,
        );
      });

      let text = readAllText(renderer!);
      expect(text).toContain('I Miei Duelli');
      expect(text).toContain('Diritto Amministrativo');
      expect(text).toContain('Economia Politica');

      // Filtra solo completati
      const completedTab = renderer!.root.findAllByProps({ accessibilityRole: 'tab' })
        .find((t) => {
          const txt = t.props.children;
          return txt?.props?.children === 'Completati' || txt === 'Completati';
        });

      act(() => {
        completedTab?.props.onPress();
      });

      text = readAllText(renderer!);
      expect(text).not.toContain('Diritto Amministrativo');
      expect(text).toContain('Economia Politica');
    });
  });

  describe('CreateDuelModal', () => {
    test('permette di scegliere il corso, il numero di domande e genera il codice', async () => {
      const onClose = jest.fn();
      const onCreated = jest.fn();

      jest.spyOn(duelsApi, 'createDuel').mockResolvedValueOnce({
        duello_id: 'd-fresh-1',
        codice_invito: 'DUE-AB345678',
        scade_il: '2026-11-28T12:00:00Z',
      });

      const courses = [
        { extraction_id: 'ext-1', title: 'Procedura Penale', questionCount: 25 },
      ];

      act(() => {
        renderer = ReactTestRenderer.create(
          <CreateDuelModal
            visible={true}
            courses={courses}
            onClose={onClose}
            onDuelCreated={onCreated}
          />,
        );
      });

      expect(readAllText(renderer!)).toContain('Crea un Duello Asincrono');
      expect(readAllText(renderer!)).toContain('Procedura Penale');

      const submitBtn = renderer!.root.findAllByProps({ accessibilityRole: 'button' })
        .find((b) => {
          const child = b.props.children;
          return child?.props?.children === 'Genera Sfida e Codice' || child === 'Genera Sfida e Codice';
        });

      await act(async () => {
        await submitBtn?.props.onPress();
      });

      expect(duelsApi.createDuel).toHaveBeenCalledWith({
        extraction_id: 'ext-1',
        n_domande: 10,
      });
      expect(onCreated).toHaveBeenCalledWith('d-fresh-1', 'DUE-AB345678');
      expect(readAllText(renderer!)).toContain('DUE-AB345678');
    });
  });

  describe('DuelInvitePreviewModal', () => {
    test('mostra anteprima sfida senza soluzioni e avviso di sicurezza', () => {
      const onAccept = jest.fn();
      act(() => {
        renderer = ReactTestRenderer.create(
          <DuelInvitePreviewModal
            visible={true}
            inviteData={{
              duello_id: 'd-inv-1',
              titolo_corso: 'Contabilità di Stato',
              n_domande: 10,
              creatore_nome: 'Avv. Rossi',
              scade_il: '2026-11-28T12:00:00Z',
              stato: 'in_attesa',
            }}
            onClose={() => {}}
            onAccept={onAccept}
          />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('Sfida Ricevuta!');
      expect(text).toContain('Contabilità di Stato');
      expect(text).toContain('Avv. Rossi');
      expect(text).toContain('Le domande verranno mostrate senza soluzioni durante la prova');

      const acceptBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Accetta sfida ed entra nel duello',
      });
      act(() => {
        acceptBtn.props.onPress();
      });
      expect(onAccept).toHaveBeenCalledWith('d-inv-1', '');
    });
  });

  describe('DuelPlayModal', () => {
    test('mostra domande senza soluzioni una alla volta e permette la consegna', async () => {
      jest.useFakeTimers();
      const onSubmit = jest.fn().mockImplementation(() => Promise.resolve({
        corrette: 2,
        tempo_totale_ms: 25000,
        duello_chiuso: false,
      }));

      const mockPlayData = {
        domande: [
          { domanda_id: 'q-1', testo: 'Chi nomina il Presidente del Consiglio?', opzioni: ['Il popolo', 'Il Presidente della Repubblica', 'Il Parlamento'] },
          { domanda_id: 'q-2', testo: 'Quanti deputati ha la Camera?', opzioni: ['400', '630', '315'] },
        ],
        tempo_max_giocata_s: 900,
        iniziata_il: '2026-11-25T10:00:00Z',
      };

      act(() => {
        renderer = ReactTestRenderer.create(
          <DuelPlayModal
            visible={true}
            duelloId="d-100"
            titoloCorso="Diritto Costituzionale"
            playData={mockPlayData}
            onClose={() => {}}
            onSubmit={onSubmit}
          />,
        );
      });

      let text = readAllText(renderer!);
      expect(text).toContain('Domanda 1 di 2');
      expect(text).toContain('Chi nomina il Presidente del Consiglio?');

      // Seleziona opzione B
      const optionB = renderer!.root.findAllByProps({ accessibilityRole: 'radio' })[1];
      act(() => {
        optionB.props.onPress();
      });

      // Premi Prossima Domanda
      const nextBtn = renderer!.root.findByProps({ accessibilityLabel: 'Prossima Domanda' });
      act(() => {
        nextBtn.props.onPress();
      });

      text = readAllText(renderer!);
      expect(text).toContain('Domanda 2 di 2');
      expect(text).toContain('Quanti deputati ha la Camera?');

      // Seleziona opzione A
      const optionA = renderer!.root.findAllByProps({ accessibilityRole: 'radio' })[0];
      act(() => {
        optionA.props.onPress();
      });

      // Consegna
      const submitBtn = renderer!.root.findByProps({ accessibilityLabel: 'Consegna Prova' });

      await act(async () => {
        await submitBtn.props.onPress();
      });

      expect(onSubmit).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('DuelResultModal', () => {
    test('mostra confronto a due colonne creatore vs avversario con accredito XP e soluzioni', () => {
      const mockDuel: DuelloVista = {
        duello_id: 'd-res-1',
        stato: 'completato',
        titolo_corso: 'Diritto Penale',
        n_domande: 5,
        scade_il: '2026-11-28T12:00:00Z',
        ruolo: 'creatore',
        la_mia_giocata: 'consegnata',
        giocata_altro: 'consegnata',
        avversario_nome: 'Luigi V.',
        creatore_nome: 'Marco R.',
      };

      const mockResultData = {
        stato: 'completato' as const,
        esito: {
          vincitore_id: 'creatore',
          motivo: 'PUNTEGGIO' as const,
          punteggi: {
            creatore: { corrette: 5, tempo_totale_ms: 35000 },
            avversario: { corrette: 3, tempo_totale_ms: 42000 },
          },
        },
        soluzioni: [
          { domanda_id: 'q-1', corretta: 1, spiegazione: 'Articolo 40 c.p.' },
        ],
      };

      act(() => {
        renderer = ReactTestRenderer.create(
          <DuelResultModal
            visible={true}
            duello={mockDuel}
            resultData={mockResultData}
            onClose={() => {}}
          />,
        );
      });

      const text = readAllText(renderer!);
      expect(text).toContain('🏆 Vittoria!');
      expect(text).toContain('+50 XP guadagnati!');
      expect(text).toContain('Marco R.');
      expect(text).toContain('Luigi V.');
      expect(text).toContain('5 corrette');
      expect(text).toContain('3 corrette');
      expect(text).toContain('Soluzioni e Spiegazioni della Sfida');
      expect(text).toContain('Articolo 40 c.p.');
    });
  });
});
