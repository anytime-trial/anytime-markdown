import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { GraphEditor } from '@anytime-markdown/graph-viewer';
import { useThemeMode } from './shims/providers';
import { setLocale as setShimLocale } from './shims/next-intl';
import { createVSCodePersistenceAdapter } from './adapters/vscodePersistenceAdapter';

export function App() {
  const { themeMode } = useThemeMode();
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const persistence = useMemo(() => createVSCodePersistenceAdapter(), []);
  const [localeKey, setLocaleKey] = useState(0);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'locale' && typeof msg.locale === 'string') {
        setShimLocale(msg.locale);
        setLocaleKey((k) => k + 1);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(() => () => persistence.dispose(), [persistence]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GraphEditor key={localeKey} themeMode={themeMode} persistence={persistence} />
    </ThemeProvider>
  );
}
