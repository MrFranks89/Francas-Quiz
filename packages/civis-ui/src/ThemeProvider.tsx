import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C as DARK } from './tema';

export type ThemeMode = 'light' | 'dark' | 'system';
export const LIGHT: typeof DARK = {
  ...DARK,
  bg: '#f5f7fa', surface: '#ffffff', surfaceHover: '#e7edf4',
  border: '#bcc8d6', borderSubtle: '#d9e1ea',
  text: '#132238', textMuted: '#3d4f67', textDim: '#465972', textVeryDim: '#52637a',
  green: '#15803d', greenBg: '#dcfce7', greenText: '#166534',
  red: '#b91c1c', redBg: '#fee2e2', redText: '#b91c1c',
  yellow: '#795500', yellowBg: '#fef3c7', orange: '#9a3412', orangeBg: '#ffedd5',
  teal: '#0e6474', selBg: '#e0e7ff', selBorder: '#4f46e5',
  greenPrimary: '#356b2c', greenSoft: '#2e6328', greenAccent: '#356b2c',
  scenario: '#8a5200', gold: '#795500', surfaceDark: '#edf2f7',
  divider: '#c5d0dc', dividerFaint: '#c5d0dc88', lightText: '#2d4058',
  inputBg: '#ffffff', indigoLight: '#4940bb', indigoPale: '#4338a5',
  fuchsia: '#86198f', magenta: '#86198f', lightMuted: '#465972', optionText: '#1f314a',
};
export const THEME_STORAGE_KEY = 'civis.ui.theme';
export function resolveTheme(mode: ThemeMode, system: string | null | undefined) {
  return mode === 'system' ? system === 'light' ? 'light' : 'dark' : mode;
}
const Context = createContext({ C: DARK, mode: 'system' as ThemeMode, dark: true, setMode: (_mode: ThemeMode) => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setPreference] = useState<ThemeMode>('dark');
  // Una scelta fatta prima che AsyncStorage risponda ha sempre precedenza sul
  // valore persistito: altrimenti la promessa vecchia la sovrascriveva.
  const changedBeforeLoad = useRef(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(value => {
      if (alive && !changedBeforeLoad.current && (value === 'light' || value === 'dark' || value === 'system')) setPreference(value);
    }).catch(error => console.warn('Cannot load theme preference', error));
    return () => { alive = false; };
  }, []);
  const setMode = (value: ThemeMode) => {
    changedBeforeLoad.current = true;
    setPreference(value);
    AsyncStorage.setItem(THEME_STORAGE_KEY, value).catch(error => console.warn('Cannot save theme preference', error));
  };
  const dark = resolveTheme(mode, system) === 'dark';
  return <Context.Provider value={{ C: dark ? DARK : LIGHT, mode, dark, setMode }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
export const usePalette = () => useTheme().C;
