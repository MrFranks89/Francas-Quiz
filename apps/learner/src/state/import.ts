import type { Document, Extraction } from '../api/documents';

export type ImportStep = 'config' | 'material' | 'study';

export type ImportState = {
  document: Document | null;
  range: boolean;
  from: string;
  to: string;
  engine: 'native' | 'docling' | 'trascrizione';
  result: Extraction | null;
  includeMap: boolean;
  includeCourse: boolean;
  includeGamify: boolean;
  includeVoice: boolean;
  step: ImportStep;
};

export const initialImport: ImportState = {
  document: null,
  range: false,
  from: '1',
  to: '1',
  engine: 'native',
  result: null,
  includeMap: true,
  includeCourse: true,
  includeGamify: true,
  includeVoice: true,
  step: 'config',
};

export type ImportAction =
  | { type: 'document'; value: Document }
  | { type: 'range'; value: boolean }
  | { type: 'from' | 'to'; value: string }
  | { type: 'engine'; value: 'native' | 'docling' | 'trascrizione' }
  | { type: 'result'; value: Extraction }
  | { type: 'step'; value: ImportStep }
  | { type: 'toggleMap' | 'toggleCourse' | 'toggleGamify' | 'toggleVoice' }
  | {
      type: 'includeMap' | 'includeCourse' | 'includeGamify' | 'includeVoice';
      value: boolean;
    };

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'document': {
      const isImage = action.value.kind === 'image';
      const isAudio = action.value.kind === 'audio';
      return {
        ...initialImport,
        includeMap: state.includeMap,
        includeCourse: state.includeCourse,
        includeGamify: state.includeGamify,
        includeVoice: state.includeVoice,
        step: state.step === 'study' ? 'material' : state.step,
        engine: isAudio ? 'trascrizione' : isImage || action.value.hasDigitalText === false ? 'docling' : 'native',
        range: false,
        from: isImage || isAudio ? '' : '1',
        to: isImage || isAudio ? '' : String(action.value.pageCount || 1),
        document: action.value,
      };
    }
    case 'result':
      return { ...state, result: action.value, step: 'study' };
    case 'step':
      return { ...state, step: action.value };
    case 'toggleMap':
      return { ...state, includeMap: !state.includeMap };
    case 'toggleCourse':
      return { ...state, includeCourse: !state.includeCourse };
    case 'toggleGamify':
      return { ...state, includeGamify: !state.includeGamify };
    case 'toggleVoice':
      return { ...state, includeVoice: !state.includeVoice };
    case 'includeMap':
    case 'includeCourse':
    case 'includeGamify':
    case 'includeVoice':
      return { ...state, [action.type]: action.value };
    default:
      return { ...state, [action.type]: action.value, result: null };
  }
}
