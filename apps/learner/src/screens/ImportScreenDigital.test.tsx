import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import * as Picker from 'expo-document-picker';
import { uploadDocument, extractDocument } from '../api/documents';
import { Button } from '../components/ui';
import { ImportScreen } from './ImportScreen';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('../api/documents', () => ({
  apiUrl: 'http://localhost:8000',
  uploadDocument: jest.fn(),
  extractDocument: jest.fn(),
}));

jest.mock('../api/generation', () => ({
  generationConfig: jest.fn(() =>
    Promise.resolve({ configured: true, provider: 'anthropic', model: 'claude-3-5-sonnet' }),
  ),
  generationEstimate: jest.fn(() =>
    Promise.resolve({ tokens: 1000, costEur: 0.05, estimatedMinutes: 2, unreadPages: [] }),
  ),
  generateDraft: jest.fn(),
  fetchConceptTree: jest.fn(),
}));

const mockPicker = Picker.getDocumentAsync as jest.MockedFunction<typeof Picker.getDocumentAsync>;
const mockUpload = uploadDocument as jest.MockedFunction<typeof uploadDocument>;
const mockExtract = extractDocument as jest.MockedFunction<typeof extractDocument>;

function allText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ');
}

describe('ImportScreen rilevamento testo digitale e avanzamento estrazione', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('preseleziona native per PDF digitale, docling per scansione e aggiorna cronometro', async () => {
    jest.useFakeTimers();
    try {
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<ImportScreen onDraft={jest.fn()} />);
      });

      mockPicker.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file://scan.pdf',
            name: 'scan.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            file: undefined,
            lastModified: 0,
          },
        ],
      });
      mockUpload.mockResolvedValueOnce({
        id: 'doc-scan-1',
        name: 'scan.pdf',
        kind: 'pdf',
        pageCount: 12,
        hasDigitalText: false,
      });

      const chooseBtn = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'Scegli un documento');
      await act(async () => {
        await chooseBtn?.props.onPress();
      });

      const doclingCard = renderer.root.findAllByProps({ accessibilityLabel: 'Docling / OCR' })[0];
      expect(doclingCard.props.accessibilityState.selected).toBe(true);

      let resolveExtraction!: (value: any) => void;
      mockExtract.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveExtraction = resolve;
          }),
      );

      const extractBtn = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'Estrai il contenuto');
      await act(async () => {
        extractBtn?.props.onPress();
      });

      expect(allText(renderer)).toContain('Tempo trascorso: 00:00');
      expect(allText(renderer)).toContain('Riconoscimento ottico caratteri (OCR) in corso');
      expect(allText(renderer)).toContain('Inizializzazione pipeline');
      expect(allText(renderer)).toContain('Processo attivo in background sul tuo computer');

      await act(async () => {
        jest.advanceTimersByTime(6000);
      });
      expect(allText(renderer)).toContain('Tempo trascorso: 00:06');
      expect(allText(renderer)).toContain('Riconoscimento caratteri e layout');

      await act(async () => {
        jest.advanceTimersByTime(20000);
      });
      expect(allText(renderer)).toContain('Tempo trascorso: 00:26');
      expect(allText(renderer)).toContain('Strutturazione blocchi e fonti');

      await act(async () => {
        resolveExtraction({
          id: 'ext-scan-1',
          status: 'ready',
          engine: 'docling',
          warnings: [],
          blocks: [{ id: 'b1', label: 'Pagina 1', page: 1, text: 'Testo OCR' }],
        });
      });

      expect(allText(renderer)).not.toContain('Tempo trascorso:');

      mockPicker.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file://digitale.pdf',
            name: 'digitale.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            file: undefined,
            lastModified: 0,
          },
        ],
      });
      mockUpload.mockResolvedValueOnce({
        id: 'doc-dig-1',
        name: 'digitale.pdf',
        kind: 'pdf',
        pageCount: 140,
        hasDigitalText: true,
      });

      const changeBtn = renderer.root
        .findAllByType(Button)
        .find((b) => b.props.label === 'Scegli un altro documento');
      await act(async () => {
        await changeBtn?.props.onPress();
      });

      const nativeCard = renderer.root.findAllByProps({ accessibilityLabel: 'Testo nativo' })[0];
      expect(nativeCard.props.accessibilityState.selected).toBe(true);
      expect(allText(renderer)).toContain('Testo digitale già presente');
    } finally {
      jest.useRealTimers();
    }
  });
});
