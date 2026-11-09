import { CourseSchema, DIFFICOLTA, TIPI_DOMANDA } from '@formazione/contracts';
import sample from '../../../../packages/contracts/fixtures/sample-course.json';
import { alternaGiusta, campiDelTipo, etichettaDifficolta, giusteDi } from './editorDomanda';

describe('campiDelTipo', () => {
  it('ogni tipo ha i suoi campi', () => {
    const tabella = Object.fromEntries(TIPI_DOMANDA.map((k) => [k, campiDelTipo(k)]));
    expect(tabella).toEqual({
      single: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
      },
      truefalse: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: false,
        motivazioni: false,
        piuGiuste: false,
      },
      fillblank: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
      },
      scenario: {
        situazione: true,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
      },
      oddOneOut: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
      },
      correctStatement: {
        situazione: false,
        fraseConErrore: true,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
      },
      multiple: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: true,
      },
    });
  });
});

describe('alternaGiusta', () => {
  it('toglie una giusta senza cambiare l’ordine delle altre', () => {
    expect(alternaGiusta(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
  it('aggiunge una sbagliata in fondo', () => {
    expect(alternaGiusta(['a', 'c'], 'b')).toEqual(['a', 'c', 'b']);
  });
  it('non modifica l’elenco ricevuto', () => {
    const giuste = ['a'];
    alternaGiusta(giuste, 'b');
    alternaGiusta(giuste, 'a');
    expect(giuste).toEqual(['a']);
  });
});

it('giusteDi: le giuste della multipla, vuoto per gli altri tipi', () => {
  const corso = CourseSchema.parse(sample);
  const multipla = corso.questions.find((q) => q.kind === 'multiple')!;
  expect(giusteDi(multipla)).toEqual(multipla.correctOptionIds);
  expect(giusteDi(corso.questions.find((q) => q.kind === 'single')!)).toEqual([]);
});

it('etichettaDifficolta: iniziale maiuscola', () => {
  expect(DIFFICOLTA.map(etichettaDifficolta)).toEqual(['Base', 'Medio', 'Avanzato']);
});
