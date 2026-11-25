import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Keyboard,
  Platform,
  TextInput,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import { useScrollPannello } from './Guscio';
import { calcolaScrollAlFocus } from '../state/tastiera';

export interface CampoTestoProps extends TextInputProps {
  margineScroll?: number;
}

/**
 * Wrapper attorno a TextInput che, al focus in ambiente mobile,
 * misura la propria posizione nella finestra e richiede l'auto-scroll
 * alla ScrollView del Pannello per rimanere visibile sopra la tastiera software.
 */
export const CampoTesto = forwardRef<any, CampoTestoProps>(function CampoTesto(
  { onFocus, onBlur, margineScroll = 24, ...props },
  forwardedRef,
) {
  const internalRef = useRef<any>(null);
  useImperativeHandle(forwardedRef, () => internalRef.current);
  const scrollContext = useScrollPannello();
  const { height: windowHeight } = useWindowDimensions();
  const isFocusedRef = useRef(false);

  const eseguiScroll = (altezzaTastiera: number) => {
    if (!isFocusedRef.current || !scrollContext) return;
    internalRef.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
      const altezzaVisibile = windowHeight - altezzaTastiera;
      const delta = calcolaScrollAlFocus(y, height, altezzaVisibile, margineScroll);
      if (delta > 0) {
        scrollContext.scrollaDi(delta, true);
      }
    });
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      eseguiScroll(e.endCoordinates.height);
    });

    return () => {
      sub.remove();
    };
  }, [windowHeight, scrollContext]);

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (e) => {
    isFocusedRef.current = true;
    onFocus?.(e);
    if (Platform.OS === 'web' || !scrollContext) return;

    // Se la tastiera era già aperta, misuriamo e scrolliamo dopo un frame
    setTimeout(() => {
      internalRef.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        const altezzaTastieraStimata = Math.min(380, Math.round(windowHeight * 0.45));
        const altezzaVisibile = windowHeight - altezzaTastieraStimata;
        const delta = calcolaScrollAlFocus(y, height, altezzaVisibile, margineScroll);
        if (delta > 0) {
          scrollContext.scrollaDi(delta, true);
        }
      });
    }, 120);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (e) => {
    isFocusedRef.current = false;
    onBlur?.(e);
  };

  return <TextInput ref={internalRef} onFocus={handleFocus} onBlur={handleBlur} {...props} />;
});
