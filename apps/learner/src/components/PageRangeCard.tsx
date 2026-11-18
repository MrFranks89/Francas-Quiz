import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './ui';

export function PageRangeCard({
  pageCount,
  range,
  from,
  to,
  busy,
  highlighted,
  valid,
  selectedCount,
  error,
  onChangeFrom,
  onChangeTo,
}: {
  pageCount: number;
  range: boolean;
  from: string;
  to: string;
  busy: boolean;
  highlighted: boolean;
  valid: boolean;
  selectedCount: number;
  error: string | null;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
}) {
  if (!range) {
    return (
      <View style={localStyles.allVolumeBox}>
        <View style={[localStyles.statusBadge, localStyles.statusBadgeValid]}>
          <Text style={localStyles.statusTextValid}>
            ✓ Tutte le {pageCount} pagine del volume selezionate per l'elaborazione
          </Text>
        </View>
        <Text style={localStyles.allVolumeHint}>
          Tocca "Da pagina… a pagina…" se vuoi estrarre solo un capitolo o una parte del documento.
        </Text>
      </View>
    );
  }

  return (
    <View style={[localStyles.rangeCard, highlighted && localStyles.rangeCardHighlighted]}>
      <Text style={localStyles.rangeCardTitle}>🎯 Intervallo di studio personalizzato</Text>
      <Text style={localStyles.rangeCardHint}>
        Inserisci l'intervallo compreso tra 1 e {pageCount} pagine:
      </Text>
      <View style={localStyles.rangeInputsRow}>
        <View style={localStyles.inputGroup}>
          <Text style={localStyles.inputLabel}>Da pagina</Text>
          <TextInput
            accessibilityLabel="Pagina iniziale"
            editable={!busy}
            style={localStyles.rangeInput}
            keyboardType="number-pad"
            value={from}
            onChangeText={onChangeFrom}
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
            onChangeText={onChangeTo}
          />
        </View>
      </View>

      <View
        style={[
          localStyles.statusBadge,
          valid ? localStyles.statusBadgeValid : localStyles.statusBadgeInvalid,
        ]}
      >
        <Text style={valid ? localStyles.statusTextValid : localStyles.statusTextInvalid}>
          {valid
            ? `✓ ${selectedCount} ${selectedCount === 1 ? 'pagina selezionata' : 'pagine selezionate'} (su ${pageCount} totali)`
            : `⚠️ ${error ?? 'Intervallo non valido'}`}
        </Text>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  rangeCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cde4e0',
    padding: 16,
    gap: 12,
  },
  rangeCardHighlighted: {
    borderColor: colors.teal,
    backgroundColor: '#f0fdfa',
  },
  rangeCardTitle: { fontSize: 15, fontWeight: '700', color: colors.navy },
  rangeCardHint: { fontSize: 13, color: colors.muted },
  allVolumeBox: { gap: 6, paddingVertical: 2 },
  allVolumeHint: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
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
