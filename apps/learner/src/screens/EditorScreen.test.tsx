import React from 'react';
import { beforeEach, afterEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Switch, Text, TextInput } from 'react-native';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { CourseSchema } from '@formazione/contracts';
import { draftRequest as mockDraftRequest, type Draft } from '../api/generation';
import { Button, Notice } from '../components/ui';
import { EditorScreen } from './EditorScreen';

const corso = CourseSchema.parse(sample);

jest.mock('../api/generation', () => ({
  draftRequest: jest.fn(),
}));

const draftRequest = mockDraftRequest as jest.MockedFunction<typeof mockDraftRequest>;

const bozza = (extra: Partial<Draft> = {}): Draft => ({
  id: 'bozza-1',
  status: 'draft',
  revision: 3,
  course: corso,
  ...extra,
});

const alberi: ReactTestRenderer.ReactTestRenderer[] = [];

function disegna(draft: Draft) {
  const onChange = jest.fn();
  const onPreview = jest.fn();
  let albero!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    albero = ReactTestRenderer.create(
      <EditorScreen draft={draft} onChange={onChange} onPreview={onPreview} />,
    );
  });
  alberi.push(albero);
  const campo = (label: string) =>
    albero.root.findAllByType(TextInput).find((c) => c.props.accessibilityLabel === label)!;
  const pulsante = (label: string) =>
    albero.root.findAllByType(Button).find((b) => b.props.label === label);
  const testi = () =>
    albero.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

  return {
    onChange,
    onPreview,
    albero,
    testi,
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

beforeEach(() => {
  draftRequest.mockReset();
});

afterEach(async () => {
  while (alberi.length > 0) {
    const a = alberi.pop();
    act(() => {
      a?.unmount();
    });
  }
  try {
    jest.clearAllTimers();
  } catch {
    /* noop */
  }
  jest.useRealTimers();
});

describe('salvataggio automatico (autosave con debounce)', () => {
  test('senza modifiche mostra lo stato «✓ Salvato»', () => {
    const s = disegna(bozza());
    expect(s.testi()).toContain('✓ Salvato');
  });

  test('salva automaticamente con debounce di 800ms dopo una modifica', async () => {
    jest.useFakeTimers();
    const s = disegna(bozza());
    const risposta = bozza({ revision: 4, course: { ...corso, title: 'Titolo nuovo' } });
    draftRequest.mockResolvedValue(risposta);

    s.scrivi('Titolo del corso', 'Titolo nuovo');
    expect(s.testi()).toContain('Salvataggio in corso…');

    await act(async () => {
      jest.advanceTimersByTime(850);
    });

    expect(draftRequest).toHaveBeenCalledWith('/drafts/bozza-1', 'PUT', {
      expectedRevision: 3,
      course: expect.objectContaining({ title: 'Titolo nuovo' }),
    });
    expect(s.onChange).toHaveBeenCalledWith(risposta);
    expect(s.testi()).toContain('✓ Salvato');
  });

  test('senza revisione la revisione attesa è 1', async () => {
    jest.useFakeTimers();
    const s = disegna(bozza({ revision: undefined }));
    draftRequest.mockResolvedValue(bozza());

    s.scrivi('Titolo del corso', 'Altro');
    await act(async () => {
      jest.advanceTimersByTime(850);
    });

    expect(draftRequest.mock.calls[0][2]).toMatchObject({ expectedRevision: 1 });
  });

  test('un corso che il contratto rifiuta non parte con autosave', async () => {
    jest.useFakeTimers();
    const s = disegna(bozza());
    s.scrivi('Tentativi modulo 1', 'abc');
    await act(async () => {
      jest.advanceTimersByTime(850);
    });

    expect(draftRequest).not.toHaveBeenCalled();
    expect(s.errori().length).toBeGreaterThanOrEqual(1);
  });

  test('errore del server durante il salvataggio automatico', async () => {
    jest.useFakeTimers();
    const s = disegna(bozza());
    draftRequest.mockRejectedValue(new Error('Conflitto di revisione'));

    s.scrivi('Titolo del corso', 'Titolo nuovo');
    await act(async () => {
      jest.advanceTimersByTime(850);
    });

    expect(s.errori()).toEqual(['Conflitto di revisione']);
  });

  test('una soglia sotto il minimo si vede sotto il campo e blocca il salvataggio', () => {
    const s = disegna(bozza());
    s.scrivi('Soglia modulo 2', '1');
    expect(s.errori()).toEqual(['La soglia minima è 5 risposte su 8 (60%)']);
  });

  test('un errore di tipo di domanda blocca il salvataggio', () => {
    const s = disegna(bozza());
    const n = corso.questions.findIndex((q) => q.kind === 'scenario') + 1;
    s.scrivi(`Situazione ${n}`, '');
    expect(s.errori().length).toBeGreaterThan(0);
  });

  test('una formula nella spiegazione si vede sotto il campo e blocca il salvataggio', () => {
    const s = disegna(bozza());
    s.scrivi('Spiegazione 1', 'Il testo indica che è la prima.');
    expect(s.errori().join()).toContain('«Il testo indica»');
  });
});

describe('finalizzazione corso', () => {
  test('conferma revisione e finalizza corso con la revisione attesa', async () => {
    const s = disegna(bozza());
    expect(s.pulsante('Finalizza corso')!.props.disabled).toBe(true);
    s.conferma(true);
    expect(s.pulsante('Finalizza corso')!.props.disabled).toBe(false);
    const pubblicata = bozza({ status: 'published' });
    draftRequest.mockResolvedValue(pubblicata);
    await s.tocca('Finalizza corso');
    expect(draftRequest).toHaveBeenCalledWith('/drafts/bozza-1/publish', 'POST', {
      expectedRevision: 3,
      confirmReviewed: true,
    });
    expect(s.onChange).toHaveBeenCalledWith(pubblicata);
  });

  test('una modifica dopo la conferma la annulla e spegne la finalizzazione', () => {
    const s = disegna(bozza());
    s.conferma(true);
    s.scrivi('Titolo del corso', 'Cambiato');
    expect(s.albero.root.findByType(Switch).props.value).toBe(false);
    expect(s.pulsante('Finalizza corso')!.props.disabled).toBe(true);
  });

  test('errore di finalizzazione con messaggio predefinito', async () => {
    const s = disegna(bozza());
    s.conferma(true);
    draftRequest.mockRejectedValue(42);
    await s.tocca('Finalizza corso');
    expect(s.errori()).toEqual(['Pubblicazione non riuscita.']);
  });

  test('un corso completato non si modifica né si ripubblica', () => {
    const s = disegna(bozza({ status: 'published' }));
    expect(s.pulsante('Finalizza corso')).toBeUndefined();
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
