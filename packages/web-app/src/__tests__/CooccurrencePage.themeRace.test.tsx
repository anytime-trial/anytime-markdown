/**
 * @jest-environment jsdom
 *
 * cooccurrence ページの mount 競合の回帰テスト。
 *
 * 動的 import の解決前にテーマが dark → light へ確定すると、[themeMode] の update effect は
 * handleRef が null のため no-op になり、mount は初回レンダーの stale な themeMode（dark）を
 * 使ったまま以後も更新されない（ヘッダーだけライトでビューアが夜の OZ に固まる）。
 * 横断制約 mount-once-child-empty-first-render と同型。
 */
import { act, render } from '@testing-library/react';
import { useEffect, useState } from 'react';

import { LocaleProvider } from '../app/LocaleProvider';
import CooccurrencePage from '../app/cooccurrence/page';
import { ThemeModeContext } from '../app/providers';

jest.mock('../app/components/LandingHeader', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../app/cooccurrence/createLayoutWorker', () => ({
  createLayoutWorker: () => null,
}));

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// providers.tsx の import 連鎖（markdown-viewer / capacitor）を既存 providers テストと同様に断つ。
jest.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
jest.mock('@capacitor/status-bar', () => ({ StatusBar: {}, Style: { Light: 'LIGHT', Dark: 'DARK' } }));
jest.mock('@anytime-markdown/markdown-react-islands', () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
  ThemeModeProvider: ({ children }: { children: React.ReactNode }) => children,
  MarkdownCoreI18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@anytime-markdown/database-viewer', () => ({
  DatabaseI18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@anytime-markdown/markdown-viewer', () => {
  const preset = { label: 'p', fontFamily: 'sans-serif', displayFont: 'serif', borderRadius: { sm: 4, md: 8, lg: 12 } };
  const color = () => '#000000';
  return {
    applyEditorThemeCssVars: () => undefined,
    ACCENT_COLOR: '#e8a012',
    DEFAULT_DARK_BG: '#0D1117',
    DEFAULT_LIGHT_BG: '#F8F9FA',
    DEFAULT_PRESET_NAME: 'professional',
    getPreset: () => preset,
    isPresetName: () => true,
    getBgPaper: color,
    getDivider: color,
    getTextPrimary: color,
    getTextSecondary: color,
    getTextDisabled: color,
    getActionHover: color,
    getActionSelected: color,
    getPrimaryMain: color,
    getPrimaryDark: color,
    getPrimaryLight: color,
    getPrimaryContrast: color,
    getErrorMain: color,
    getInfoMain: color,
    getSuccessMain: color,
    getWarningLight: color,
    getWarningMain: color,
  };
});

const mountMock = jest.fn(() => ({ update: updateMock, destroy: jest.fn() }));
const updateMock = jest.fn();

jest.mock('@anytime-markdown/cooccurrence-viewer', () => ({
  __esModule: true,
  createCooccurrenceT: () => (key: string) => key,
  mountCooccurrenceViewer: (...args: unknown[]) => mountMock(...(args as [])),
}));

/** Providers と同じ初期化順を再現する: 初回レンダー dark → effect で light へ確定。 */
function Host() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    setThemeMode('light');
  }, []);
  return (
    <ThemeModeContext.Provider value={{ themeMode, setThemeMode }}>
      <LocaleProvider serverLocale="ja">
        <CooccurrencePage />
      </LocaleProvider>
    </ThemeModeContext.Provider>
  );
}

test('動的 import 前に確定したテーマで viewer が mount される（stale な dark を使わない）', async () => {
  await act(async () => {
    render(<Host />);
  });
  // 動的 import の microtask を確実に流す。
  await act(async () => {
    await Promise.resolve();
  });
  expect(mountMock).toHaveBeenCalledTimes(1);
  const mountedTheme = (mountMock.mock.calls[0] as unknown as [unknown, { themeMode: string }])[1].themeMode;
  const updatedThemes = updateMock.mock.calls
    .map((call) => (call[0] as { themeMode?: string }).themeMode)
    .filter((mode): mode is string => mode !== undefined);
  const effectiveTheme = updatedThemes.at(-1) ?? mountedTheme;
  expect(effectiveTheme).toBe('light');
});
