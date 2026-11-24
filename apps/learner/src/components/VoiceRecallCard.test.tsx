import React from 'react';
import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import * as expoAudio from 'expo-audio';
import { VoiceRecallCard } from './VoiceRecallCard';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('VoiceRecallCard - Coach Orale e Valutazione AI', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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

  test('Modalità microfono: avvio registrazione, stop e generazione report con punteggio', () => {
    const onReport = jest.fn();
    const onAudio = jest.fn();

    act(() => {
      renderer = ReactTestRenderer.create(
        <VoiceRecallCard
          topic="Prevenzione Incendi"
          keywords={['compartimentazione', 'evacuazione', 'estintori']}
          onReportGenerated={onReport}
          onRecordingComplete={onAudio}
        />,
      );
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Simulatore di Esposizione Orale');
    expect(text).toContain('Prevenzione Incendi');
    expect(text).toContain("Premi per iniziare l'esposizione vocale");

    // Avvia registrazione
    const startBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia registrazione vocale',
    })[0];
    act(() => {
      startBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('● Ascolto in corso... Parla pure');

    // Avanza timer a 275s per verificare l'avviso dei -30s
    act(() => {
      jest.advanceTimersByTime(275000);
    });
    text = readAllText(renderer!);
    expect(text).toContain('Mancano meno di 30 secondi alla fine della registrazione!');

    // Ferma registrazione
    const stopBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Ferma registrazione vocale',
    })[0];
    act(() => {
      stopBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Esposizione registrata e analizzata');
    expect(text).toContain('Punteggio:');
    expect(text).toContain('Consiglio del Tutor');
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onAudio).toHaveBeenCalledTimes(1);
  });

  test('Fallback digitazione testo manuale e invio per valutazione', () => {
    const onReport = jest.fn();

    act(() => {
      renderer = ReactTestRenderer.create(
        <VoiceRecallCard
          topic="Primo Soccorso"
          keywords={['chiamata', 'massaggio', 'defibrillatore']}
          onReportGenerated={onReport}
        />,
      );
    });

    // Seleziona la tab digitazione
    const textTab = renderer!.root.findAllByProps({
      accessibilityLabel: 'Modalità Digita esposizione',
    })[0];
    act(() => {
      textTab.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Scrivi la tua esposizione per esteso:');

    // Simula digitazione
    const input = renderer!.root.findAllByProps({
      accessibilityLabel: 'Trascrizione esposizione orale',
    })[0];
    act(() => {
      input.props.onChangeText(
        'Nel primo soccorso è essenziale la chiamata tempestiva al 112 e il massaggio cardiaco precoce.',
      );
    });

    // Invia per valutazione
    const sendBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Invia per valutazione',
    })[0];
    act(() => {
      sendBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain('Esposizione registrata e analizzata');
    expect(text).toContain('chiamata (trattato chiaramente)');
    expect(text).toContain('massaggio (trattato chiaramente)');
    expect(text).toContain('defibrillatore (mancante o poco approfondito)');
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  test('Gestione permesso microfono negato: fallback automatico a testo', async () => {
    // Simula permesso negato
    const spy = jest.spyOn(expoAudio, 'requestRecordingPermissionsAsync').mockResolvedValueOnce({
      granted: false,
      status: 'denied' as expoAudio.PermissionStatus,
      canAskAgain: false,
      expires: 'never',
    });

    act(() => {
      renderer = ReactTestRenderer.create(
        <VoiceRecallCard topic="Sicurezza Elettrica" />,
      );
    });

    const startBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia registrazione vocale',
    })[0];

    await act(async () => {
      startBtn.props.onPress();
    });

    const text = readAllText(renderer!);
    expect(text).toContain('Permesso microfono non concesso');
    expect(text).toContain('Scrivi la tua esposizione per esteso:');
    spy.mockRestore();
  });

  test('Riascolto audio registrato e opzione riprova esposizione', () => {
    act(() => {
      renderer = ReactTestRenderer.create(
        <VoiceRecallCard topic="Valutazione dei Rischi" />,
      );
    });

    // Avvia e ferma registrazione
    const startBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Avvia registrazione vocale',
    })[0];
    act(() => {
      startBtn.props.onPress();
    });

    const stopBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Ferma registrazione vocale',
    })[0];
    act(() => {
      stopBtn.props.onPress();
    });

    let text = readAllText(renderer!);
    expect(text).toContain('Esposizione registrata e analizzata');

    // Premi riprova
    const retryBtn = renderer!.root.findAllByProps({
      accessibilityLabel: 'Riprova esposizione',
    })[0];
    act(() => {
      retryBtn.props.onPress();
    });

    text = readAllText(renderer!);
    expect(text).toContain("Premi per iniziare l'esposizione vocale");
  });
});
