import React from 'react';
import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { GamificationCard } from './GamificationCard';
import { DEFAULT_QUESTIONS, DEFAULT_FLASHCARDS } from './gamification/defaults';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('GamificationCard - Modalità di Gioco e Poteri (Fase 1)', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('Sopravvivenza: 3 errori portano a game over e schermata finale', () => {
    act(() => {
      renderer = ReactTestRenderer.create(
        <GamificationCard initialXp={500} streakDays={3} questions={DEFAULT_QUESTIONS} />,
      );
    });

    const survivalBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia Sopravvivenza',
    })[0];
    act(() => {
      survivalBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('🛡️ Sopravvivenza');
    expect(text).toContain('❤️ ❤️ ❤️');

    // Rispondi errato 3 volte, premendo "Continua" tra una domanda e l'altra
    for (let i = 0; i < 3; i++) {
      const wrongBtn = renderer!.root.findAllByProps({
        accessibilityRole: 'button',
      }).find((b) => {
        const label = b.props.accessibilityLabel || '';
        return (
          label === 'Memorizzare passivamente il testo' ||
          label === 'Elimina del tutto la necessità di ripassare' ||
          label === 'Evitare qualsiasi feedback immediato'
        );
      });

      if (wrongBtn) {
        act(() => {
          wrongBtn.props.onPress();
        });
      }

      const continueBtn = renderer!.root.findAllByProps({
        accessibilityLabel: 'Continua',
      })[0];
      if (continueBtn) {
        act(() => {
          continueBtn.props.onPress();
        });
      }
    }

    text = readAllText(renderer!);
    expect(text).toContain('Partita Terminata');
    expect(text).toContain('Hai esaurito le 3 vite');
  });

  test('Corsa contro il tempo: moltiplicatore e bonus tempo alla risposta corretta', () => {
    act(() => {
      renderer = ReactTestRenderer.create(
        <GamificationCard initialXp={700} streakDays={2} questions={DEFAULT_QUESTIONS} />,
      );
    });

    const speedBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia Sfida Rapida',
    })[0];
    act(() => {
      speedBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Sfida a Tempo attiva');
    expect(text).toContain('60s rimanenti');

    // Trova opzione corretta ("Individuare") e rispondi
    const correctBtn = renderer!.root.findAllByProps({
      accessibilityRole: 'button',
    }).find((b) => (b.props.accessibilityLabel || '').includes('Individuare definizioni'));

    expect(correctBtn).toBeDefined();
    act(() => {
      correctBtn?.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Punteggio: 10 pt');
    expect(text).toContain('Moltiplicatore: ×1');
  });

  test('Flashcard Spaziata: flip della carta e valutazione memoria', () => {
    act(() => {
      renderer = ReactTestRenderer.create(
        <GamificationCard flashcards={DEFAULT_FLASHCARDS} />,
      );
    });

    const flashBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Apri Mazzo Flashcard',
    })[0];
    act(() => {
      flashBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Flashcard Spaziata');
    expect(text).toContain('Gira la carta');

    // Premi flip card
    const flipBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Gira la carta',
    })[0];
    act(() => {
      flipBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('RETRO (DEFINIZIONE / RISPOSTA)');
    expect(text).toContain('Facile (+20 XP)');

    // Valuta come Facile
    const easyBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Valuta Facile',
    })[0];
    act(() => {
      easyBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Carta 2 di 3');
  });

  test('Recupero Errori: rimozione dinamica dell errore risolto', () => {
    act(() => {
      renderer = ReactTestRenderer.create(<GamificationCard />);
    });

    const recoveryBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia Recupero Errori',
    })[0];
    act(() => {
      recoveryBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Recupero Concetti Deboli');
    expect(text).toContain('1 da recuperare');

    // Rispondi correttamente al concetto errato (opzione "Consolidare")
    const correctBtn = renderer!.root.findAllByProps({
      accessibilityRole: 'button',
    }).find((b) => (b.props.accessibilityLabel || '').includes('Consolidare la traccia'));

    expect(correctBtn).toBeDefined();
    act(() => {
      correctBtn?.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Nessun Errore da Recuperare!');
    expect(text).toContain('+25 XP! Concetto debole recuperato.');
  });

  test('Poteri 50/50 e Salta in Sopravvivenza', () => {
    act(() => {
      renderer = ReactTestRenderer.create(<GamificationCard questions={DEFAULT_QUESTIONS} />);
    });

    const survivalBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia Sopravvivenza',
    })[0];
    act(() => {
      survivalBtn.props.onPress();
    });

    // Usa 50/50
    const fiftyBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Usa potere 50/50',
    })[0];
    act(() => {
      fiftyBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('50/50 (2)');

    // Usa Salta
    const skipBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Usa potere Salta',
    })[0];
    act(() => {
      skipBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Salta (1)');
    expect(text).toContain('Perché la ripetizione spaziata');
  });

  test('Scheda Pro: mostra le modalità collaborative future', () => {
    act(() => {
      renderer = ReactTestRenderer.create(<GamificationCard />);
    });

    const text = readAllText(renderer!);
    expect(text).toContain('Modalità di Gruppo');
    expect(text).toContain('IN ARRIVO · PRO');
    expect(text).toContain('Live Arena');
    expect(text).toContain('Boss Fight Cooperativo');
  });
});
