import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { GraphEditor } from '@anytime-markdown/graph-viewer';
import { useThemeMode } from './shims/providers';
import { createVSCodePersistenceAdapter } from './adapters/vscodePersistenceAdapter';

function detectLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function App() {
  const { themeMode } = useThemeMode();
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const persistence = useMemo(() => createVSCodePersistenceAdapter(), []);
  const [locale, setLocale] = useState<string>(detectLocale);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'locale' && typeof msg.locale === 'string') {
        setLocale(msg.locale);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => () => persistence.dispose(), [persistence]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GraphEditor locale={locale} themeMode={themeMode} persistence={persistence} />
    </ThemeProvider>
  );
}
