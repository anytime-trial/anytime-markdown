'use client';

import {
  ACCENT_COLOR, applyEditorThemeCssVars, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG,
  DEFAULT_PRESET_NAME,   getActionHover, getActionSelected,
  getBgPaper, getDivider,   getErrorMain, getInfoMain,
getPreset, getPrimaryContrast,
getPrimaryDark, getPrimaryLight,   getPrimaryMain, getSuccessMain, getTextDisabled,
getTextPrimary, getTextSecondary, getWarningLight, getWarningMain, isPresetName,
  type ThemePresetName,
} from '@anytime-markdown/markdown-viewer';
import {
  ConfirmProvider,
  ThemeModeProvider as EditorThemeModeProvider,
} from '@anytime-markdown/markdown-react-islands';
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
  StatusBar.setBackgroundColor({ color: isLight ? '#FBF9F3' : '#121212' });
}

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [presetName, setPresetNameState] = useState<ThemePresetName>(DEFAULT_PRESET_NAME);
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setThemeModeState(storedTheme);
    }
    const storedPreset = localStorage.getItem(PRESET_STORAGE_KEY);
    if (storedPreset && isPresetName(storedPreset)) {
      setPresetNameState(storedPreset);
    }
  }, []);

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
    document.documentElement.dataset.theme = themeMode;
    updateStatusBar(themeMode);
  }, [themeMode]);

  useEffect(() => {
    applyEditorThemeCssVars({ presetName, themeMode });
  }, [presetName, themeMode]);

  const preset = getPreset(presetName);

  const theme = useMemo(() => {
    const isDark = themeMode === 'dark';
    return createTheme({
      palette: {
        mode: themeMode,
        secondary: { main: ACCENT_COLOR, contrastText: '#000000' },
        background: {
          default: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
          paper: getBgPaper(isDark),
        },
        primary: {
          main: getPrimaryMain(isDark),
          dark: getPrimaryDark(isDark),
          light: getPrimaryLight(isDark),
          contrastText: getPrimaryContrast(isDark),
        },
        text: {
          primary: getTextPrimary(isDark),
          secondary: getTextSecondary(isDark),
          disabled: getTextDisabled(isDark),
        },
        divider: getDivider(isDark),
        success: { main: getSuccessMain(isDark) },
        warning: { main: getWarningMain(isDark), light: getWarningLight(isDark) },
        error: { main: getErrorMain(isDark) },
        info: { main: getInfoMain(isDark) },
        action: {
          hover: getActionHover(isDark),
          selected: getActionSelected(isDark),
        },
      },
      shape: { borderRadius: preset.borderRadius.md },
      typography: { fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif' },
    });
  }, [themeMode, preset]);

  const themeModeValue = useMemo(() => ({ themeMode, setThemeMode }), [themeMode, setThemeMode]);
  const presetValue = useMemo(() => ({ presetName, setPresetName }), [presetName, setPresetName]);

  return (
    <SessionProvider>
    <ThemeModeContext.Provider value={themeModeValue}>
    <PresetContext.Provider value={presetValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <EditorThemeModeProvider mode={themeMode}>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </EditorThemeModeProvider>
      </ThemeProvider>
    </PresetContext.Provider>
    </ThemeModeContext.Provider>
    </SessionProvider>
  );
}
