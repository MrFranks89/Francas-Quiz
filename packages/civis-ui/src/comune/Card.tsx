import React from 'react';
import { View } from 'react-native';
import { useStyles } from './stili';

export function Card({ children, style }: any) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}
