import React, { useState, useReducer, useMemo, useEffect } from 'react';
import { Text, TextInput, View, StyleSheet, Platform } from 'react-native';
import * as Picker from 'expo-document-picker';
import { parsePageSelection, selectedPages } from '@formazione/contracts';
import { apiUrl, uploadDocument, extractDocument } from '../api/documents';
import { FORMATI_AMMESSI, tipiSelettore } from '../api/formats';
import { Button, Card, Notice, styles, colors } from '../components/ui';
import { importReducer, initialImport } from '../state/import';
import { GenerationPanel } from '../components/GenerationPanel';
import { PagePreviewPanel } from '../components/PagePreviewPanel';
import { ReadingMethodSelector } from '../components/ReadingMethodSelector';
import { ProposedIndexPanel } from '../components/ProposedIndexPanel';
import type { Draft } from '../api/generation';

export function ImportScreen({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const [{ document, range, from, to, engine, result }, dispatch] = useReducer(
    importReducer,
    initialImport,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [lastValidPages, setLastValidPages] = useState<number[]>([]);

  const setRange = (value: boolean) => dispatch({ type: 'range', value });
  const setFrom = (value: string) => dispatch({ type: 'from', value });
  const setTo = (value: string) => dispatch({ type: 'to', value });
  const setEngine = (value: 'native' | 'docling') => dispatch({ type: 'engine', value });

  const selectionInfo = useMemo(() => {
    if (!document || document.kind !== 'pdf' || !document.pageCount) {
      return { valid: false, pages: [] as number[], count: 0, error: null };
    }
    try {
      const selection = range
        ? parsePageSelection({ mode: 'range', fromPage: from, toPage: to }, document.pageCount)
        : { mode: 'all' as const };
      const pages = selectedPages(selection, document.pageCount);
      return { valid: true, pages, count: pages.length, error: null };
    } catch {
      return {
        valid: false,
        pages: [] as number[],
        count: 0,
        error: `Intervallo non valido: inserisci numeri interi tra 1 e ${document.pageCount}.`,
      };
    }
  }, [document, range, from, to]);

  useEffect(() => {
    if (selectionInfo.valid && selectionInfo.pages.length > 0) {
      setLastValidPages(selectionInfo.pages);
    }
  }, [selectionInfo.valid, selectionInfo.pages]);

  const previewPages = selectionInfo.valid
    ? selectionInfo.pages
    : lastValidPages.length > 0
    ? lastValidPages
    : [];

  const maxIndex = Math.max(0, previewPages.length - 1);
  const safeIndex = Math.min(activePageIndex, maxIndex);
  const currentPage = previewPages[safeIndex] ?? 1;

  async function pick() {
    setBusy(true);
    setError('');
    try {
      const selected = await Picker.getDocumentAsync({
        type: tipiSelettore(Platform.OS === 'web'),
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!selected.canceled) {
        const value = await uploadDocument(selected.assets[0]);
        dispatch({ type: 'document', value });
        setShowPreview(false);
        setActivePageIndex(0);
        setLastValidPages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Caricamento non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  async function extract() {
    if (!document) return;
    setBusy(true);
    setError('');
    try {
      const selection = range
        ? parsePageSelection({ mode: 'range', fromPage: from, toPage: to }, document.pageCount!)
        : { mode: 'all' as const };
      dispatch({ type: 'result', value: await extractDocument(document.id, selection, engine) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estrazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  function togglePreview() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (selectionInfo.valid || previewPages.length > 0) {
      setShowPreview(true);
      setError('');
    } else {
      setError(
        selectionInfo.error || 'Controlla l’intervallo: servono numeri interi tra 1 e il totale pagine.',
      );
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <Text style={styles.title}>Dal documento alla conoscenza</Text>
      <Text style={styles.body}>
        Scegli il materiale, delimita le pagine e controlla le fonti estratte. Il tuo documento
        rimane distinto dal corso dimostrativo.
      </Text>

      <Card>
        <Text style={styles.subtitle}>01 · Carica il materiale</Text>
        <Text style={styles.muted}>{FORMATI_AMMESSI} · massimo 25 MB</Text>
        <Button
          label={
            busy ? 'Operazione in corso…' : document ? 'Scegli un altro documento' : 'Scegli un documento'
          }
          onPress={pick}
          disabled={busy}
        />
        {document && (
          <View style={localStyles.docCard}>
            <View style={localStyles.docHeader}>
              <View style={localStyles.formatBadge}>
                <Text style={localStyles.formatBadgeText}>{document.kind}</Text>
              </View>
              <Text style={localStyles.docName} numberOfLines={1}>{document.name}</Text>
            </View>
            <Text style={styles.muted}>
              {document.pageCount
                ? `${document.pageCount} pagine originali rilevate`
                : 'Documento senza paginazione fissa'}
            </Text>
          </View>
        )}
      </Card>

      {document && (
        <Card>
          <Text style={styles.subtitle}>02 · Scegli cosa studiare</Text>
          <View style={styles.row}>
            <Button
              label="Tutto il volume"
              disabled={busy}
              secondary={range}
              onPress={() => setRange(false)}
            />
            <Button
              label="Da pagina… a pagina…"
              secondary={!range}
              disabled={busy || document.kind !== 'pdf'}
              onPress={() => setRange(true)}
            />
          </View>
          {document.kind !== 'pdf' && (
            <Text style={styles.muted}>
              La selezione per pagina richiede un PDF. Per gli altri formati si elabora tutto il
              documento.
            </Text>
          )}

          {document.kind === 'pdf' && range && (
            <View style={localStyles.rangeCard}>
              <View style={localStyles.rangeInputsRow}>
                <View style={localStyles.inputGroup}>
                  <Text style={localStyles.inputLabel}>Da pagina</Text>
                  <TextInput
                    accessibilityLabel="Pagina iniziale"
                    editable={!busy}
                    style={localStyles.rangeInput}
                    keyboardType="number-pad"
                    value={from}
                    onChangeText={setFrom}
                  />
                </View>
                <View style={localStyles.inputGroup}>
                  <Text style={localStyles.inputLabel}>a pagina</Text>
                  <TextInput
                    accessibilityLabel="Pagina finale"
                    editable={!busy}
                    style={localStyles.rangeInput}
                    keyboardType="number-pad"
                    value={to}
                    onChangeText={setTo}
                  />
                </View>
              </View>

              <View
                style={[
                  localStyles.statusBadge,
                  selectionInfo.valid
                    ? localStyles.statusBadgeValid
                    : localStyles.statusBadgeInvalid,
                ]}
              >
                <Text
                  style={
                    selectionInfo.valid
                      ? localStyles.statusTextValid
                      : localStyles.statusTextInvalid
                  }
                >
                  {selectionInfo.valid
                    ? `✓ ${selectionInfo.count} ${selectionInfo.count === 1 ? 'pagina selezionata' : 'pagine selezionate'} (su ${document.pageCount} totali)`
                    : `⚠️ ${selectionInfo.error ?? 'Intervallo non valido'}`}
                </Text>
              </View>
            </View>
          )}

          {document.kind === 'pdf' && !range && (
            <View style={[localStyles.statusBadge, localStyles.statusBadgeValid]}>
              <Text style={localStyles.statusTextValid}>
                ✓ Tutte le {document.pageCount} pagine del volume selezionate
              </Text>
            </View>
          )}

          {document.kind === 'pdf' && (
            <>
              <Button
                label={showPreview ? 'Nascondi anteprima pagine' : 'Controlla le pagine selezionate'}
                secondary={!showPreview}
                disabled={busy}
                onPress={togglePreview}
              />

              {showPreview && previewPages.length > 0 && (
                <PagePreviewPanel
                  documentId={document.id}
                  pages={previewPages}
                  safeIndex={safeIndex}
                  currentPage={currentPage}
                  isValidRange={selectionInfo.valid}
                  onSelectIndex={setActivePageIndex}
                  onClose={() => setShowPreview(false)}
                />
              )}
            </>
          )}

          <Text style={styles.subtitle}>03 · Metodo di lettura</Text>
          <ReadingMethodSelector
            engine={engine}
            onChange={setEngine}
            disabled={busy}
          />
          <Button
            label={busy ? 'Lettura in corso…' : 'Estrai il contenuto'}
            disabled={busy}
            onPress={extract}
          />
        </Card>
      )}

      {!!error && <Notice text={error} error />}

      {result && (
        <Card>
          <Text style={styles.subtitle}>Fonti estratte · {result.blocks.length} blocchi</Text>
          <Notice
            text={
              result.status === 'needs_review'
                ? 'Sono presenti contenuti da verificare prima di creare un corso.'
                : 'Estrazione completata. Controlla i contenuti prima della generazione didattica.'
            }
          />
          {result.warnings.map((w, i) => (
            <Notice key={i} text={w} error />
          ))}
          <ProposedIndexPanel extraction={result} />
          <GenerationPanel key={result.id} extraction={result} onDraft={onDraft} />
        </Card>
      )}
      <Text style={styles.muted}>API di sviluppo locale · {apiUrl}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  docCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatBadge: {
    backgroundColor: colors.pale,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cde4e0',
  },
  formatBadgeText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  docName: { fontSize: 16, fontWeight: '700', color: colors.navy, flex: 1 },
  rangeCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 12,
  },
  rangeInputsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  inputGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputLabel: { fontSize: 15, fontWeight: '600', color: colors.navy },
  rangeInput: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 15,
    color: colors.navy,
    backgroundColor: 'white',
    minWidth: 70,
    textAlign: 'center',
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  statusBadgeValid: { backgroundColor: colors.pale },
  statusBadgeInvalid: { backgroundColor: '#fff0eb' },
  statusTextValid: { color: colors.teal, fontSize: 13, fontWeight: '600' },
  statusTextInvalid: { color: '#9d3a24', fontSize: 13, fontWeight: '600' },
});
