import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {
  generationConfig,
  generationEstimate,
  generateDraft,
  type GenerationConfig,
  type GenerationEstimate,
  type Draft,
} from '../api/generation';
import { ErroreGenerazione, type BlocchiSalvati } from '../api/errors';
import {
  etichettaGenerazione,
  messaggioConfigurazione,
  statoRipresa,
  testoEsclusione,
  testoPagineNonLette,
  testoPreventivo,
  testoRipresa,
} from '../state/generazione';
import { seguiImpostazioni } from '../state/impostazioni';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import type { Extraction } from '../api/documents';
import { Button, Notice, useUiStyles, colors } from './ui';
import { EstimateCard } from './EstimateCard';

export function GenerationPanel({
  extraction,
  onDraft,
  excludedPages,
  onExcludedPagesChange,
}: {
  extraction: Extraction;
  onDraft: (draft: Draft) => void;
  excludedPages?: number[];
  onExcludedPagesChange?: (pages: number[]) => void;
}) {
  const C = usePalette(), { dark } = useTheme(), s = useUiStyles();
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('Il mio corso');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null);
  const [internalEscluse, setInternalEscluse] = useState<number[]>([]);
  // Esito dell'ultima generazione fallita: tenuto a parte da `error`, che refresh() azzera.
  const [fallita, setFallita] = useState<{ messaggio: string; ripresa: BlocchiSalvati | null } | null>(
    null,
  );

  // Pagine escluse: da prop se fornite, altrimenti fallback allo stato locale.
  const escluse = excludedPages !== undefined ? excludedPages : internalEscluse;
  const escluseRef = useRef<number[]>(escluse);
  escluseRef.current = escluse;

  const nonLette = estimate?.unreadPages ?? [];
  const preventivo = testoPreventivo(estimate);
  const ripresa = statoRipresa(fallita?.ripresa ?? null, estimate);
  const alive = useRef(true);

  async function refresh(targetPages = escluseRef.current) {
    try {
      setConfig(await generationConfig());
      const stima = await generationEstimate(extraction.id, targetPages);
      if (escluseRef.current === targetPages) setEstimate(stima);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI non raggiungibile.');
    }
  }

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, []);

  // Aggiornamento stima al variare delle pagine escluse
  useEffect(() => {
    escluseRef.current = escluse;
    setEstimate(null);
    void refresh(escluse);
  }, [escluse]);

  // Dopo un salvataggio in Impostazioni: nuova configurazione e nuovo preventivo, senza ricaricare.
  useEffect(
    () =>
      seguiImpostazioni(() => {
        void refresh();
      }),
    [],
  );

  function cambiaEsclusione(pagine: number[]) {
    escluseRef.current = pagine;
    setEstimate(null);
    if (onExcludedPagesChange) {
      onExcludedPagesChange(pagine);
    } else {
      setInternalEscluse(pagine);
      void refresh(pagine);
    }
  }

  async function generate(ricomincia = false) {
    setBusy(true);
    setError('');
    setFallita(null);
    try {
      const draft = await generateDraft(extraction.id, title, ack, escluseRef.current, ricomincia);
      if (alive.current) onDraft(draft);
    } catch (e) {
      if (!alive.current) return;
      setFallita({
        messaggio: e instanceof Error ? e.message : 'Generazione non riuscita.',
        ripresa: e instanceof ErroreGenerazione ? e.ripresa : null,
      });
      // Preventivo riletto: dopo un blocco fallito conta solo i blocchi mancanti.
      void refresh();
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const disabledGenerate =
    busy ||
    extraction.blocks.length === 0 ||
    !config?.configured ||
    preventivo.bloccante ||
    !title.trim() ||
    (extraction.status === 'needs_review' && !ack);

  return (
    <View style={{ gap: 16 }}>
      <Text style={s.subtitle}>04 · Crea una bozza didattica</Text>

      {!config?.configured ? (
        <Notice text={messaggioConfigurazione(config)} />
      ) : (
        <EstimateCard config={config} estimate={estimate} preventivo={preventivo} />
      )}

      {nonLette.length > 0 && (
        <>
          <Notice error text={testoPagineNonLette(nonLette)} />
          <Button
            label="Escludi queste pagine e continua"
            disabled={busy}
            onPress={() => cambiaEsclusione([...escluse, ...nonLette])}
          />
        </>
      )}

      {escluse.length > 0 && (
        <>
          <Notice text={testoEsclusione(escluse)} />
          <Button
            label="Annulla esclusione"
            secondary
            disabled={busy}
            onPress={() => cambiaEsclusione([])}
          />
        </>
      )}

      <View style={localStyles.inputWrapper}>
        <View style={localStyles.inputLabelRow}>
          <Text style={[localStyles.inputLabel, dark && { color: C.text }]}>
            Titolo del corso da generare
          </Text>
          <Text style={[localStyles.inputHint, dark && { color: C.textMuted }]}>Obbligatorio</Text>
        </View>
        <TextInput
          accessibilityLabel="Titolo del corso"
          style={s.input}
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          placeholder="Es. Corso di Formazione Generale"
          placeholderTextColor={dark ? C.textVeryDim : colors.muted}
        />
      </View>

      <View style={s.row}>
        <Switch
          accessibilityLabel="Ho verificato il testo estratto e gli avvisi"
          value={ack}
          onValueChange={setAck}
          disabled={busy}
        />
        <Text style={s.body}>Ho verificato il testo estratto e gli avvisi</Text>
      </View>

      {!!error && <Notice text={error} error />}
      {!!fallita && <Notice text={fallita.messaggio} error />}
      {!!ripresa && <Notice text={testoRipresa(ripresa)} />}

      <View style={localStyles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={etichettaGenerazione(busy, ripresa)}
          accessibilityState={{ disabled: disabledGenerate, busy }}
          disabled={disabledGenerate}
          onPress={() => generate()}
          style={({ pressed }) => [
            localStyles.primaryBtn,
            dark && { backgroundColor: '#0e7490' },
            disabledGenerate && localStyles.primaryBtnDisabled,
            pressed && !disabledGenerate && localStyles.primaryBtnPressed,
          ]}
        >
          {busy && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
          <Text style={localStyles.primaryBtnText}>{etichettaGenerazione(busy, ripresa)}</Text>
        </Pressable>
        {!!ripresa && (
          // Scarta i blocchi salvati: si pagano di nuovo tutti i blocchi (restart sul server).
          <Button
            label="Ricomincia da capo"
            secondary
            disabled={disabledGenerate}
            onPress={() => generate(true)}
          />
        )}
        <Button
          label="Ricontrolla configurazione AI"
          secondary
          disabled={busy}
          onPress={refresh}
        />
      </View>

      <Text style={s.muted}>
        La bozza non viene pubblicata automaticamente. La generazione può richiedere diversi minuti.
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  inputWrapper: {
    gap: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
  },
  inputHint: {
    fontSize: 12,
    color: colors.muted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnPressed: {
    opacity: 0.8,
  },
  primaryBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
});
