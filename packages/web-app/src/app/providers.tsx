'use client';

import {
  ACCENT_COLOR, ConfirmProvider, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG,
  DEFAULT_PRESET_NAME, getPreset, isPresetName,
  type ThemePresetName,
} from '@anytime-markdown/editor-core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme,ThemeProvider } from '@mui/material/styles';
import { SessionProvider } from 'next-auth/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeModeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'anytime-markdown-theme-mode';
const PRESET_STORAGE_KEY = 'anytime-markdown-theme-preset';

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  themeMode: 'dark',
  setThemeMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

interface PresetContextValue {
  presetName: ThemePresetName;
  setPresetName: (name: ThemePresetName) => void;
}

export const PresetContext = createContext<PresetContextValue>({
  presetName: DEFAULT_PRESET_NAME,
  setPresetName: () => {},
});

export function usePreset() {
  return useContext(PresetContext);
}

function updateStatusBar(mode: ThemeMode) {
  if (!Capacitor.isNativePlatform()) return;
  const isLight = mode === 'light';
  StatusBar.setStyle({ style: isLight ? Style.Light : Style.Dark });
  StatusBar.setBackgroundColor({ color: isLight ? '#FFFFFF' : '#121212' });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });

  const [presetName, setPresetNameState] = useState<ThemePresetName>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PRESET_STORAGE_KEY);
      if (stored && isPresetName(stored)) return stored;
    }
    return DEFAULT_PRESET_NAME;
  });

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    updateStatusBar(mode);
  }, []);

  const setPresetName = useCallback((name: ThemePresetName) => {
    setPresetNameState(name);
    localStorage.setItem(PRESET_STORAGE_KEY, name);
  }, []);

  useEffect(() => {
    updateStatusBar(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const p = getPreset(presetName);
    const families = [p.fontFamily, p.displayFont]
      .flatMap(s => s.split(','))
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(f => !['Helvetica', 'Helvetica Neue', 'Arial', 'sans-serif', 'serif',
        'Georgia', 'Times New Roman', 'Arial Rounded MT Bold', 'Roboto'].includes(f));
    if (families.length === 0) return;
    const id = 'google-fonts-preset';
    if (document.getElementById(id)) {
      document.getElementById(id)!.remove();
    }
    const params = families.map(f => `family=${f.replace(/ /g, '+')}:wght@400;600;700`).join('&');
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    document.head.appendChild(link);
  }, [presetName]);

  const preset = getPreset(presetName);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      secondary: { main: ACCENT_COLOR, contrastText: '#000000' },
      background: { default: themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG },
    },
    shape: { borderRadius: preset.borderRadius.md },
    typography: { fontFamily: preset.fontFamily },
  }), [themeMode, preset]);

  const themeModeValue = useMemo(() => ({ themeMode, setThemeMode }), [themeMode, setThemeMode]);
  const presetValue = useMemo(() => ({ presetName, setPresetName }), [presetName, setPresetName]);

  return (
    <SessionProvider>
    <ThemeModeContext.Provider value={themeModeValue}>
    <PresetContext.Provider value={presetValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ThemeProvider>
    </PresetContext.Provider>
    </ThemeModeContext.Provider>
    </SessionProvider>
  );
}
