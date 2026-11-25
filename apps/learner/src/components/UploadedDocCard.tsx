import React, { useState } from 'react';
import { View, Text, Pressable, Alert, Platform, StyleSheet } from 'react-native';
import type { Document } from '../api/documents';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';
import { colors, useUiStyles } from './ui';

type Props = {
  document: Document;
  onDelete: () => Promise<void> | void;
  disabled?: boolean;
};

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export function UploadedDocCard({ document, onDelete, disabled }: Props) {
  const C = usePalette();
  const { dark } = useTheme();
  const s = useUiStyles();
  const [deleting, setDeleting] = useState(false);
  // Solo nativo (Android/iOS): pattern «seleziona l'oggetto, poi il cestino».
  const [selected, setSelected] = useState(false);

  function confirmAndDelete() {
    const run = async () => {
      setDeleting(true);
      try {
        await onDelete();
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm("Eliminare questo documento? L'operazione non si può annullare.")) {
        void run();
      }
    } else {
      Alert.alert(
        'Eliminare questo documento?',
        "L'operazione non si può annullare.",
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Elimina', style: 'destructive', onPress: () => void run() },
        ],
      );
    }
  }

  const subtitle =
    document.kind === 'image'
      ? 'Foto o immagine (1 pagina)'
      : document.kind === 'audio'
        ? 'File audio (trascrizione automatica)'
        : document.pageCount
          ? `${document.pageCount} pagine originali rilevate`
          : 'Documento senza paginazione fissa';

  const cardBody = (
    <>
      <View style={styles.docHeader}>
        <View
          style={[
            styles.formatBadge,
            dark && { backgroundColor: C.surfaceHover, borderColor: C.border },
          ]}
        >
          <Text style={[styles.formatBadgeText, dark && { color: C.teal }]}>
            {document.kind}
          </Text>
        </View>
        <Text style={[styles.docName, dark && { color: C.text }]} numberOfLines={1}>
          {document.name}
        </Text>
        {(!isNative || selected) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elimina documento"
            testID="btn-delete-doc"
            disabled={disabled || deleting}
            onPress={confirmAndDelete}
            style={({ pressed, hovered }: any) => [
              styles.deleteBtn,
              (pressed || hovered) && {
                backgroundColor: dark ? '#7f1d1d' : '#fee2e2',
                borderColor: dark ? '#ef4444' : '#fca5a5',
              },
            ]}
          >
            <Text
              style={[
                styles.deleteBtnText,
                dark && { color: '#f87171' },
              ]}
            >
              {isNative ? '🗑' : '×'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={s.muted}>{subtitle}</Text>
      {isNative && (
        <Text style={[styles.hint, dark && { color: C.textMuted }]}>
          {selected ? 'Selezionato: tocca il cestino per eliminare' : 'Tocca per selezionare'}
        </Text>
      )}
    </>
  );

  const frameStyle = [
    styles.docCard,
    dark && { backgroundColor: C.surface, borderColor: C.border },
    isNative && selected && styles.docCardSelected,
  ];

  if (isNative) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selected ? `Documento ${document.name} selezionato` : `Seleziona il documento ${document.name}`
        }
        accessibilityState={{ selected }}
        testID="doc-card"
        disabled={disabled || deleting}
        onPress={() => setSelected((prev) => !prev)}
        style={frameStyle}
      >
        {cardBody}
      </Pressable>
    );
  }

  return <View style={frameStyle}>{cardBody}</View>;
}

const styles = StyleSheet.create({
  docCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  docCardSelected: {
    borderColor: '#ef4444',
    borderWidth: 2,
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
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '600',
    color: '#94a3b8',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
  },
});
