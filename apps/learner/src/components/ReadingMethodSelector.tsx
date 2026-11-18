import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './ui';

export type ReadingEngine = 'native' | 'docling';

interface ReadingMethodSelectorProps {
  engine: ReadingEngine;
  onChange: (engine: ReadingEngine) => void;
  disabled?: boolean;
  hasDigitalText?: boolean;
}

export function ReadingMethodSelector({
  engine,
  onChange,
  disabled = false,
  hasDigitalText,
}: ReadingMethodSelectorProps) {
  const nativeSubtitle =
    hasDigitalText === true
      ? 'Consigliato · Testo digitale già presente (< 2s)'
      : hasDigitalText === false
      ? 'Non consigliato · Nessun testo digitale rilevato nel PDF'
      : 'Veloce · Ideale per PDF digitali, DOCX e TXT';

  const doclingSubtitle =
    hasDigitalText === true
      ? 'Sconsigliato / Lento (~10-15s a pagina) · Testo già presente'
      : hasDigitalText === false
      ? 'Consigliato per scansioni · Estrae testo da immagini (~10-15s/pag)'
      : 'Accurato · Consigliato per scansioni e layout complessi';

  const noteText =
    hasDigitalText === true
      ? 'Testo digitale già presente: «Testo nativo» è istantaneo. L’OCR è sconsigliato perché molto più lento.'
      : hasDigitalText === false
      ? 'Nessun testo digitale rilevato (probabile scansione): «Docling / OCR» è consigliato. Richiede i modelli configurati sul server.'
      : 'Docling richiede i modelli configurati sul server. Eventuali pagine senza testo saranno segnalate.';

  const options: Array<{
    id: ReadingEngine;
    title: string;
    subtitle: string;
    badge: string;
  }> = [
    {
      id: 'native',
      title: 'Testo nativo',
      subtitle: nativeSubtitle,
      badge: hasDigitalText === true ? 'Consigliato' : hasDigitalText === false ? 'Solo testo' : 'Veloce',
    },
    {
      id: 'docling',
      title: 'Docling / OCR',
      subtitle: doclingSubtitle,
      badge: hasDigitalText === false ? 'Consigliato' : hasDigitalText === true ? 'Lento · OCR' : 'Accurato',
    },
  ];

  return (
    <View style={selectorStyles.container}>
      <View style={selectorStyles.grid}>
        {options.map((opt) => {
          const selected = engine === opt.id;
          return (
            <Pressable
              key={opt.id}
              accessibilityRole="button"
              accessibilityLabel={opt.title}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(opt.id)}
              style={({ pressed }) => [
                selectorStyles.card,
                selected ? selectorStyles.cardSelected : selectorStyles.cardUnselected,
                disabled && selectorStyles.cardDisabled,
                pressed && !disabled && selectorStyles.cardPressed,
              ]}
            >
              <View style={selectorStyles.header}>
                <Text
                  style={[
                    selectorStyles.title,
                    selected && selectorStyles.titleSelected,
                  ]}
                >
                  {opt.title}
                </Text>
                <View
                  style={[
                    selectorStyles.badge,
                    selected ? selectorStyles.badgeSelected : selectorStyles.badgeUnselected,
                  ]}
                >
                  <Text
                    style={[
                      selectorStyles.badgeText,
                      selected && selectorStyles.badgeTextSelected,
                    ]}
                  >
                    {selected ? '✓ Attivo' : opt.badge}
                  </Text>
                </View>
              </View>
              <Text style={selectorStyles.subtitle}>{opt.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={selectorStyles.note}>{noteText}</Text>
    </View>
  );
}

const selectorStyles = StyleSheet.create({
  container: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  card: {
    flex: 1,
    minWidth: 200,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    gap: 8,
  },
  cardSelected: {
    borderColor: colors.teal,
    backgroundColor: colors.pale,
  },
  cardUnselected: {
    borderColor: colors.line,
    backgroundColor: '#f8fafc',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardPressed: {
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  titleSelected: {
    color: colors.teal,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeSelected: {
    backgroundColor: '#cde4e0',
    borderColor: colors.teal,
  },
  badgeUnselected: {
    backgroundColor: 'white',
    borderColor: colors.line,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  badgeTextSelected: {
    color: colors.teal,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
});
