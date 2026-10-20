import { usePalette } from '../ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { C } from '../tema';
import { useStyles } from './stili';
import { useReducedMotion } from './useReducedMotion';

export function ProgressBar({ current, total, color, light }: { current: number; total: number; color?: string; light?: boolean }) {
  const C = usePalette();
  const s = useStyles();
  const reducedMotion = useReducedMotion();

  const pct = Math.round((current / Math.max(total, 1)) * 100);
  // La barra "scorre" verso la nuova percentuale invece di saltarci di colpo.
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    if (reducedMotion) {
      w.setValue(pct);
      return;
    }
    Animated.timing(w, { toValue: pct, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, reducedMotion, w]);
  const width = w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return (
    <View
      style={s.progressWrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Avanzamento"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[s.progressTrack, light && { backgroundColor: C.lightText }]}>
        <Animated.View style={[s.progressFill, { width, backgroundColor: color || C.teal }]} />
      </View>
      <Text style={[s.progressPct, light && { color: '#475569' }]} importantForAccessibility="no">{pct}%</Text>
    </View>
  );
}
