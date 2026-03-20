'use client';

import { ACCENT_COLOR,ConfirmProvider, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from '@anytime-markdown/editor-core';
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

  const theme = useMemo(() => createTheme({ palette: { mode: themeMode, secondary: { main: ACCENT_COLOR, contrastText: '#000000' }, background: { default: themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG } } }), [themeMode]);

  const contextValue = useMemo(() => ({ themeMode, setThemeMode }), [themeMode, setThemeMode]);

  return (
    <SessionProvider>
    <ThemeModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ThemeProvider>
    </ThemeModeContext.Provider>
    </SessionProvider>
  );
}
