import { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { getVsCodeApi } from './vscodeApi';
import { ConfirmProvider } from '@anytime-markdown/editor-core';
import MarkdownEditorPage from '@anytime-markdown/editor-core/src/MarkdownEditorPage';

const vscode = getVsCodeApi();

// localStorage bridge: intercept content key to sync with VS Code
const CONTENT_KEY = 'markdown-editor-content';
let currentContent: string | null = null;

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalGetItem = localStorage.getItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.setItem = (key: string, value: string) => {
  if (key === CONTENT_KEY) {
    currentContent = value;
    vscode.postMessage({ type: 'contentChanged', content: value });
    return;
  }
  originalSetItem(key, value);
};

localStorage.getItem = (key: string): string | null => {
  if (key === CONTENT_KEY) {
    return currentContent;
  }
  return originalGetItem(key);
};

localStorage.removeItem = (key: string) => {
  if (key === CONTENT_KEY) {
    currentContent = '';
    return;
  }
  originalRemoveItem(key);
};

// VS Code extension: force showTitle off
const SETTINGS_KEY = 'markdown-editor-settings';
try {
  const saved = localStorage.getItem(SETTINGS_KEY);
  const obj = saved ? JSON.parse(saved) : {};
  obj.showTitle = false;
  originalSetItem(SETTINGS_KEY, JSON.stringify(obj));
} catch { /* ignore */ }

const darkTheme = createTheme({ palette: { mode: 'dark' } });

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'setContent' && typeof message.content === 'string') {
        currentContent = message.content;
        if (!ready) {
          setReady(true);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <ConfirmProvider>
        <MarkdownEditorPage />
      </ConfirmProvider>
    </ThemeProvider>
  );
}
