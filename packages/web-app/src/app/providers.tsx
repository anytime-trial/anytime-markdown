'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ConfirmProvider } from '@anytime-markdown/editor-core';

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

export function Providers({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark';
  });

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);

  const contextValue = useMemo(() => ({ themeMode, setThemeMode }), [themeMode]);

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
