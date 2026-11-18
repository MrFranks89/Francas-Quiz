import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, useTheme } from '@formazione/civis-ui/src/ThemeProvider';

export const colors = {
  navy: '#132c3e',
  teal: '#087e83',
  pale: '#e6f4f1',
  ink: '#263f50',
  muted: '#637b88',
  line: '#d9e4e8',
};
export function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const C = usePalette();
  const { dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        dark && { backgroundColor: '#0e7490' },
        secondary &&
          (dark
            ? { backgroundColor: C.surfaceHover, borderWidth: 1, borderColor: C.border }
            : styles.secondary),
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: dark ? C.teal : colors.teal }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const C = usePalette();
  const { dark } = useTheme();
  return (
    <View style={[styles.card, dark && { backgroundColor: C.surface, borderColor: C.border }]}>
      {children}
    </View>
  );
}
export function Notice({ text, error = false }: { text: string; error?: boolean }) {
  const C = usePalette();
  const { dark } = useTheme();
  const bg = dark ? (error ? C.redBg : C.surfaceHover) : error ? '#fff0eb' : colors.pale;
  const fg = dark ? (error ? C.redText : C.text) : error ? '#9d3a24' : colors.ink;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        { backgroundColor: bg },
        dark && { borderWidth: 1, borderColor: error ? C.red : C.border },
      ]}
    >
      <Text style={{ color: fg, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}
export function useUiStyles() {
  const C = usePalette();
  const { dark } = useTheme();
  return useMemo(() => {
    if (!dark) return styles;
    return StyleSheet.create({
      card: { ...styles.card, backgroundColor: C.surface, borderColor: C.border },
      button: { ...styles.button, backgroundColor: '#0e7490' },
      secondary: { backgroundColor: C.surfaceHover },
      buttonText: styles.buttonText,
      notice: { ...styles.notice, backgroundColor: C.surfaceHover },
      title: { ...styles.title, color: C.text },
      subtitle: { ...styles.subtitle, color: C.text },
      body: { ...styles.body, color: C.lightText },
      muted: { ...styles.muted, color: C.textMuted },
      row: styles.row,
      input: {
        ...styles.input,
        borderColor: C.border,
        color: C.text,
        backgroundColor: C.inputBg,
      },
    });
  }, [C, dark]);
}
export const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 16,
  },
  button: {
    backgroundColor: colors.teal,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
  secondary: { backgroundColor: colors.pale },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  notice: { padding: 16, backgroundColor: colors.pale, borderRadius: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.navy },
  subtitle: { fontSize: 19, fontWeight: '700', color: colors.navy },
  body: { fontSize: 16, lineHeight: 25, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 22, color: colors.muted },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    color: colors.navy,
    minWidth: 90,
    minHeight: 48,
    backgroundColor: 'white',
  },
});
