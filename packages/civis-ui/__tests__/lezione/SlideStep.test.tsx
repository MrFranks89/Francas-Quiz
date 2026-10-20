import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SlideStep } from '../../src/lezione/SlideStep';
import { Btn } from '../../src/comune/Btn';

// Trova un <Btn label="..."> per label esatta e ne preme onPress.
function premiBtn(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const btn = root.findAllByType(Btn).find((b) => b.props.label === label);
  if (!btn) throw new Error(`Nessun Btn trovato con label "${label}"`);
  btn.props.onPress();
}

const STEP = { emoji: '📘', heading: 'Titolo', body: 'Corpo', highlight: 'In evidenza' };

test('SlideStep si disegna senza esplodere', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  expect(() => {
    act(() => { renderer = ReactTestRenderer.create(<SlideStep step={STEP} onNext={() => {}} moduleColor="#123456" />); });
  }).not.toThrow();
});

test('SlideStep: "Continua" chiama onNext una volta', () => {
  const onNext = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(<SlideStep step={STEP} onNext={onNext} moduleColor="#123456" />); });
  act(() => { premiBtn(renderer!.root, 'Continua →'); });
  expect(onNext).toHaveBeenCalledTimes(1);
});

test('slide mantiene icona originale e inoltra i testi allo speaker del chiamante', () => {
  const { EmojiIcon } = require('../../src/icons/AppIcon');
  const { SpeakerButton } = require('../../src/lezione/SpeakerButton');
  const onTesti = jest.fn();
  let tree: any;
  act(() => { tree = ReactTestRenderer.create(<SlideStep step={STEP} onNext={jest.fn()} moduleColor="#123456" onTesti={onTesti} />); });
  expect(tree.root.findAllByType(EmojiIcon).some((i: any) => i.props.emoji === STEP.emoji && i.props.size === 30)).toBe(true);
  expect(onTesti).toHaveBeenCalledWith([STEP.heading, STEP.body, STEP.highlight]);
  expect(tree.root.findAllByType(SpeakerButton)).toHaveLength(0);
  act(() => tree.unmount());
});

test('SlideStep: **parola** nel corpo diventa grassetto, il resto resta normale', () => {
  const step = { ...STEP, body: 'Testo normale con **una parola** in evidenza.' };
  let renderer: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(<SlideStep step={step} onNext={() => {}} moduleColor="#123456" />); });

  const testi = renderer!.root.findAllByType(Text);
  // Il body (fontWeight non impostato nello stile base) contiene ora un
  // <Text> con fontWeight '700' e la sola parola marcata come figlio.
  const grassetto = testi.find((t) => {
    const stile = Array.isArray(t.props.style) ? t.props.style.flat(Infinity) : [t.props.style];
    return stile.some((s: any) => s && s.fontWeight === '700') && t.props.children === 'una parola';
  });
  expect(grassetto).toBeDefined();

  // Nessun asterisco resta a schermo.
  const flatten = (nodo: any): string =>
    typeof nodo === 'string'
      ? nodo
      : Array.isArray(nodo)
      ? nodo.map(flatten).join('')
      : nodo?.children
      ? flatten(nodo.children)
      : '';
  expect(flatten(renderer!.toJSON())).toContain('Testo normale con una parola in evidenza.');
});
