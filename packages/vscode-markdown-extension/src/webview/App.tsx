import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { getVsCodeApi } from './vscodeApi';
import { ConfirmProvider, STORAGE_KEY_CONTENT, STORAGE_KEY_SETTINGS } from '@anytime-markdown/markdown-core';
import MarkdownEditorPage from '@anytime-markdown/markdown-core/src/MarkdownEditorPage';

const vscode = getVsCodeApi();
// markdown-core の EditorContextMenu から VS Code API にアクセスするため公開
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__vscode = vscode;

// スクロール同期の無限ループ防止フラグ
let isSyncingScroll = false;

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

// --- Message handler helpers (extracted to reduce cognitive complexity) ---

/** 許可するスキームのホワイトリスト（VS Code WebView リソース解決専用） */
const ALLOWED_BASE_URI_SCHEMES = new Set(['https:', 'vscode-webview-resource:', 'vscode-webview:']);

/**
 * VS Code 拡張ホストから送信される baseUri を `<base href>` に設定する。
 * 画像の相対パス解決に使用。外部リダイレクトには使用しない。
 *
 * セキュリティ対策:
 * - URL パース + スキームホワイトリストで不正な値を排除
 * - URL.href で正規化し、XSS/オープンリダイレクトを防止
 * - javascript: / data: 等の危険なスキームをブロック
 */
function handleSetBaseUri(message: { baseUri: string }) {
  const raw = message.baseUri;
  if (typeof raw !== 'string' || raw.length === 0) return;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return;
  }
  // スキーム検証: ホワイトリスト以外は拒否
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- CodeQL: URL redirect mitigation
  if (!ALLOWED_BASE_URI_SCHEMES.has(parsed.protocol)) return;

  // URL.href で正規化（ユーザー入力を直接使わない）
  const safeHref = parsed.origin + parsed.pathname;
  const normalized = safeHref.endsWith('/') ? safeHref : safeHref + '/';
  let baseEl = document.querySelector('base');
  if (!baseEl) {
    baseEl = document.createElement('base');
    document.head.appendChild(baseEl);
  }
  baseEl.setAttribute('href', normalized);
}

function handleSyncScroll(message: { ratio: number }) {
  isSyncingScroll = true;
  const el = document.querySelector('textarea') ?? document.querySelector('.tiptap');
  if (el) {
    el.scrollTop = message.ratio * (el.scrollHeight - el.clientHeight);
  }
  requestAnimationFrame(() => { isSyncingScroll = false; });
}

function dispatchCustomEvent(eventName: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

interface MessageState {
  ready: boolean;
  setLanding: (v: boolean) => void;
  setThemeMode: (v: PaletteMode) => void;
  setReady: (v: boolean) => void;
  setCompareContent: (v: string | null) => void;
  setEditorKey: (fn: (k: number) => number) => void;
  latestContentRef: React.MutableRefObject<string | null>;
  historicalContentRef: React.MutableRefObject<string | null>;
}

function handleSetContent(
  message: { content: string; compareContent?: string },
  state: MessageState,
) {
  const isInitial = !state.ready;
  currentContent = message.content;
  if (isInitial) {
    if (typeof message.compareContent === 'string') {
      state.setCompareContent(message.compareContent);
    }
    state.setReady(true);
  } else {
    dispatchCustomEvent('vscode-set-content', message.content);
  }
}

function handleLoadHistoryContent(
  message: { content: string },
  state: MessageState,
) {
  state.latestContentRef.current = currentContent;
  state.historicalContentRef.current = message.content;
  currentContent = message.content;
  dispatchCustomEvent('vscode-set-content', message.content);
}

export function App() {
  const [ready, setReady] = useState(false);
  const [landing, setLanding] = useState(false);
  const [themeMode, setThemeMode] = useState<PaletteMode>('dark');
  const [editorKey, setEditorKey] = useState(0);
  const [compareContent, setCompareContent] = useState<string | null>(null);
  const theme = useMemo(() => createTheme({ palette: { mode: themeMode } }), [themeMode]);
  const latestContentRef = useRef<string | null>(null);
  const historicalContentRef = useRef<string | null>(null);

  useEffect(() => {
    const msgState: MessageState = {
      ready,
      setLanding,
      setThemeMode,
      setReady,
      setCompareContent,
      setEditorKey,
      latestContentRef,
      historicalContentRef,
    };

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message?.type) return;

      switch (message.type) {
        case 'setTheme':
          // テーマはエディタ設定でのみ変更（VS Code テーマ同期を無効化）
          return;
        case 'setLanding':
          if (message.landing === true) setLanding(true);
          return;
        case 'loadCompareFile':
          if (typeof message.content === 'string') dispatchCustomEvent('vscode-load-compare-file', message.content);
          return;
        case 'exitCompareMode':
          dispatchCustomEvent('vscode-exit-compare-mode', undefined);
          return;
        case 'syncScroll':
          if (typeof message.ratio === 'number') handleSyncScroll(message);
          return;
        case 'toggleSectionNumbers':
          if (typeof message.show === 'boolean') dispatchCustomEvent('vscode-toggle-section-numbers', message.show);
          return;
        case 'scrollToHeading':
          if (typeof message.pos === 'number') dispatchCustomEvent('vscode-scroll-to-heading', message.pos);
          return;
        case 'scrollToComment':
          if (typeof message.pos === 'number') dispatchCustomEvent('vscode-scroll-to-comment', message.pos);
          return;
        case 'resolveComment':
          if (typeof message.id === 'string') dispatchCustomEvent('vscode-resolve-comment', message.id);
          return;
        case 'unresolveComment':
          if (typeof message.id === 'string') dispatchCustomEvent('vscode-unresolve-comment', message.id);
          return;
        case 'deleteComment':
          if (typeof message.id === 'string') dispatchCustomEvent('vscode-delete-comment', message.id);
          return;
        case 'loadHistoryContent':
          if (typeof message.content === 'string') handleLoadHistoryContent(message, msgState);
          return;
        case 'setBaseUri':
          if (typeof message.baseUri === 'string') handleSetBaseUri(message);
          return;
        case 'imageSaved':
          if (typeof message.path === 'string') dispatchCustomEvent('vscode-image-saved', message.path);
          return;
        case 'pasteMarkdown':
          if (typeof message.text === 'string') dispatchCustomEvent('vscode-paste-markdown', message.text);
          return;
        case 'pasteCodeBlock':
          if (typeof message.text === 'string') dispatchCustomEvent('vscode-paste-codeblock', message.text);
          return;
        case 'setContent':
          if (typeof message.content === 'string') handleSetContent(message, msgState);
          return;
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

  const [autoReload, setAutoReload] = useState(true);
  const handleToggleAutoReload = useCallback(() => {
    setAutoReload((prev) => {
      const next = !prev;
      vscode.postMessage({ type: 'setAutoReload', enabled: next });
      return next;
    });
  }, []);

  // スクロール同期: スクロール位置を extension host に送信
  useEffect(() => {
    let currentEl: Element | null = null;
    const handler = () => {
      if (isSyncingScroll || !currentEl) return;
      const maxScroll = currentEl.scrollHeight - currentEl.clientHeight;
      if (maxScroll <= 0) return;
      const ratio = currentEl.scrollTop / maxScroll;
      vscode.postMessage({ type: 'scrollChanged', ratio });
    };
    const attach = () => {
      const el = document.querySelector('textarea') ?? document.querySelector('.tiptap');
      if (el === currentEl) return;
      if (currentEl) currentEl.removeEventListener('scroll', handler);
      currentEl = el;
      if (currentEl) currentEl.addEventListener('scroll', handler, { passive: true });
    };
    attach();
    // DOM 変更時にリスナーを再アタッチ（モード切替等）
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (currentEl) currentEl.removeEventListener('scroll', handler);
    };
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

  if (landing) {
    return <LandingPage themeMode={themeMode} onContinue={() => setLanding(false)} />;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfirmProvider>
        <MarkdownEditorPage key={editorKey} hideFileOps hideUndoRedo hideSettings hideVersionInfo hideTemplates hideFoldAll hideStatusBar sideToolbar hideCompareToggle externalCompareContent={compareContent} onCompareModeChange={handleCompareModeChange} onHeadingsChange={handleHeadingsChange} onCommentsChange={handleCommentsChange} onStatusChange={handleStatusChange} autoReload={autoReload} onToggleAutoReload={handleToggleAutoReload} />
      </ConfirmProvider>
    </ThemeProvider>
  );
}

// --- Extracted sub-component for landing page ---
function LandingPage({ themeMode, onContinue }: { themeMode: PaletteMode; onContinue: () => void }) {
  const isDark = themeMode === 'dark';
  const logoUri = (window as unknown as { __LOGO_URI__?: string }).__LOGO_URI__;
  const isJa = (document.documentElement.lang || navigator.language || '').startsWith('ja');
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
      color: isDark ? '#cccccc' : '#333333',
      fontFamily: 'var(--vscode-font-family, sans-serif)',
      gap: '24px',
    }}>
      {logoUri && <img src={logoUri} alt="Anytime Markdown" style={{ width: 64, height: 64, opacity: 0.8 }} />}
      <div style={{ fontSize: '14px', textAlign: 'center', lineHeight: 1.8 }}>
        {isJa ? (
          <>差分は、サイドバー「Anytime Markdown」の<br />GIT HISTORY で確認してください。</>
        ) : (
          <>To view diffs, use <strong>GIT HISTORY</strong> in the<br />&quot;Anytime Markdown&quot; sidebar.</>
        )}
      </div>
      <button
        onClick={onContinue}
        style={{
          padding: '8px 24px',
          fontSize: '13px',
          cursor: 'pointer',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: isDark ? '#0e639c' : '#007acc',
          color: '#ffffff',
        }}
      >
        {isJa ? 'Anytime Markdown で編集' : 'Open in Anytime Markdown'}
      </button>
    </div>
  );
}
