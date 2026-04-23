import { useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { SpreadsheetEditor } from '@anytime-markdown/spreadsheet-viewer';
import type { WorkbookSnapshot } from '@anytime-markdown/spreadsheet-viewer';
import { useThemeMode } from './shims/providers';
import { setLocale as setShimLocale } from './shims/next-intl';
import { createVSCodeSheetAdapter } from './adapters/VSCodeSheetAdapter';
import { createVSCodeWorkbookAdapter } from './adapters/VSCodeWorkbookAdapter';
import { getVscodeApi } from './adapters/vscodeApi';

type SheetFormat = 'sheet' | 'csv' | 'tsv';

export function App() {
  const { themeMode } = useThemeMode();
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const [format, setFormat] = useState<SheetFormat>('sheet');
  const [localeKey, setLocaleKey] = useState(0);

  const csvAdapter = useMemo(() => createVSCodeSheetAdapter('csv'), []);
  const tsvAdapter = useMemo(() => createVSCodeSheetAdapter('tsv'), []);
  const workbookAdapter = useMemo(() => createVSCodeWorkbookAdapter(), []);

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
          if (fmt === 'sheet' && msg.workbook) {
            workbookAdapter.applyWorkbook(msg.workbook as WorkbookSnapshot);
          } else if (fmt === 'csv' && typeof msg.text === 'string') {
            csvAdapter.applyText(msg.text);
          } else if (fmt === 'tsv' && typeof msg.text === 'string') {
            tsvAdapter.applyText(msg.text);
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
  }, [workbookAdapter, csvAdapter, tsvAdapter]);

  const csvSheetAdapter = format === 'tsv' ? tsvAdapter : csvAdapter;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {format === 'sheet' ? (
        <SpreadsheetEditor
          key={localeKey}
          themeMode={themeMode}
          workbookAdapter={workbookAdapter}
        />
      ) : (
        <SpreadsheetEditor
          key={localeKey}
          themeMode={themeMode}
          adapter={csvSheetAdapter}
        />
      )}
    </ThemeProvider>
  );
}
