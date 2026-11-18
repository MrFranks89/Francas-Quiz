import { importReducer, initialImport } from './import';
import type { Extraction } from '../api/documents';

const extraction: Extraction = {
  id: 'e',
  status: 'ready',
  blocks: [],
  warnings: [],
  engine: 'native',
};

it('invalidates extracted text when pages or OCR engine change', () => {
  const state = { ...initialImport, result: extraction };
  for (const action of [
    { type: 'from', value: '201' },
    { type: 'to', value: '300' },
    { type: 'range', value: true },
    { type: 'engine', value: 'docling' },
  ] as const)
    expect(importReducer(state, action).result).toBeNull();
});

it('new upload clears range and extraction associated with old file', () => {
  const result = importReducer(
    {
      ...initialImport,
      range: true,
      from: '201',
      to: '300',
      result: extraction,
      includeMap: false,
      step: 'study',
    },
    { type: 'document', value: { id: 'new', name: 'note.txt', kind: 'txt', pageCount: null } },
  );
  expect(result).toMatchObject({
    range: false,
    from: '1',
    to: '1',
    result: null,
    document: { id: 'new' },
    engine: 'native',
    includeMap: false,
    step: 'material',
  });
});

it('selects docling when hasDigitalText is false and resets to native when true', () => {
  const scanState = importReducer(initialImport, {
    type: 'document',
    value: { id: 'scan', name: 'scan.pdf', kind: 'pdf', pageCount: 10, hasDigitalText: false },
  });
  expect(scanState.engine).toBe('docling');

  const digitalState = importReducer(scanState, {
    type: 'document',
    value: { id: 'dig', name: 'book.pdf', kind: 'pdf', pageCount: 140, hasDigitalText: true },
  });
  expect(digitalState.engine).toBe('native');
});

it('handles study configuration toggles and step transitions without clearing result', () => {
  let state = importReducer(initialImport, { type: 'toggleMap' });
  expect(state.includeMap).toBe(false);

  state = importReducer(state, { type: 'toggleCourse' });
  expect(state.includeCourse).toBe(false);

  state = importReducer(state, { type: 'toggleGamify' });
  expect(state.includeGamify).toBe(false);

  state = importReducer(state, { type: 'toggleVoice' });
  expect(state.includeVoice).toBe(false);

  state = importReducer(state, { type: 'includeMap', value: true });
  expect(state.includeMap).toBe(true);

  state = importReducer(state, { type: 'step', value: 'material' });
  expect(state.step).toBe('material');

  state = importReducer(state, { type: 'result', value: extraction });
  expect(state.step).toBe('study');
  expect(state.result).toEqual(extraction);

  state = importReducer(state, { type: 'step', value: 'material' });
  expect(state.step).toBe('material');
  expect(state.result).toEqual(extraction);
});
