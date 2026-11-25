import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import * as Picker from 'expo-document-picker';
import { uploadDocument, extractDocument } from '../api/documents';
import { fetchConceptTree } from '../api/generation';
import { Button } from '../components/ui';
import { ImportScreen } from './ImportScreen';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
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
const mockTree = fetchConceptTree as jest.MockedFunction<typeof fetchConceptTree>;

function readText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ');
}

describe('ImportScreen flusso config-materiale-studio e scheda nodo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function pickPdf() {
    mockPicker.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://test.pdf',
          name: 'manuale.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          file: undefined,
          lastModified: 0,
        },
      ],
    });
    mockUpload.mockResolvedValueOnce({
      id: 'doc-cfg-1',
      name: 'manuale.pdf',
      kind: 'pdf',
      pageCount: 5,
    });
  }

  test('apre scheda di dettaglio al clic su un nodo della mappa concettuale', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<ImportScreen onDraft={jest.fn()} />);
    });

    const nextBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Avanti: Seleziona Materiale e Capitoli →');
    await act(async () => {
      nextBtn?.props.onPress();
    });

    await pickPdf();
    const chooseBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Scegli un documento');
    await act(async () => {
      await chooseBtn?.props.onPress();
    });

    mockExtract.mockResolvedValueOnce({
      id: 'ext-node-1',
      status: 'ready',
      engine: 'native',
      warnings: [],
      blocks: [{ id: 'b1', label: 'P1', page: 1, text: 'Testo di riferimento.' }],
    });
    mockTree.mockResolvedValueOnce({
      schemaVersion: 1,
      id: 'tree-detail',
      rootTitle: 'Sicurezza Sul Lavoro',
      branches: [
        {
          id: 'b1',
          title: 'Prevenzione',
          nodes: [
            {
              id: 'n1',
              title: 'Valutazione dei rischi',
              summary: 'Analisi preventiva dei pericoli in azienda.',
              sourceRefs: ['p. 1'],
              keyTerms: ['Analisi preventiva', 'Pericoli in azienda'],
            },
          ],
        },
      ],
    });

    const extractBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Estrai il contenuto');
    await act(async () => {
      await extractBtn?.props.onPress();
    });

    const mapBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === "Genera Mappa Concettuale con l'AI");
    await act(async () => {
      await mapBtn?.props.onPress();
    });

    const nodeBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Apri scheda concetto Valutazione dei rischi' })[0];
    await act(async () => {
      nodeBtn.props.onPress();
    });

    const texts = readText(renderer);
    expect(texts).toContain('SCHEDA CONCETTO');
    expect(texts).toContain('Fonte: Prevenzione · [p. 1]');
    expect(texts).toContain('Analisi preventiva');
    expect(texts).toContain('Pericoli in azienda');
  });

  test('filtra i moduli nello step studio secondo la configurazione scelta', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<ImportScreen onDraft={jest.fn()} />);
    });

    const expandBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Personalizza la modalità di studio' })[0];
    if (expandBtn) {
      await act(async () => {
        expandBtn.props.onPress();
      });
    }

    const toggleMap = renderer.root
      .findAllByProps({ accessibilityLabel: 'Includi Mappa Concettuale' })[0];
    const toggleVoice = renderer.root
      .findAllByProps({ accessibilityLabel: 'Includi Ripetizione a Voce' })[0];
    await act(async () => {
      toggleMap.props.onPress();
      toggleVoice.props.onPress();
    });

    const nextBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Avanti: Seleziona Materiale e Capitoli →');
    await act(async () => {
      nextBtn?.props.onPress();
    });

    const backConfig = renderer.root
      .findAllByProps({ accessibilityLabel: 'Modifica impostazioni percorso' })[0];
    expect(backConfig).toBeDefined();

    await pickPdf();
    const chooseBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Scegli un documento');
    await act(async () => {
      await chooseBtn?.props.onPress();
    });

    mockExtract.mockResolvedValueOnce({
      id: 'ext-cfg-1',
      status: 'ready',
      engine: 'native',
      warnings: [],
      blocks: [{ id: 'b1', label: 'P1', page: 1, text: 'Testo base' }],
    });

    const extractBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Estrai il contenuto');
    await act(async () => {
      await extractBtn?.props.onPress();
    });

    const texts = readText(renderer);
    expect(texts).not.toContain("Genera Mappa Concettuale con l'AI");
    expect(texts).not.toContain('Simulatore di Esposizione Orale');
    expect(texts).toContain('Livello Padronanza:');
    expect(texts).toContain('Crea una bozza didattica');
  });
});
