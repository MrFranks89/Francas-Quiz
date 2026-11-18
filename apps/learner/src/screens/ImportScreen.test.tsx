import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput, Image, Text } from 'react-native';
import * as Picker from 'expo-document-picker';
import { uploadDocument, extractDocument, type Document } from '../api/documents';
import { fetchConceptTree } from '../api/generation';
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
    Promise.resolve({
      configured: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    })
  ),
  generationEstimate: jest.fn(() =>
    Promise.resolve({
      tokens: 1000,
      costEur: 0.05,
      estimatedMinutes: 2,
      unreadPages: [],
    })
  ),
  generateDraft: jest.fn(),
  fetchConceptTree: jest.fn(),
}));

const mockPicker = Picker.getDocumentAsync as jest.MockedFunction<typeof Picker.getDocumentAsync>;
const mockUpload = uploadDocument as jest.MockedFunction<typeof uploadDocument>;
const mockExtract = extractDocument as jest.MockedFunction<typeof extractDocument>;
const mockFetchConceptTree = fetchConceptTree as jest.MockedFunction<typeof fetchConceptTree>;

describe('ImportScreen anteprima persistente e navigazione', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function renderScreen() {
    const onDraft = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<ImportScreen onDraft={onDraft} />);
    });
    const nextBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Avanti: Seleziona Materiale e Capitoli →');
    await act(async () => {
      nextBtn?.props.onPress();
    });
    return { renderer, onDraft };
  }

  async function loadPdfDocument(renderer: ReactTestRenderer.ReactTestRenderer, pageCount = 10) {
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
      id: 'doc-pdf-1',
      name: 'manuale.pdf',
      kind: 'pdf',
      pageCount,
    });

    const chooseBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Scegli un documento');
    await act(async () => {
      await chooseBtn?.props.onPress();
    });
  }

  test('apre l’anteprima e permette di navigare le pagine senza chiudersi alla modifica del range', async () => {
    const { renderer } = await renderScreen();
    await loadPdfDocument(renderer, 10);

    // Seleziona modalità range
    const rangeBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Da pagina… a pagina…');
    await act(async () => {
      rangeBtn?.props.onPress();
    });

    // Imposta range da 3 a 7
    const fromInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina iniziale');
    const toInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina finale');

    await act(async () => {
      fromInput?.props.onChangeText('3');
      toInput?.props.onChangeText('7');
    });

    // Clicca "Controlla le pagine selezionate"
    const previewBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Controlla le pagine selezionate');
    expect(previewBtn).toBeDefined();

    await act(async () => {
      previewBtn?.props.onPress();
    });

    // L'anteprima deve essere visibile e mostrare pagina 3 (la prima del range 3..7)
    let images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(1);
    expect(images[0].props.accessibilityLabel).toBe('Anteprima pagina 3');

    // Clicca "Successiva →" per passare alla pagina 4
    const nextBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Pagina successiva' })[0];
    await act(async () => {
      nextBtn.props.onPress();
    });

    images = renderer.root.findAllByType(Image);
    expect(images[0].props.accessibilityLabel).toBe('Anteprima pagina 4');

    // MODIFICA DEL RANGE: cambia "Da" a "2" e "A" a "8"
    // L'anteprima NON deve chiudersi!
    await act(async () => {
      fromInput?.props.onChangeText('2');
    });

    images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(1); // È ancora aperta!

    await act(async () => {
      toInput?.props.onChangeText('8');
    });

    images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(1); // È ancora aperta!

    // Se l'utente digita temporaneamente una stringa vuota, non collassa
    await act(async () => {
      toInput?.props.onChangeText('');
    });
    images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(1); // Vista non collassata!

    // Ripristina valore valido
    await act(async () => {
      toInput?.props.onChangeText('6');
    });
    images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(1);

    // Clicca "Nascondi anteprima pagine" per chiuderla
    const hideBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Nascondi anteprima pagine');
    await act(async () => {
      hideBtn?.props.onPress();
    });

    images = renderer.root.findAllByType(Image);
    expect(images.length).toBe(0);
  });

  test('consente di saltare a una pagina specifica tramite le pillole nella strip', async () => {
    const { renderer } = await renderScreen();
    await loadPdfDocument(renderer, 10);

    const rangeBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Da pagina… a pagina…');
    await act(async () => {
      rangeBtn?.props.onPress();
    });

    const fromInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina iniziale');
    const toInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina finale');

    await act(async () => {
      fromInput?.props.onChangeText('4');
      toInput?.props.onChangeText('8');
    });

    const previewBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Controlla le pagine selezionate');
    await act(async () => {
      previewBtn?.props.onPress();
    });

    // Salta direttamente alla pagina 7 cliccando la pillola "Vai a pagina 7"
    const pillPage7 = renderer.root
      .findAllByProps({ accessibilityLabel: 'Vai a pagina 7' })[0];
    expect(pillPage7).toBeDefined();

    await act(async () => {
      pillPage7.props.onPress();
    });

    const images = renderer.root.findAllByType(Image);
    expect(images[0].props.accessibilityLabel).toBe('Anteprima pagina 7');

    // Chiudi con il tasto ✕ Chiudi
    const closeBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Chiudi anteprima' })[0];
    await act(async () => {
      closeBtn.props.onPress();
    });

    expect(renderer.root.findAllByType(Image).length).toBe(0);
  });

  test('sincronizza l’esclusione delle pagine tra schede fonti e GenerationPanel', async () => {
    const { renderer } = await renderScreen();
    await loadPdfDocument(renderer, 5);

    mockExtract.mockResolvedValueOnce({
      id: 'ext-1',
      status: 'ready',
      engine: 'native',
      warnings: [],
      blocks: [
        { id: 'b1', label: 'Blocco 1', page: 1, text: 'Contenuto pagina 1' },
        { id: 'b2', label: 'Blocco 2', page: 2, text: 'Contenuto pagina 2 da escludere' },
      ],
    });

    const extractBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Estrai il contenuto');
    expect(extractBtn).toBeDefined();

    await act(async () => {
      await extractBtn?.props.onPress();
    });

    // Passa alla vista "Testo fonti completo"
    const sourcesTab = renderer.root
      .findAllByProps({ accessibilityLabel: 'Vista testo integrale' })[0];
    expect(sourcesTab).toBeDefined();

    await act(async () => {
      sourcesTab.props.onPress();
    });

    // Switch per escludere pagina 2
    const switchPagina2 = renderer.root
      .findAllByProps({ accessibilityLabel: 'Includi Pagina 2 nella generazione didattica' })[0];
    expect(switchPagina2).toBeDefined();
    expect(switchPagina2.props.value).toBe(true);

    await act(async () => {
      switchPagina2.props.onValueChange(false);
    });

    expect(switchPagina2.props.value).toBe(false);
    const allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ');
    expect(allTexts).toContain('1 pagina esclusa dalla generazione didattica: 2');
  });

  test('mostra i capitoli rilevati e imposta automaticamente range al tocco', async () => {
    const { renderer } = await renderScreen();
    mockPicker.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://libro.pdf',
          name: 'libro.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          file: undefined,
          lastModified: 0,
        },
      ],
    });
    mockUpload.mockResolvedValueOnce({
      id: 'doc-cap-1',
      name: 'libro.pdf',
      kind: 'pdf',
      pageCount: 40,
      chapters: [
        { title: 'Capitolo 1', fromPage: 1, toPage: 28, level: 1 },
        { title: 'Capitolo 2', fromPage: 29, toPage: 40, level: 1 },
      ],
    });

    const chooseBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Scegli un documento');
    await act(async () => {
      await chooseBtn?.props.onPress();
    });

    const capBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Seleziona Capitolo 1 · pp. 1–28' })[0];
    expect(capBtn).toBeDefined();

    await act(async () => {
      capBtn.props.onPress();
    });

    const fromInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina iniziale');
    const toInput = renderer.root
      .findAllByType(TextInput)
      .find((i) => i.props.accessibilityLabel === 'Pagina finale');
    expect(fromInput?.props.value).toBe('1');
    expect(toInput?.props.value).toBe('28');
  });

  test('genera e visualizza la mappa concettuale con scheda dettaglio nodo', async () => {
    const { renderer } = await renderScreen();
    await loadPdfDocument(renderer, 5);

    mockExtract.mockResolvedValueOnce({
      id: 'ext-map-1',
      status: 'ready',
      engine: 'native',
      warnings: [],
      blocks: [
        { id: 'b1', label: 'Pagina 1', page: 1, text: 'Testo di riferimento su sicurezza.' },
      ],
    });

    mockFetchConceptTree.mockResolvedValueOnce({
      schemaVersion: 1,
      id: 'tree-1',
      rootTitle: 'Sicurezza Sul Lavoro',
      branches: [{
        id: 'branch-1',
        title: 'Prevenzione',
        nodes: [{
          id: 'node-1',
          title: 'Valutazione dei rischi',
          summary: 'Analisi preventiva dei pericoli in azienda.',
          sourceRefs: ['p. 1'],
        }],
      }],
    });

    const extractBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === 'Estrai il contenuto');
    await act(async () => { await extractBtn?.props.onPress(); });

    const mapBtn = renderer.root
      .findAllByType(Button)
      .find((b) => b.props.label === "Genera Mappa Concettuale con l'AI");
    expect(mapBtn).toBeDefined();
    await act(async () => { await mapBtn?.props.onPress(); });

    expect(mockFetchConceptTree).toHaveBeenCalledWith('ext-map-1', []);
    let allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ');
    expect(allTexts).toContain('Sicurezza Sul Lavoro');
    expect(allTexts).toContain('Prevenzione');
    expect(allTexts).toContain('Valutazione dei rischi');
    expect(allTexts).toContain('[p. 1]');

    const collapseBtn = renderer.root
      .findAllByProps({ accessibilityLabel: 'Comprimi ramo Prevenzione' })[0];
    await act(async () => { collapseBtn.props.onPress(); });

    allTexts = renderer.root.findAllByType(Text).map((t) => t.props.children).flat().join(' ');
    expect(allTexts).not.toContain('Valutazione dei rischi');
  });
});
