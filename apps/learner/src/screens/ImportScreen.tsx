import React, { useState, useReducer, useMemo, useEffect } from 'react';
import { Text, View, StyleSheet, Platform, Pressable } from 'react-native';
import * as Picker from 'expo-document-picker';
import { parsePageSelection, selectedPages, type Course } from '@formazione/contracts';
import { apiUrl, uploadDocument, extractDocument, type DocumentChapter } from '../api/documents';
import { FORMATI_AMMESSI, tipiSelettore } from '../api/formats';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { Button, Card, Notice, colors, useUiStyles } from '../components/ui';
import { importReducer, initialImport } from '../state/import';
import { PagePreviewPanel } from '../components/PagePreviewPanel';
import { ReadingMethodSelector } from '../components/ReadingMethodSelector';
import { ChaptersSelector } from '../components/ChaptersSelector';
import { PageRangeCard } from '../components/PageRangeCard';
import { ExtractionProgressCard } from '../components/ExtractionProgressCard';
import { StudyConfigCard } from '../components/StudyConfigCard';
import { StudyExperienceView } from '../components/StudyExperienceView';
import { FotoPicker, type PickedAsset } from '../components/FotoPicker';
import { AudioPicker } from '../components/AudioPicker';
import type { Draft } from '../api/generation';

export function ImportScreen({ onDraft, onStartPractice }: {
  onDraft: (draft: Draft) => void;
  onStartPractice?: (course: Course) => void;
}) {
  const C = usePalette(), { dark } = useTheme(), s = useUiStyles();
  const [state, dispatch] = useReducer(importReducer, initialImport);
  const { document, range, from, to, engine, result, step } = state;
  const { includeMap, includeCourse, includeGamify, includeVoice } = state;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [lastValidPages, setLastValidPages] = useState<number[]>([]);
  const [excludedPages, setExcludedPages] = useState<number[]>([]);
  const [rangeHighlighted, setRangeHighlighted] = useState(false);

  const setRange = (v: boolean) => { setRangeHighlighted(false); dispatch({ type: 'range', value: v }); };
  const setFrom = (v: string) => { setRangeHighlighted(false); dispatch({ type: 'from', value: v }); };
  const setTo = (v: string) => { setRangeHighlighted(false); dispatch({ type: 'to', value: v }); };

  function selectChapter(ch: DocumentChapter) {
    dispatch({ type: 'range', value: true });
    dispatch({ type: 'from', value: String(ch.fromPage) });
    dispatch({ type: 'to', value: String(ch.toPage) });
    setRangeHighlighted(true);
  }

  function togglePageExclusion(page: number) {
    setExcludedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page].sort((a, b) => a - b),
    );
  }

  const selectionInfo = useMemo(() => {
    if (!document) return { valid: false, pages: [] as number[], count: 0, error: null };
    if (document.kind === 'image' || document.kind === 'audio') return { valid: true, pages: [1], count: 1, error: null };
    if (document.kind !== 'pdf' || !document.pageCount) {
      return { valid: false, pages: [] as number[], count: 0, error: null };
    }
    try {
      const sel = range
        ? parsePageSelection({ mode: 'range', fromPage: from, toPage: to }, document.pageCount)
        : { mode: 'all' as const };
      const pages = selectedPages(sel, document.pageCount);
      return { valid: true, pages, count: pages.length, error: null };
    } catch {
      return {
        valid: false, pages: [] as number[], count: 0,
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
    : lastValidPages.length > 0 ? lastValidPages : [];
  const safeIndex = Math.min(activePageIndex, Math.max(0, previewPages.length - 1));
  const currentPage = previewPages[safeIndex] ?? 1;

  async function accetta(asset: Picker.DocumentPickerAsset | PickedAsset) {
    setBusy(true);
    setError('');
    try {
      const value = await uploadDocument(asset as Picker.DocumentPickerAsset);
      dispatch({ type: 'document', value });
      setShowPreview(false);
      setActivePageIndex(0);
      setLastValidPages([]);
      setExcludedPages([]);
      setRangeHighlighted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Caricamento non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    try {
      const res = await Picker.getDocumentAsync({
        type: tipiSelettore(Platform.OS === 'web'),
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!res.canceled) await accetta(res.assets[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Selezione non riuscita.');
    }
  }

  async function extract() {
    if (!document) return;
    setBusy(true);
    setError('');
    try {
      const sel =
        range && document.kind === 'pdf'
          ? parsePageSelection({ mode: 'range', fromPage: from, toPage: to }, document.pageCount!)
          : { mode: 'all' as const };
      dispatch({ type: 'result', value: await extractDocument(document.id, sel, engine) });
      setExcludedPages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estrazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  function togglePreview() {
    if (showPreview) { setShowPreview(false); return; }
    if (selectionInfo.valid || previewPages.length > 0) {
      setShowPreview(true);
      setError('');
    } else {
      setError(selectionInfo.error || 'Controlla l’intervallo: servono numeri interi tra 1 e il totale.');
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <Text style={s.title}>Dal documento alla conoscenza</Text>
      <Text style={s.body}>
        Configura il percorso, scegli il materiale e genera strumenti di studio interattivi
        mantenendo il controllo sulle fonti estratte.
      </Text>

      {step === 'config' && (
        <StudyConfigCard
          includeMap={includeMap} includeCourse={includeCourse}
          includeGamify={includeGamify} includeVoice={includeVoice}
          onToggleMap={() => dispatch({ type: 'toggleMap' })}
          onToggleCourse={() => dispatch({ type: 'toggleCourse' })}
          onToggleGamify={() => dispatch({ type: 'toggleGamify' })}
          onToggleVoice={() => dispatch({ type: 'toggleVoice' })}
          onNext={() => dispatch({ type: 'step', value: result ? 'study' : 'material' })}
        />
      )}

      {step === 'material' && (
        <>
          <View style={localStyles.stepNavRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modifica impostazioni percorso"
              onPress={() => dispatch({ type: 'step', value: 'config' })}
              style={({ pressed }) => [localStyles.backLink, pressed && { opacity: 0.7 }]}
            >
              <Text style={[localStyles.backLinkText, dark && { color: '#60a5fa' }]}>
                ← Modifica impostazioni percorso
              </Text>
            </Pressable>
            <Text style={s.muted}>Passo 2 di 3 · Materiale di studio</Text>
          </View>

          <Card>
            <Text style={s.subtitle}>01 · Carica il materiale</Text>
            <Text style={s.muted}>{FORMATI_AMMESSI} · massimo 25 MB</Text>
            <Button
              label={busy ? 'Operazione in corso…' : document ? 'Scegli un altro documento' : 'Scegli un documento'}
              onPress={pick}
              disabled={busy}
            />
            <FotoPicker onPick={accetta} onError={setError} disabled={busy} />
            <AudioPicker onPick={accetta} onError={setError} disabled={busy} />
            {document && (
              <View
                style={[
                  localStyles.docCard,
                  dark && { backgroundColor: C.surface, borderColor: C.border },
                ]}
              >
                <View style={localStyles.docHeader}>
                  <View
                    style={[
                      localStyles.formatBadge,
                      dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
                    ]}
                  >
                    <Text style={[localStyles.formatBadgeText, dark && { color: C.teal }]}>
                      {document.kind}
                    </Text>
                  </View>
                  <Text style={[localStyles.docName, dark && { color: C.text }]} numberOfLines={1}>
                    {document.name}
                  </Text>
                </View>
                <Text style={s.muted}>
                  {document.kind === 'image'
                    ? 'Foto o immagine (1 pagina)'
                    : document.kind === 'audio'
                      ? 'File audio (trascrizione automatica)'
                      : document.pageCount
                        ? `${document.pageCount} pagine originali rilevate`
                        : 'Documento senza paginazione fissa'}
                </Text>
              </View>
            )}
          </Card>

          {document && (
            <Card>
              <Text style={s.subtitle}>
                {document.kind === 'image'
                  ? '02 · Elaborazione immagine'
                  : document.kind === 'audio'
                    ? '02 · Trascrizione audio'
                    : '02 · Scegli cosa studiare'}
              </Text>
              <Text style={s.muted}>
                {document.kind === 'image'
                  ? 'La foto verrà letta con riconoscimento ottico del testo (OCR).'
                  : document.kind === 'audio'
                    ? 'Verrà trascritto automaticamente con riconoscimento vocale. Controlla il testo prima di generare: nomi propri e numeri possono essere imprecisi.'
                    : 'Scegli se analizzare l’intero documento o un intervallo di pagine.'}
              </Text>

              {document.kind !== 'image' && document.kind !== 'audio' && (
                <>
                  <View style={s.row}>
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
                    <Text style={s.muted}>
                      La selezione per pagina richiede un PDF. Per gli altri formati si elabora tutto.
                    </Text>
                  )}

                  {document.chapters && document.chapters.length > 0 && (
                    <ChaptersSelector
                      chapters={document.chapters}
                      range={range}
                      from={from}
                      to={to}
                      disabled={busy}
                      onSelect={selectChapter}
                    />
                  )}

                  {document.kind === 'pdf' && document.pageCount !== null && (
                    <PageRangeCard
                      pageCount={document.pageCount} range={range} from={from} to={to}
                      busy={busy} highlighted={rangeHighlighted} valid={selectionInfo.valid}
                      selectedCount={selectionInfo.count} error={selectionInfo.error}
                      onChangeFrom={setFrom} onChangeTo={setTo}
                    />
                  )}
                </>
              )}

              {(document.kind === 'pdf' || document.kind === 'image') && (
                <>
                  <Button
                    label={
                      showPreview
                        ? document.kind === 'image' ? 'Nascondi anteprima' : 'Nascondi anteprima pagine'
                        : document.kind === 'image' ? 'Controlla la foto caricata' : 'Controlla le pagine selezionate'
                    }
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

              {document.kind !== 'image' && document.kind !== 'audio' && (
                <>
                  <Text style={s.subtitle}>03 · Metodo di lettura</Text>
                  <ReadingMethodSelector
                    engine={engine as 'native' | 'docling'}
                    onChange={(value) => dispatch({ type: 'engine', value })}
                    disabled={busy}
                    hasDigitalText={document?.hasDigitalText}
                  />
                </>
              )}

              <View style={s.row}>
                <Button
                  label={busy ? 'Lettura in corso…' : 'Estrai il contenuto'}
                  disabled={busy}
                  onPress={extract}
                />
                {result && (
                  <Button
                    label="Torna all'esperienza di studio →"
                    secondary
                    disabled={busy}
                    onPress={() => dispatch({ type: 'step', value: 'study' })}
                  />
                )}
              </View>
              {busy && (
                <ExtractionProgressCard
                  engine={engine}
                  pageCount={document?.pageCount ?? 1}
                  selectedPagesCount={selectionInfo.count || (document?.pageCount ?? 1)}
                />
              )}
            </Card>
          )}
        </>
      )}

      {!!error && <Notice text={error} error />}

      {step === 'study' && result && (
        <StudyExperienceView
          extraction={result} documentName={document?.name}
          includeMap={includeMap} includeCourse={includeCourse}
          includeGamify={includeGamify} includeVoice={includeVoice}
          excludedPages={excludedPages} onTogglePage={togglePageExclusion}
          onExcludedPagesChange={setExcludedPages} onDraft={onDraft}
          onStartPractice={onStartPractice}
          onBackToMaterial={() => dispatch({ type: 'step', value: 'material' })}
          onBackToConfig={() => dispatch({ type: 'step', value: 'config' })}
        />
      )}

      <Text style={s.muted}>API di sviluppo locale · {apiUrl}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  stepNavRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    alignItems: 'center', gap: 8,
  },
  backLink: { paddingVertical: 4 },
  backLinkText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  docCard: {
    backgroundColor: '#f8fafc', borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, padding: 14, gap: 8,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatBadge: {
    backgroundColor: colors.pale, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: '#cde4e0',
  },
  formatBadgeText: {
    color: colors.teal, fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
  },
  docName: { fontSize: 16, fontWeight: '700', color: colors.navy, flex: 1 },
});
