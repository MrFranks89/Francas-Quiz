/**
 * Comportamento di EditorScreen fissato prima di spostare le sue regole in
 * un modulo di stato: quando salvataggio e pubblicazione sono bloccati, cosa
 * viene mandato al server, quale errore si vede quando qualcosa non va.
 */
import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Switch, TextInput } from 'react-native';
import { CourseSchema } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { Button, Notice } from '../components/ui';
import type { Draft } from '../api/generation';

import { EditorScreen } from './EditorScreen';

// Il server finto: jest.mock sale in testa al file, prima degli import.
const mockDraftRequest =
  jest.fn<(path: string, method?: string, body?: unknown) => Promise<Draft>>();
jest.mock('../api/generation', () => ({
  draftRequest: (...a: unknown[]) => (mockDraftRequest as (...a: unknown[]) => unknown)(...a),
}));
const draftRequest = mockDraftRequest;

const corso = CourseSchema.parse(sample);
const bozza = (extra: Partial<Draft> = {}): Draft => ({
  id: 'bozza-1',
  revision: 3,
  status: 'draft',
  course: corso,
  ...extra,
});

function disegna(draft: Draft) {
  const onChange = jest.fn();
  const onPreview = jest.fn();
  let albero!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    albero = ReactTestRenderer.create(
      <EditorScreen draft={draft} onChange={onChange} onPreview={onPreview} />,
    );
  });
  const campo = (label: string) =>
    albero.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === label)!;
  const pulsante = (label: string) =>
    albero.root.findAllByType(Button).find((b) => b.props.label === label);
  return {
    onChange,
    albero,
    scrivi: (label: string, testo: string) => act(() => campo(label).props.onChangeText(testo)),
    pulsante,
    tocca: async (label: string) => {
      await act(async () => {
        await pulsante(label)!.props.onPress();
      });
    },
    conferma: (valore: boolean) =>
      act(() => albero.root.findByType(Switch).props.onValueChange(valore)),
    errori: () =>
      albero.root
        .findAllByType(Notice)
        .filter((n) => n.props.error)
        .map((n) => n.props.text as string),
  };
}

beforeEach(() => draftRequest.mockReset());

describe('salvataggio', () => {
  test('senza modifiche il pulsante dice «Bozza salvata» ed è spento', () => {
    const s = disegna(bozza());
    expect(s.pulsante('Bozza salvata')!.props.disabled).toBe(true);
  });

  test('salva il corso validato con la revisione attesa e riceve la bozza nuova', async () => {
    const s = disegna(bozza());
    s.scrivi('Titolo del corso', 'Titolo nuovo');
    expect(s.pulsante('Salva modifiche')!.props.disabled).toBe(false);
    const risposta = bozza({ revision: 4, course: { ...corso, title: 'Titolo nuovo' } });
    draftRequest.mockResolvedValue(risposta);
    await s.tocca('Salva modifiche');
    expect(draftRequest).toHaveBeenCalledWith('/drafts/bozza-1', 'PUT', {
      expectedRevision: 3,
      course: expect.objectContaining({ title: 'Titolo nuovo' }),
    });
    expect(s.onChange).toHaveBeenCalledWith(risposta);
    expect(s.pulsante('Bozza salvata')).toBeDefined();
  });

  test('senza revisione la revisione attesa è 1', async () => {
    const s = disegna(bozza({ revision: undefined }));
    s.scrivi('Titolo del corso', 'Altro');
    draftRequest.mockResolvedValue(bozza());
    await s.tocca('Salva modifiche');
    expect(draftRequest.mock.calls[0][2]).toMatchObject({ expectedRevision: 1 });
  });

  test('un corso che il contratto rifiuta non parte e mostra «Bozza non valida»', async () => {
    const s = disegna(bozza());
    s.scrivi('Tentativi modulo 1', 'abc');
    expect(s.pulsante('Salva modifiche')!.props.disabled).toBe(false);
    await s.tocca('Salva modifiche');
    expect(draftRequest).not.toHaveBeenCalled();
    expect(s.errori()).toHaveLength(1);
    expect(s.errori()[0]).toMatch(/^Bozza non valida: /);
    expect(s.pulsante('Salva modifiche')).toBeDefined();
  });

  test('errore del server: messaggio dell’errore; altro lancio: messaggio predefinito', async () => {
    const s = disegna(bozza());
    s.scrivi('Titolo del corso', 'Titolo nuovo');
    draftRequest.mockRejectedValue(new Error('Conflitto di revisione'));
    await s.tocca('Salva modifiche');
    expect(s.errori()).toEqual(['Conflitto di revisione']);
    draftRequest.mockRejectedValue('non un Error');
    await s.tocca('Salva modifiche');
    expect(s.errori()).toEqual(['Salvataggio non riuscito.']);
    expect(s.onChange).not.toHaveBeenCalled();
  });

  test('una soglia sotto il minimo blocca salvataggio e pubblicazione e si vede sotto il campo', () => {
    const s = disegna(bozza());
    s.scrivi('Soglia modulo 2', '1');
    expect(s.pulsante('Salva modifiche')!.props.disabled).toBe(true);
    expect(s.errori()).toEqual(['La soglia minima è 5 risposte su 8 (60%)']);
  });

  test('un errore di tipo di domanda blocca il salvataggio', () => {
    const s = disegna(bozza());
    // Situazione dello scenario troppo corta: errore del contratto sotto il campo.
    const n = corso.questions.findIndex((q) => q.kind === 'scenario') + 1;
    s.scrivi(`Situazione ${n}`, '');
    expect(s.errori().length).toBeGreaterThan(0);
    expect(s.pulsante('Salva modifiche')!.props.disabled).toBe(true);
  });

  test('una formula nella spiegazione si vede sotto il campo e blocca il salvataggio', () => {
    const s = disegna(bozza());
    s.scrivi('Spiegazione 1', 'Il testo indica che è la prima.');
    expect(s.errori().join()).toContain('«Il testo indica»');
    expect(s.pulsante('Salva modifiche')!.props.disabled).toBe(true);
  });
});

describe('pubblicazione', () => {
  test('serve la conferma della revisione, poi pubblica con la revisione attesa', async () => {
    const s = disegna(bozza());
    expect(s.pulsante('Pubblica sul server locale')!.props.disabled).toBe(true);
    s.conferma(true);
    expect(s.pulsante('Pubblica sul server locale')!.props.disabled).toBe(false);
    const pubblicata = bozza({ status: 'published' });
    draftRequest.mockResolvedValue(pubblicata);
    await s.tocca('Pubblica sul server locale');
    expect(draftRequest).toHaveBeenCalledWith('/drafts/bozza-1/publish', 'POST', {
      expectedRevision: 3,
      confirmReviewed: true,
    });
    expect(s.onChange).toHaveBeenCalledWith(pubblicata);
  });

  test('una modifica dopo la conferma la annulla e spegne la pubblicazione', () => {
    const s = disegna(bozza());
    s.conferma(true);
    s.scrivi('Titolo del corso', 'Cambiato');
    expect(s.albero.root.findByType(Switch).props.value).toBe(false);
    expect(s.pulsante('Pubblica sul server locale')!.props.disabled).toBe(true);
  });

  test('errore di pubblicazione con messaggio predefinito', async () => {
    const s = disegna(bozza());
    s.conferma(true);
    draftRequest.mockRejectedValue(42);
    await s.tocca('Pubblica sul server locale');
    expect(s.errori()).toEqual(['Pubblicazione non riuscita.']);
  });

  test('una bozza pubblicata non si modifica né si ripubblica', () => {
    const s = disegna(bozza({ status: 'published' }));
    expect(s.pulsante('Pubblica sul server locale')).toBeUndefined();
    expect(s.albero.root.findAllByType(TextInput).some((c) => c.props.editable)).toBe(false);
  });
});

describe('navigazione a schede', () => {
  test('mostra i tab previsti per panoramica moduli quiz e tutto', () => {
    const s = disegna(bozza());
    const tabs = s.albero.root.findAll(
      (n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function',
    );
    const labels = tabs.map((t) => t.props.accessibilityLabel);
    expect(labels).toContain('Scheda Panoramica');
    expect(labels).toContain('Scheda Modulo 1');
    expect(labels).toContain('Scheda Domande & Quiz');
    expect(labels).toContain('Scheda Tutto');
  });

  test('permette di cambiare la scheda attiva selezionandola', () => {
    const s = disegna(bozza());
    const tabPanoramica = s.albero.root.find(
      (n) =>
        n.props.accessibilityRole === 'tab' &&
        n.props.accessibilityLabel === 'Scheda Panoramica' &&
        typeof n.props.onPress === 'function',
    );
    act(() => {
      tabPanoramica.props.onPress();
    });
    expect(tabPanoramica.props.accessibilityState.selected).toBe(true);
  });
});

