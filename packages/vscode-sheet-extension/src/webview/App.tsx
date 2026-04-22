import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { SpreadsheetEditor } from '@anytime-markdown/spreadsheet-viewer';
import { useThemeMode } from './shims/providers';
import { setLocale as setShimLocale } from './shims/next-intl';
import { createVSCodeSheetAdapter } from './adapters/VSCodeSheetAdapter';
import { getVscodeApi } from './adapters/vscodeApi';

type SheetFormat = 'sheet' | 'csv' | 'tsv';

export function App() {
  const { themeMode } = useThemeMode();
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const [format, setFormat] = useState<SheetFormat>('sheet');
  const adapter = useMemo(() => createVSCodeSheetAdapter(format), [format]);
  const [localeKey, setLocaleKey] = useState(0);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg) return;
      switch (msg.type) {
        case 'locale':
          if (typeof msg.locale === 'string') {
            setShimLocale(msg.locale);
            setLocaleKey((k) => k + 1);
          }
          break;
        case 'init': {
          const fmt = (msg.format as SheetFormat) ?? 'sheet';
          setFormat(fmt);
          if (fmt === 'sheet' && msg.snapshot) {
            adapter.applySnapshot(msg.snapshot as Parameters<typeof adapter.applySnapshot>[0]);
          } else if ((fmt === 'csv' || fmt === 'tsv') && typeof msg.text === 'string') {
            adapter.applyText(msg.text);
          }
          break;
        }
        case 'theme':
          break;
      }
    };
    window.addEventListener('message', listener);
    getVscodeApi().postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', listener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SpreadsheetEditor key={localeKey} themeMode={themeMode} adapter={adapter} />
    </ThemeProvider>
  );
}
