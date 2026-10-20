import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

export function FeedbackMotion({ active = true, correct, children, style }: { active?: boolean; correct: boolean; children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: correct ? 180 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, correct, progress, reducedMotion]);

  const transform = !active ? undefined : correct
    ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]
    : [{ translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [-7, 7, -5, 3, 0] }) }];

  return <Animated.View style={[style, transform && { transform }]}>{children}</Animated.View>;
}
