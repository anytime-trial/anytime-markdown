import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { getVsCodeApi } from './vscodeApi';
import { ConfirmProvider, STORAGE_KEY_CONTENT, STORAGE_KEY_SETTINGS } from '@anytime-markdown/editor-core';
import MarkdownEditorPage from '@anytime-markdown/editor-core/src/MarkdownEditorPage';

const vscode = getVsCodeApi();

// localStorage bridge: intercept content key to sync with VS Code
const CONTENT_KEY = STORAGE_KEY_CONTENT;
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
const SETTINGS_KEY = STORAGE_KEY_SETTINGS;
try {
  const saved = localStorage.getItem(SETTINGS_KEY);
  const obj = saved ? JSON.parse(saved) : {};
  obj.showTitle = false;
  originalSetItem(SETTINGS_KEY, JSON.stringify(obj));
} catch { /* ignore */ }

export function App() {
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<PaletteMode>('dark');
  const [editorKey, setEditorKey] = useState(0);
  const [compareContent, setCompareContent] = useState<string | null>(null);
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const latestContentRef = useRef<string | null>(null);
  const historicalContentRef = useRef<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'setTheme' && (message.mode === 'dark' || message.mode === 'light')) {
        setThemeMode(message.mode);
        return;
      }
      if (message?.type === 'loadCompareFile' && typeof message.content === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-load-compare-file', { detail: message.content }));
        return;
      }
      if (message?.type === 'externalChange' && typeof message.content === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-external-change', { detail: message.content }));
        return;
      }
      if (message?.type === 'scrollToHeading' && typeof message.pos === 'number') {
        window.dispatchEvent(new CustomEvent('vscode-scroll-to-heading', { detail: message.pos }));
        return;
      }
      if (message?.type === 'scrollToComment' && typeof message.pos === 'number') {
        window.dispatchEvent(new CustomEvent('vscode-scroll-to-comment', { detail: message.pos }));
        return;
      }
      if (message?.type === 'resolveComment' && typeof message.id === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-resolve-comment', { detail: message.id }));
        return;
      }
      if (message?.type === 'unresolveComment' && typeof message.id === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-unresolve-comment', { detail: message.id }));
        return;
      }
      if (message?.type === 'deleteComment' && typeof message.id === 'string') {
        window.dispatchEvent(new CustomEvent('vscode-delete-comment', { detail: message.id }));
        return;
      }
      if (message?.type === 'loadHistoryContent' && typeof message.content === 'string') {
        // 通常モード: 履歴コンテンツを表示（最新をキャッシュ）
        latestContentRef.current = currentContent;
        historicalContentRef.current = message.content;
        currentContent = message.content;
        window.dispatchEvent(new CustomEvent('vscode-set-content', { detail: message.content }));
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
    if (active && historicalContentRef.current != null && latestContentRef.current != null) {
      // 比較モード切替: 左=最新、右=選択コミット
      const latest = latestContentRef.current;
      const commit = historicalContentRef.current;
      // refs をクリアして remount 時の再トリガーを防止
      historicalContentRef.current = null;
      latestContentRef.current = null;
      currentContent = latest;
      setCompareContent(commit);
      setEditorKey((k) => k + 1);
    }
  }, []);

  const handleHeadingsChange = useCallback((headings: Array<{ level: number; text: string; pos: number; kind: string }>) => {
    vscode.postMessage({ type: 'headingsChanged', headings });
  }, []);

  const handleCommentsChange = useCallback((comments: Array<{ id: string; text: string; resolved: boolean; createdAt: string; targetText: string; pos: number; isPoint: boolean }>) => {
    vscode.postMessage({ type: 'commentsChanged', comments });
  }, []);

  const handleStatusChange = useCallback((status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) => {
    vscode.postMessage({ type: 'statusChanged', status });
  }, []);

  useEffect(() => {
    const openLink = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (/^https?:\/\//.test(href)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      vscode.postMessage({ type: 'openLink', href });
    };
    const handleCtrlClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) openLink(e);
    };
    // capture フェーズで VS Code プリロードスクリプトより先にイベントを捕捉
    document.addEventListener('click', handleCtrlClick, true);
    document.addEventListener('dblclick', openLink, true);
    return () => {
      document.removeEventListener('click', handleCtrlClick, true);
      document.removeEventListener('dblclick', openLink, true);
    };
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfirmProvider>
        <MarkdownEditorPage key={editorKey} hideFileOps hideUndoRedo hideSettings hideHelp hideVersionInfo hideOutline hideComments hideTemplates hideFoldAll hideStatusBar externalCompareContent={compareContent} onCompareModeChange={handleCompareModeChange} onHeadingsChange={handleHeadingsChange} onCommentsChange={handleCommentsChange} onStatusChange={handleStatusChange} />
      </ConfirmProvider>
    </ThemeProvider>
  );
}
