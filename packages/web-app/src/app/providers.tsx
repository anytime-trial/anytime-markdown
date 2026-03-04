'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ConfirmProvider } from '@anytime-markdown/editor-core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type ThemeMode = 'light' | 'dark';

interface ThemeModeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'anytime-markdown-theme-mode';

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  themeMode: 'dark',
  setThemeMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
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
      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    return 'dark';
  });

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    updateStatusBar(mode);
  }, []);

  useEffect(() => {
    updateStatusBar(themeMode);
  }, [themeMode]);

  const theme = useMemo(() => createTheme({ palette: { mode: themeMode, secondary: { main: '#e8a012' } } }), [themeMode]);

  const contextValue = useMemo(() => ({ themeMode, setThemeMode }), [themeMode, setThemeMode]);

  return (
    <ThemeModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
