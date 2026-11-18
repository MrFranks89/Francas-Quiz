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
        coppie: false,
      },
      truefalse: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: false,
        motivazioni: false,
        piuGiuste: false,
        coppie: false,
      },
      fillblank: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
        coppie: false,
      },
      scenario: {
        situazione: true,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
        coppie: false,
      },
      oddOneOut: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
        coppie: false,
      },
      correctStatement: {
        situazione: false,
        fraseConErrore: true,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
        coppie: false,
      },
      multiple: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: true,
        coppie: false,
      },
      matching: {
        situazione: false,
        fraseConErrore: false,
        testoRisposteModificabile: true,
        motivazioni: true,
        piuGiuste: false,
        coppie: true,
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
