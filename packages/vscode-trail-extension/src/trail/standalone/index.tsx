import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import { StandaloneTrailViewer } from './StandaloneTrailViewer';

function App() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(() => createTheme({ palette: { mode: prefersDark ? 'dark' : 'light' } }), [prefersDark]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StandaloneTrailViewer isDark={prefersDark} />
    </ThemeProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
