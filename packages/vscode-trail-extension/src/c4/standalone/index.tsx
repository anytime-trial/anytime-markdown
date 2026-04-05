import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { createRoot } from 'react-dom/client';

import { StandaloneC4Viewer } from './StandaloneC4Viewer';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <StandaloneC4Viewer />
    </ThemeProvider>,
  );
}
