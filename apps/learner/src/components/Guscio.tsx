import React, {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Keyboard,
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

export interface ScrollPannelloContesto {
  scrollRef: RefObject<any>;
  getScrollY: () => number;
  scrollaDi: (delta: number, animated?: boolean) => void;
  scrollToEnd: (animated?: boolean) => void;
}

export const ScrollContext = createContext<ScrollPannelloContesto | null>(null);

export function useScrollPannello(): ScrollPannelloContesto | null {
  return useContext(ScrollContext);
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
  const scrollRef = useRef<any>(null);
  const scrollYRef = useRef(0);
  const [altezzaTastiera, setAltezzaTastiera] = useState(0);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const mostraSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAltezzaTastiera(e.endCoordinates.height);
    });
    const nascondiSub = Keyboard.addListener('keyboardDidHide', () => {
      setAltezzaTastiera(0);
    });
    return () => {
      mostraSub.remove();
      nascondiSub.remove();
    };
  }, []);

  const valoreContesto = React.useMemo<ScrollPannelloContesto>(
    () => ({
      scrollRef,
      getScrollY: () => scrollYRef.current,
      scrollaDi: (delta: number, animated = true) => {
        const target = Math.max(0, scrollYRef.current + delta);
        scrollRef.current?.scrollTo({ y: target, animated });
      },
      scrollToEnd: (animated = true) => {
        scrollRef.current?.scrollToEnd({ animated });
      },
    }),
    [],
  );

  if (!attivo && !persistente) return null;
  return (
    <ScrollContext.Provider value={valoreContesto}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, display: attivo ? 'flex' : 'none' }}
        contentContainerStyle={{
          padding: orizzontale,
          paddingBottom: 36 + insets.bottom + altezzaTastiera,
          width: '100%',
          maxWidth: LARGHEZZA_MAX,
          alignSelf: 'center',
          gap: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {children}
        {piede}
      </ScrollView>
    </ScrollContext.Provider>
  );
}
