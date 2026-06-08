import { useEffect, useMemo, useState } from 'react';
import { GraphEditor } from '@anytime-markdown/graph-viewer';
import { useThemeMode } from './shims/providers';
import { createVSCodePersistenceAdapter } from './adapters/vscodePersistenceAdapter';

function detectLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function App() {
  const { themeMode } = useThemeMode();
  const persistence = useMemo(() => createVSCodePersistenceAdapter(), []);
  const [locale, setLocale] = useState<string>(detectLocale);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      const msg = event.data;
      if (msg && msg.type === 'locale' && typeof msg.locale === 'string') {
        setLocale(msg.locale);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => () => persistence.dispose(), [persistence]);

  // GraphEditor は themeMode prop から自前 UI キットのテーマを適用するため、
  // MUI ThemeProvider / CssBaseline は不要。
  return <GraphEditor locale={locale} themeMode={themeMode} persistence={persistence} />;
}
