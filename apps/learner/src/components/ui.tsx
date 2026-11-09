import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.teal }]}>{label}</Text>
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, error && { backgroundColor: '#fff0eb' }]}
    >
      <Text style={{ color: error ? '#9d3a24' : colors.ink, lineHeight: 22 }}>{text}</Text>
    </View>
  );
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
    backgroundColor: 'white',
  },
});
