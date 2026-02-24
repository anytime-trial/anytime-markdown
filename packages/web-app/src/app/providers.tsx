'use client';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ConfirmProvider } from '@anytime-markdown/editor-core';

const darkTheme = createTheme({
  palette: { mode: 'dark' },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </ThemeProvider>
  );
}
