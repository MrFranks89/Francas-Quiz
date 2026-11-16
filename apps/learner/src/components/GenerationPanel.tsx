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
import {
  messaggioConfigurazione,
  testoEsclusione,
  testoPagineNonLette,
  testoPreventivo,
} from '../state/generazione';
import { seguiImpostazioni } from '../state/impostazioni';
import type { Extraction } from '../api/documents';
import { Button, Notice, styles, colors } from './ui';
import { EstimateCard } from './EstimateCard';

export function GenerationPanel({
  extraction,
  onDraft,
}: {
  extraction: Extraction;
  onDraft: (draft: Draft) => void;
}) {
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('Il mio corso');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null);
  const [escluse, setEscluse] = useState<number[]>([]);

  // Pagine escluse su richiesta: le stesse per il preventivo e per «Crea bozza AI».
  const escluseRef = useRef<number[]>([]);
  const nonLette = estimate?.unreadPages ?? [];
  const preventivo = testoPreventivo(estimate);
  const alive = useRef(true);

  async function refresh() {
    const pagine = escluseRef.current;
    try {
      setConfig(await generationConfig());
      const stima = await generationEstimate(extraction.id, pagine);
      if (escluseRef.current === pagine) setEstimate(stima);
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
    setEscluse(pagine);
    setEstimate(null);
    void refresh();
  }

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const draft = await generateDraft(extraction.id, title, ack, escluseRef.current);
      if (alive.current) onDraft(draft);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Generazione non riuscita.');
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
      <Text style={styles.subtitle}>04 · Crea una bozza didattica</Text>

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
          <Text style={localStyles.inputLabel}>Titolo del corso da generare</Text>
          <Text style={localStyles.inputHint}>Obbligatorio</Text>
        </View>
        <TextInput
          accessibilityLabel="Titolo del corso"
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          editable={!busy}
          placeholder="Es. Corso di Formazione Generale"
          placeholderTextColor={colors.muted}
        />
      </View>

      <View style={styles.row}>
        <Switch
          accessibilityLabel="Ho verificato il testo estratto e gli avvisi"
          value={ack}
          onValueChange={setAck}
          disabled={busy}
        />
        <Text style={styles.body}>Ho verificato il testo estratto e gli avvisi</Text>
      </View>

      {!!error && <Notice text={error} error />}

      <View style={localStyles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Generazione in corso…' : 'Crea bozza AI'}
          accessibilityState={{ disabled: disabledGenerate, busy }}
          disabled={disabledGenerate}
          onPress={generate}
          style={({ pressed }) => [
            localStyles.primaryBtn,
            disabledGenerate && localStyles.primaryBtnDisabled,
            pressed && !disabledGenerate && localStyles.primaryBtnPressed,
          ]}
        >
          {busy && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
          <Text style={localStyles.primaryBtnText}>
            {busy ? 'Generazione in corso…' : 'Crea bozza AI'}
          </Text>
        </Pressable>
        <Button
          label="Ricontrolla configurazione AI"
          secondary
          disabled={busy}
          onPress={refresh}
        />
      </View>

      <Text style={styles.muted}>
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
