import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { ThemeProvider, useTheme, LIGHT } from '@formazione/civis-ui/src/ThemeProvider';
import { C as DARK } from '@formazione/civis-ui/src/tema';
import { StudyConfigCard } from './StudyConfigCard';
import { GamificationCard } from './GamificationCard';
import { VoiceRecallCard } from './VoiceRecallCard';
import { ConceptNodeDetailCard } from './ConceptNodeDetailCard';
import { Button, Card } from './ui';

function readAllText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .join(' ');
}

describe('Moduli percorso di studio', () => {
  test('StudyConfigCard mostra toggle e configurazione attiva', () => {
    const onToggleMap = jest.fn();
    const onNext = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <StudyConfigCard
          includeMap={true}
          includeCourse={false}
          includeGamify={true}
          includeVoice={false}
          onToggleMap={onToggleMap}
          onToggleCourse={jest.fn()}
          onToggleGamify={jest.fn()}
          onToggleVoice={jest.fn()}
          onNext={onNext}
        />,
      );
    });

    const text = readAllText(renderer);
    expect(text).toContain('Mappa + Quiz + Ripasso Dinamico');
    expect(text).toContain('✓ Sempre Attivo');

    const mapToggle = renderer.root
      .findAllByProps({ accessibilityLabel: 'Includi Mappa Concettuale' })[0];
    act(() => {
      mapToggle.props.onPress();
    });
    expect(onToggleMap).toHaveBeenCalledTimes(1);

    const nextBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Avanti: Seleziona Materiale e Capitoli →');
    act(() => {
      nextBtn?.props.onPress();
    });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test('GamificationCard mostra XP, streak e attiva sfida e flashcard', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<GamificationCard initialXp={980} streakDays={5} />);
    });

    let text = readAllText(renderer);
    expect(text).toContain('Livello Padronanza: Argento');
    expect(text).toContain('980 XP accumulati');
    expect(text).toContain('5 Giorni di Serie');

    const speedBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Avvia Sfida Rapida' })[0];
    act(() => {
      speedBtn.props.onPress();
    });
    text = readAllText(renderer);
    expect(text).toContain('Sfida a Tempo attiva');
    expect(text).toContain('60s rimanenti');

    const flashBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Apri Mazzo Flashcard' })[0];
    act(() => {
      flashBtn.props.onPress();
    });
    expect(readAllText(renderer)).toContain('Flashcard Spaziata');
  });

  test('VoiceRecallCard gestisce registrazione microfono e mostra report AI', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <VoiceRecallCard topic="Sicurezza" keywords={['prevenzione', 'rischio', 'formazione']} />,
      );
    });

    expect(readAllText(renderer)).toContain('Premi per iniziare');

    const startMic = renderer.root
      .findAllByProps({ accessibilityLabel: 'Avvia registrazione vocale' })[0];
    act(() => {
      startMic.props.onPress();
    });
    expect(readAllText(renderer)).toContain('Ascolto in corso');

    const stopMic = renderer.root
      .findAllByProps({ accessibilityLabel: 'Ferma registrazione vocale' })[0];
    act(() => {
      stopMic.props.onPress();
    });
    const finalText = readAllText(renderer);
    expect(finalText).toContain('Esposizione registrata e analizzata');
    expect(finalText).toContain('Punteggio:');
    expect(finalText).toContain('Consiglio del Tutor');
  });

  test('Card e moduli di studio applicano la palette scura e chiara con ThemeProvider', async () => {
    function Switcher() {
      const { setMode } = useTheme();
      return (
        <>
          <Button label="set-light" onPress={() => setMode('light')} />
          <Button label="set-dark" onPress={() => setMode('dark')} />
          <Card>
            <Text>Contenuto card</Text>
          </Card>
          <StudyConfigCard
            includeMap={true}
            includeCourse={false}
            includeGamify={true}
            includeVoice={true}
            onToggleMap={jest.fn()}
            onToggleCourse={jest.fn()}
            onToggleGamify={jest.fn()}
            onToggleVoice={jest.fn()}
            onNext={jest.fn()}
          />
          <ConceptNodeDetailCard
            branchTitle="Sicurezza"
            node={{ id: 'n1', title: 'Rischio', summary: 'Definizione', sourceRefs: ['p. 1'] }}
            formatSourceRef={(r) => `[${r}]`}
            onClose={jest.fn()}
          />
        </>
      );
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ThemeProvider>
          <Switcher />
        </ThemeProvider>,
      );
      await Promise.resolve();
    });

    const cardViewsDark = renderer.root.findAllByType(View);
    const hasDarkSurface = cardViewsDark.some((v) =>
      JSON.stringify(v.props.style).includes(DARK.surface),
    );
    const hasDarkSurfaceCard = cardViewsDark.some((v) =>
      JSON.stringify(v.props.style).includes(DARK.surfaceDark),
    );
    expect(hasDarkSurface).toBe(true);
    expect(hasDarkSurfaceCard).toBe(true);

    const lightBtn = renderer.root.findAllByType(Button).find((b) => b.props.label === 'set-light');
    await act(async () => {
      lightBtn?.props.onPress();
      await Promise.resolve();
    });

    const cardViewsLight = renderer.root.findAllByType(View);
    const hasLightWhite = cardViewsLight.some((v) =>
      JSON.stringify(v.props.style).includes('"white"'),
    );
    const stillHasDarkSurface = cardViewsLight.some((v) =>
      JSON.stringify(v.props.style).includes(DARK.surfaceDark),
    );
    expect(hasLightWhite).toBe(true);
    expect(stillHasDarkSurface).toBe(false);
    expect(LIGHT.surface).toBe('#ffffff');
  });
});
