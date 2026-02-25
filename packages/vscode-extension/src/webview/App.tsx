import { useState, useEffect, useCallback } from 'react';
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
      if (message?.type === 'loadCompareFile' && typeof message.content === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-load-compare-file', { detail: message.content }));
        return;
      }
      if (message?.type === 'setContent' && typeof message.content === 'string') {
        const isInitial = !ready;
        currentContent = message.content;
        if (isInitial) {
          setReady(true);
        } else {
          // VS Code からの外部更新（メニュー Undo/Redo など）→ Tiptap エディタに反映
          window.dispatchEvent(new CustomEvent('vscode-set-content', { detail: message.content }));
        }
      }
    };
    const handleSaveCompare = (e: Event) => {
      const content = (e as CustomEvent<string>).detail;
      vscode.postMessage({ type: 'saveCompareFile', content });
    };
    window.addEventListener('message', handleMessage);
    window.addEventListener('vscode-save-compare-file', handleSaveCompare);
    vscode.postMessage({ type: 'ready' });
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('vscode-save-compare-file', handleSaveCompare);
    };
  }, [ready]);

  const handleCompareModeChange = useCallback((active: boolean) => {
    vscode.postMessage({ type: 'compareModeChanged', active });
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <ConfirmProvider>
        <MarkdownEditorPage hideFileOps hideUndoRedo onCompareModeChange={handleCompareModeChange} />
      </ConfirmProvider>
    </ThemeProvider>
  );
}
