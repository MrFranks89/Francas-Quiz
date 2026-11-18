import React, { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { comportamentoTastiera, offsetTastiera } from '../state/tastiera';

const LARGHEZZA_MAX = 1160;

/**
 * Guscio dell'app: testata e navigazione FISSE in alto, sotto la tastiera si
 * evita con un solo KeyboardAvoidingView, ogni schermata scorre nel proprio
 * Pannello. Le schermate non sanno nulla di tastiera né di safe area.
 * `sfondo`: il colore di fondo che App.tsx già usa oggi per la radice.
 */
export function Guscio({
  sfondo,
  testata,
  children,
}: {
  sfondo: string;
  testata: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const orizzontale = width < 600 ? 16 : width <= 1024 ? 24 : 36;
  const [altezzaTestata, setAltezzaTestata] = useState(0);
  const misura = (e: LayoutChangeEvent) => setAltezzaTestata(e.nativeEvent.layout.height);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: sfondo,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        onLayout={misura}
        style={{
          width: '100%',
          maxWidth: LARGHEZZA_MAX,
          alignSelf: 'center',
          paddingHorizontal: orizzontale,
          paddingVertical: 10,
          gap: 10,
        }}
      >
        {testata}
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={comportamentoTastiera(Platform.OS)}
        keyboardVerticalOffset={offsetTastiera(Platform.OS, insets.top, altezzaTestata)}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Una schermata con il proprio scroll. `persistente`: resta montata anche
 * quando non è attiva (display: none), così non si perdono documento estratto,
 * modifiche non salvate e posizione di scroll. `piede` va in fondo allo scroll.
 */
export function Pannello({
  attivo,
  persistente = false,
  piede,
  children,
}: {
  attivo: boolean;
  persistente?: boolean;
  piede?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const orizzontale = width < 600 ? 16 : width <= 1024 ? 24 : 36;
  if (!attivo && !persistente) return null;
  return (
    <ScrollView
      style={{ flex: 1, display: attivo ? 'flex' : 'none' }}
      contentContainerStyle={{
        padding: orizzontale,
        paddingBottom: 36 + insets.bottom,
        width: '100%',
        maxWidth: LARGHEZZA_MAX,
        alignSelf: 'center',
        gap: 24,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    >
      {children}
      {piede}
    </ScrollView>
  );
}
