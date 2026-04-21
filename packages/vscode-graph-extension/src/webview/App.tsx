import { useMemo } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { GraphEditor } from '@anytime-markdown/graph-viewer';
import { useThemeMode } from './shims/providers';
import { createVSCodePersistenceAdapter } from './adapters/vscodePersistenceAdapter';

export function App() {
  const { themeMode } = useThemeMode();
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const persistence = useMemo(() => createVSCodePersistenceAdapter(), []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GraphEditor themeMode={themeMode} persistence={persistence} />
    </ThemeProvider>
  );
}
