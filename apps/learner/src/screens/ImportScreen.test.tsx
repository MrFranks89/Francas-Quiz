import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput, Image, Text } from 'react-native';
import * as Picker from 'expo-document-picker';
import { uploadDocument, type Document } from '../api/documents';
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

const mockPicker = Picker.getDocumentAsync as jest.MockedFunction<typeof Picker.getDocumentAsync>;
const mockUpload = uploadDocument as jest.MockedFunction<typeof uploadDocument>;

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
});
