/**
 * Test nostro su src/lezione/SlideStep.tsx (copia) come lo usa il nostro
 * lettore: passa sempre `onTesti` e mai `lezioneId`.
 *
 * - Il pulsante altoparlante non viene disegnato: qui la voce è un sostituto
 *   senza effetto (src/speech.ts), quindi un pulsante visibile sarebbe un
 *   comando morto.
 * - Nessuna parola diventa toccabile: il glossario di Civis non è portato.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { SlideStep } from '../../src/lezione/SlideStep';
import { SpeakerButton } from '../../src/lezione/SpeakerButton';
import { Btn } from '../../src/comune/Btn';

const STEP = { heading: 'Il registro dei controlli', body: 'Ogni **controllo** si annota.', highlight: 'Firma sempre il registro.' };

function testoDi(nodo: any): string {
  if (typeof nodo === 'string') return nodo;
  if (Array.isArray(nodo)) return nodo.map(testoDi).join('');
  return nodo?.children ? testoDi(nodo.children) : '';
}

test('con onTesti il pulsante altoparlante non compare e i testi vanno al chiamante', () => {
  const onTesti = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<SlideStep step={STEP} onNext={jest.fn()} moduleColor="#356b2c" onTesti={onTesti} />); });
  expect(tree.root.findAllByType(SpeakerButton)).toHaveLength(0);
  expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Leggi ad alta voce')).toHaveLength(0);
  expect(onTesti).toHaveBeenCalledWith([STEP.heading, STEP.body, STEP.highlight]);
  // L'unico comando toccabile è «Continua →».
  const comandi = tree.root.findAllByType(TouchableOpacity);
  expect(comandi.map(c => c.props.accessibilityLabel)).toEqual(['Continua →']);
  act(() => tree.unmount());
});

test('senza onTesti (uso che il lettore non fa) il pulsante comparirebbe', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<SlideStep step={STEP} onNext={jest.fn()} moduleColor="#356b2c" />); });
  expect(tree.root.findAllByType(SpeakerButton)).toHaveLength(1);
  act(() => tree.unmount());
});

test('mostra titolo, corpo con grassetto ed evidenza; nessuna parola toccabile', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<SlideStep step={STEP} onNext={jest.fn()} moduleColor="#356b2c" onTesti={jest.fn()} />); });
  const tutto = testoDi(tree.toJSON());
  expect(tutto).toContain('Il registro dei controlli');
  expect(tutto).toContain('Ogni controllo si annota.');
  expect(tutto).toContain('Firma sempre il registro.');
  expect(tree.root.findAllByType(Text).filter(t => typeof t.props.onPress === 'function')).toHaveLength(0);
  act(() => tree.unmount());
});

test('«Continua →» chiama onNext', () => {
  const onNext = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<SlideStep step={STEP} onNext={onNext} moduleColor="#356b2c" onTesti={jest.fn()} />); });
  act(() => { tree.root.findAllByType(Btn).find(b => b.props.label === 'Continua →')!.props.onPress(); });
  expect(onNext).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
