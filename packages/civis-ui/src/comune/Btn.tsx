import { usePalette } from '../ThemeProvider';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { C } from '../tema';
import { useStyles } from './stili';
import { EmojiText } from '../icons/AppIcon';
import { buttonForeground } from './contrast';

export function Btn({ onPress, label, primary, color, disabled }: {
  onPress: () => void; label: string; primary?: boolean; color?: string; disabled?: boolean;
}) {
  const C = usePalette();
  const s = useStyles();

  const backgroundColor = disabled ? C.slate : primary ? color || C.indigo : C.bg;
  const foreground = buttonForeground(backgroundColor);
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={1}
      style={[
        s.btn,
        { backgroundColor, minHeight: 52, justifyContent: 'center' },
        primary && { borderWidth: 0 },
        disabled && { borderColor: C.divider },
      ]}
    >
      <EmojiText style={[s.btnText, { color: foreground, textAlign: 'center' }]}>{label}</EmojiText>
    </TouchableOpacity>
  );
}
