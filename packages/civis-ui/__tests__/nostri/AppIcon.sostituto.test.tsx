/**
 * Test nostro sul sostituto src/icons/AppIcon.tsx: EmojiText mostra il testo
 * così com'è con lo stile ricevuto, EmojiIcon non disegna nulla.
 */
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { EmojiIcon, EmojiText } from '../../src/icons/AppIcon';

test('EmojiText è un testo semplice con lo stile ricevuto', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<EmojiText style={{ color: '#ffffff' }}>Continua</EmojiText>); });
  const testo = view.root.findByType(Text);
  expect(testo.props.children).toBe('Continua');
  expect(testo.props.style).toEqual({ color: '#ffffff' });
});

test('EmojiText rende **parola** in grassetto come in Civis e toglie gli asterischi', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<EmojiText style={{ color: '#ffffff' }}>{'Una **parola** sola'}</EmojiText>); });
  const grassetto = view.root.findAllByType(Text).find(t => t.props.children === 'parola');
  expect(grassetto?.props.style).toEqual([{ color: '#ffffff' }, { fontWeight: '700' }]);
  expect(JSON.stringify(view.toJSON())).not.toContain('**');
});

test('EmojiIcon non disegna nulla', () => {
  let view!: Renderer.ReactTestRenderer;
  act(() => { view = Renderer.create(<EmojiIcon emoji="stella" size={18} />); });
  expect(view.toJSON()).toBeNull();
});
