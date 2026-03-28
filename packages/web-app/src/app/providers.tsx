'use client';

import {
  ACCENT_COLOR, ConfirmProvider, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG,
  DEFAULT_PRESET_NAME, getPreset, isPresetName,
  type ThemePresetName,
} from '@anytime-markdown/markdown-core';
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
    updateStatusBar(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const p = getPreset(presetName);
    const families = [...new Set(
      [p.fontFamily, p.displayFont]
        .flatMap(s => s.split(','))
        .map(s => s.trim().replaceAll(/^["']|["']$/g, ''))
        .filter(f => !['Helvetica', 'Helvetica Neue', 'Arial', 'sans-serif', 'serif',
          'Georgia', 'Times New Roman', 'Arial Rounded MT Bold', 'Roboto'].includes(f)),
    )];
    document.documentElement.style.setProperty('--editor-content-font-family', p.fontFamily);
    if (presetName === 'handwritten') {
      const isDark = themeMode === 'dark';
      const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
      const baseColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
      document.documentElement.style.setProperty('--editor-heading-hatch',
        `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${lineColor} 4px, ${lineColor} 5px), ${baseColor}`);
      document.documentElement.style.setProperty('--editor-heading-font-family', '"Nunito", "Klee One", sans-serif');
      // ダークモード時の見出しボーダー色（温かみのある色）
      if (isDark) {
        document.documentElement.style.setProperty('--editor-heading-border-h1', 'rgba(100,160,210,0.7)');
        document.documentElement.style.setProperty('--editor-heading-border-h2', 'rgba(100,160,210,0.5)');
        document.documentElement.style.setProperty('--editor-heading-border-h3', 'rgba(100,160,210,0.35)');
      } else {
        document.documentElement.style.setProperty('--editor-heading-border-h1', 'rgba(160,120,60,0.5)');
        document.documentElement.style.setProperty('--editor-heading-border-h2', 'rgba(160,120,60,0.4)');
        document.documentElement.style.setProperty('--editor-heading-border-h3', 'rgba(160,120,60,0.35)');
      }
      // 不規則な角丸（手書きの四角形風）
      document.documentElement.style.setProperty('--editor-heading-radius-h1', '12px 8px 10px 6px');
      document.documentElement.style.setProperty('--editor-heading-radius-h2', '8px 10px 6px 12px');
      document.documentElement.style.setProperty('--editor-heading-radius-h3', '6px 8px 10px 4px');
      // SVGフィルタで微かな揺らぎ
      const filterId = 'handwritten-roughen';
      if (!document.getElementById(filterId)) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('id', filterId);
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        svg.innerHTML = `<filter id="roughen"><feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="1" /><feDisplacementMap in="SourceGraphic" scale="1.5" /></filter>`;
        document.body.appendChild(svg);
      }
      document.documentElement.style.setProperty('--editor-heading-filter', 'url(#roughen)');
      // Admonition: 不規則角丸 + ハッチング背景
      document.documentElement.style.setProperty('--editor-admonition-radius', '10px 6px 8px 12px');
      const hatch = (color: string) =>
        `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${color} 4px, ${color} 5px), ${isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}`;
      document.documentElement.style.setProperty('--editor-admonition-bg-note', hatch('rgba(31,111,235,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-tip', hatch('rgba(35,134,54,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-important', hatch('rgba(137,87,229,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-warning', hatch('rgba(210,153,34,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-caution', hatch('rgba(218,54,51,0.08)'));
    } else {
      document.documentElement.style.removeProperty('--editor-heading-hatch');
      document.documentElement.style.removeProperty('--editor-heading-radius-h1');
      document.documentElement.style.removeProperty('--editor-heading-radius-h2');
      document.documentElement.style.removeProperty('--editor-heading-radius-h3');
      document.documentElement.style.removeProperty('--editor-heading-filter');
      document.documentElement.style.removeProperty('--editor-heading-border-h1');
      document.documentElement.style.removeProperty('--editor-heading-border-h2');
      document.documentElement.style.removeProperty('--editor-heading-border-h3');
      document.documentElement.style.removeProperty('--editor-heading-font-family');
      document.documentElement.style.removeProperty('--editor-admonition-radius');
      document.documentElement.style.removeProperty('--editor-admonition-bg-note');
      document.documentElement.style.removeProperty('--editor-admonition-bg-tip');
      document.documentElement.style.removeProperty('--editor-admonition-bg-important');
      document.documentElement.style.removeProperty('--editor-admonition-bg-warning');
      document.documentElement.style.removeProperty('--editor-admonition-bg-caution');
    }
    if (families.length === 0) return;
    const id = 'google-fonts-preset';
    if (document.getElementById(id)) {
      document.getElementById(id)!.remove();
    }
    const params = families.map(f => `family=${f.replaceAll(' ', '+')}:wght@400;600;700`).join('&');
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    document.head.appendChild(link);
  }, [presetName, themeMode]);

  const preset = getPreset(presetName);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      secondary: { main: ACCENT_COLOR, contrastText: '#000000' },
      background: { default: themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG },
    },
    shape: { borderRadius: preset.borderRadius.md },
    typography: { fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif' },
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
