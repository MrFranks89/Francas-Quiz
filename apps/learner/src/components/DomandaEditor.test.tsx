/**
 * Comportamento di DomandaEditor per ogni tipo di domanda, fissato prima di
 * spostare le sue regole in un modulo di stato: quali campi compaiono, quali
 * si possono modificare, cosa arriva a `change` quando si scrive o si tocca.
 */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { CourseSchema, erroriTipo, type Question } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { DomandaEditor } from './DomandaEditor';
import { Button, Notice } from './ui';

const corso = CourseSchema.parse(sample);
const domanda = (kind: Question['kind']) => corso.questions.find((q) => q.kind === kind)!;

function disegna(
  question: Question,
  opzioni: { disabled?: boolean; errori?: Record<string, string[]> } = {},
) {
  const change = jest.fn();
  let albero!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    albero = ReactTestRenderer.create(
      <DomandaEditor
        question={question}
        qi={3}
        errori={opzioni.errori}
        disabled={opzioni.disabled ?? false}
        change={change}
      />,
    );
  });
  const campi = albero.root.findAllByType(TextInput).map((c) => ({
    label: c.props.accessibilityLabel as string,
    editable: c.props.editable as boolean,
    value: c.props.value as string,
    scrivi: (testo: string) => act(() => c.props.onChangeText(testo)),
  }));
  const pulsanti = albero.root.findAllByType(Button).map((b) => ({
    label: b.props.label as string,
    secondary: !!b.props.secondary,
    disabled: !!b.props.disabled,
    tocca: () => act(() => b.props.onPress()),
  }));
  const testo = JSON.stringify(albero.toJSON());
  return { change, campi, pulsanti, testo };
}

const etichette = (campi: { label: string }[]) => campi.map((c) => c.label);

describe('campi per tipo', () => {
  test('scelta singola: domanda, risposte con motivazione, spiegazione', () => {
    const { campi } = disegna(domanda('single'));
    expect(etichette(campi)).toEqual([
      'Domanda 4',
      'Risposta 4.1',
      'Motivazione 4.1 (facoltativa)',
      'Risposta 4.2',
      'Motivazione 4.2 (facoltativa)',
      'Spiegazione 4',
    ]);
    expect(campi.every((c) => c.editable)).toBe(true);
  });

  test('vero o falso: risposte fisse e niente motivazioni', () => {
    const { campi } = disegna(domanda('truefalse'));
    expect(etichette(campi)).toEqual([
      'Affermazione 4',
      'Risposta 4.1',
      'Risposta 4.2',
      'Spiegazione 4',
    ]);
    expect(campi.map((c) => c.editable)).toEqual([true, false, false, true]);
  });

  test('scenario: la situazione prima della domanda', () => {
    const { campi } = disegna(domanda('scenario'));
    expect(etichette(campi).slice(0, 2)).toEqual(['Situazione 4', 'Domanda sulla situazione 4']);
    expect(campi[0].value).toBe(domanda('scenario').situation);
  });

  test('correggi l’errore: frase e parte sbagliata dopo la consegna', () => {
    const { campi } = disegna(domanda('correctStatement'));
    expect(etichette(campi).slice(0, 3)).toEqual([
      'Consegna 4',
      "Frase con l'errore 4",
      'Parte sbagliata 4',
    ]);
  });

  test('etichetta del testo per ogni altro tipo', () => {
    expect(disegna(domanda('fillblank')).campi[0].label).toBe('Frase con lo spazio ___ 4');
    expect(disegna(domanda('oddOneOut')).campi[0].label).toBe('Consegna 4');
    expect(disegna(domanda('multiple')).campi[0].label).toBe('Domanda 4');
  });

  test('i tipi senza situazione o frase non le mostrano', () => {
    for (const kind of ['single', 'truefalse', 'fillblank', 'oddOneOut', 'multiple'] as const) {
      const nomi = etichette(disegna(domanda(kind)).campi).join('|');
      expect(nomi).not.toMatch(/Situazione|Frase con l'errore|Parte sbagliata/);
    }
  });

  test('disabilitato: nessun campo modificabile, nessun pulsante attivo', () => {
    const { campi, pulsanti } = disegna(domanda('multiple'), { disabled: true });
    expect(campi.some((c) => c.editable)).toBe(false);
    expect(pulsanti.every((p) => p.disabled)).toBe(true);
  });
});

describe('scrittura nei campi', () => {
  test('il testo arriva al percorso della domanda', () => {
    const { campi, change } = disegna(domanda('scenario'));
    campi[0].scrivi('Nuova situazione');
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'situation'], 'Nuova situazione');
    campi.find((c) => c.label === 'Risposta 4.2')!.scrivi('Altra');
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'options', 1, 'text'], 'Altra');
  });

  test('una motivazione vuota o di soli spazi diventa assente', () => {
    const { campi, change } = disegna(domanda('single'));
    const motivazione = campi.find((c) => c.label === 'Motivazione 4.1 (facoltativa)')!;
    motivazione.scrivi('   ');
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'options', 0, 'rationale'], undefined);
    motivazione.scrivi(' perché sì ');
    expect(change).toHaveBeenLastCalledWith(
      ['questions', 3, 'options', 0, 'rationale'],
      ' perché sì ',
    );
  });

  test('la spiegazione vuota resta una stringa vuota', () => {
    const { campi, change } = disegna(domanda('single'));
    campi.find((c) => c.label === 'Spiegazione 4')!.scrivi('');
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'explanation'], '');
  });
});

describe('risposta giusta', () => {
  test('scelta singola: un pulsante per opzione, quella giusta segnata', () => {
    const q = domanda('single');
    const { pulsanti, change } = disegna(q);
    const giusta = q.options.findIndex((o) => o.id === q.correctOptionId);
    const perOpzione = pulsanti.slice(0, q.options.length);
    expect(perOpzione.map((p) => p.label)).toEqual(
      q.options.map((_, i) => (i === giusta ? 'Risposta corretta ✓' : 'Segna come corretta')),
    );
    expect(perOpzione.map((p) => p.secondary)).toEqual(q.options.map((_, i) => i !== giusta));
    perOpzione[1 - giusta].tocca();
    expect(change).toHaveBeenLastCalledWith(
      ['questions', 3, 'correctOptionId'],
      q.options[1 - giusta].id,
    );
  });

  test('risposta multipla: toccare una giusta la toglie, una sbagliata la aggiunge', () => {
    const q = domanda('multiple');
    const giuste = q.correctOptionIds!;
    const { pulsanti, change, testo } = disegna(q);
    const perOpzione = pulsanti.slice(0, q.options.length);
    expect(perOpzione.map((p) => p.label)).toEqual(
      q.options.map((o) =>
        giuste.includes(o.id) ? 'Giusta, tocca per togliere' : 'Segna anche questa come giusta',
      ),
    );
    const iGiusta = q.options.findIndex((o) => giuste.includes(o.id));
    const iSbagliata = q.options.findIndex((o) => !giuste.includes(o.id));
    perOpzione[iGiusta].tocca();
    expect(change).toHaveBeenLastCalledWith(
      ['questions', 3, 'correctOptionIds'],
      giuste.filter((g) => g !== q.options[iGiusta].id),
    );
    perOpzione[iSbagliata].tocca();
    expect(change).toHaveBeenLastCalledWith(
      ['questions', 3, 'correctOptionIds'],
      [...giuste, q.options[iSbagliata].id],
    );
    expect(testo).toContain(`"Risposte giuste: ","${giuste.length}"," su ","${q.options.length}"`);
  });

  test('il conteggio delle giuste compare solo nella risposta multipla', () => {
    expect(disegna(domanda('single')).testo).not.toContain('Risposte giuste');
  });
});

describe('difficoltà', () => {
  test('tre livelli con l’iniziale maiuscola e «Nessuna»', () => {
    const q = domanda('scenario');
    const { pulsanti, change } = disegna(q);
    const livelli = pulsanti.slice(-4);
    expect(livelli.map((p) => p.label)).toEqual(['Base', 'Medio', 'Avanzato', 'Nessuna']);
    expect(livelli.map((p) => p.secondary)).toEqual(
      ['base', 'medio', 'avanzato']
        .map((d) => d !== q.difficulty)
        .concat(q.difficulty !== undefined),
    );
    livelli[2].tocca();
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'difficulty'], 'avanzato');
    livelli[3].tocca();
    expect(change).toHaveBeenLastCalledWith(['questions', 3, 'difficulty'], undefined);
  });

  test('senza difficoltà «Nessuna» è quella scelta', () => {
    const q = { ...domanda('single'), difficulty: undefined };
    expect(
      disegna(q)
        .pulsanti.slice(-4)
        .map((p) => p.secondary),
    ).toEqual([true, true, true, false]);
  });
});

test('gli errori compaiono sotto il loro campo', () => {
  const { testo } = disegna(domanda('scenario'), {
    errori: { situation: ['Situazione troppo corta'], options: ['Opzioni ripetute'] },
  });
  expect(testo).toContain('Situazione troppo corta');
  expect(testo).toContain('Opzioni ripetute');
  expect(testo.indexOf('Situazione troppo corta')).toBeLessThan(
    testo.indexOf('Domanda sulla situazione 4'),
  );
});

test('l’errore della spiegazione compare sotto la spiegazione', () => {
  // Una formula autoreferenziale nella spiegazione blocca il salvataggio: il motivo deve vedersi.
  const q = { ...domanda('single'), explanation: 'Il testo indica che è la prima.' };
  const errori = { explanation: erroriTipo(q).map((e) => e.messaggio) };
  expect(errori.explanation.join()).toContain('«Il testo indica»');
  const { testo } = disegna(q, { errori });
  expect(testo).toContain('«Il testo indica»');
  expect(testo.indexOf('«Il testo indica»')).toBeGreaterThan(testo.indexOf('Spiegazione 4'));
});

test('ogni campo che le regole possono segnalare ha il suo errore visibile', () => {
  // Campi di ErroreDomanda (tipi.ts): un campo senza `sotto` renderebbe l’errore invisibile.
  // Le motivazioni (`rationale`) sono segnalate sotto `options`.
  const campiPerTipo: [Question['kind'], string[]][] = [
    ['single', ['prompt', 'options', 'correctOptionId', 'correctOptionIds', 'explanation']],
    ['scenario', ['situation']],
    ['correctStatement', ['sentence', 'wrong']],
  ];
  for (const [kind, campi] of campiPerTipo) {
    const errori = Object.fromEntries(campi.map((c) => [c, [`errore di ${c}`]]));
    const avvisi = (() => {
      let albero!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        albero = ReactTestRenderer.create(
          <DomandaEditor
            question={domanda(kind)}
            qi={3}
            errori={errori}
            disabled={false}
            change={jest.fn()}
          />,
        );
      });
      return albero.root.findAllByType(Notice).map((n) => n.props.text as string);
    })();
    expect(avvisi.sort()).toEqual(campi.map((c) => `errore di ${c}`).sort());
  }
});
