import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { getVsCodeApi } from './vscodeApi';
import { ACCENT_COLOR, ConfirmProvider, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, STORAGE_KEY_CONTENT, STORAGE_KEY_SETTINGS } from '@anytime-markdown/markdown-core';
import type { ThemePresetName } from '@anytime-markdown/markdown-core/src/constants/themePresets';
import { getPreset } from '@anytime-markdown/markdown-core/src/constants/themePresets';
import { EmbedProvidersProvider } from '@anytime-markdown/markdown-core/src/contexts/EmbedProvidersContext';
import MarkdownEditorPage from '@anytime-markdown/markdown-core/src/MarkdownEditorPage';
import { setLocale as setShimLocale } from './shims/next-intl';
import { createVsCodeEmbedProviders } from './vscodeEmbedProviders';

const vscode = getVsCodeApi();
// markdown-core の EditorContextMenu から VS Code API にアクセスするため公開
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__vscode = vscode;

// スクロール同期の無限ループ防止フラグ
let isSyncingScroll = false;

// Claude Code 編集中フラグ（localStorage bridge で contentChanged 送信を抑止）
let isClaudeEditing = false;

// localStorage bridge: intercept content key to sync with VS Code
const CONTENT_KEY = STORAGE_KEY_CONTENT;
let currentContent: string | null = null;

const originalSetItem = localStorage.setItem.bind(localStorage);
const originalGetItem = localStorage.getItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.setItem = (key: string, value: string) => {
  if (key === CONTENT_KEY) {
    currentContent = value;
    if (!isClaudeEditing) {
      vscode.postMessage({ type: 'contentChanged', content: value });
    }
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
  setPresetName: (v: ThemePresetName) => void;
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
  const [presetName, setPresetName] = useState<ThemePresetName>('handwritten');
  const [editorKey, setEditorKey] = useState(0);
  const [compareContent, setCompareContent] = useState<string | null>(null);
  const preset = useMemo(() => getPreset(presetName), [presetName]);
  const theme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      secondary: { main: ACCENT_COLOR, contrastText: '#000000' },
      background: { default: themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG },
    },
    shape: { borderRadius: preset.borderRadius.md },
    components: {
      MuiCssBaseline: {
        styleOverrides: themeMode === 'light' ? {
          body: {
            WebkitFontSmoothing: 'auto',
            MozOsxFontSmoothing: 'auto',
          },
        } : undefined,
      },
    },
  }), [themeMode, preset]);

  // プリセットに応じた CSS カスタムプロパティの適用
  useEffect(() => {
    const p = getPreset(presetName);
    const isDark = themeMode === 'dark';
    document.documentElement.style.setProperty('--editor-content-font-family', p.fontFamily);
    if (presetName === 'handwritten') {
      const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
      const baseColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
      document.documentElement.style.setProperty('--editor-heading-hatch',
        `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${lineColor} 4px, ${lineColor} 5px), ${baseColor}`);
      document.documentElement.style.setProperty('--editor-heading-font-family', '"Nunito", "Klee One", sans-serif');
      if (isDark) {
        document.documentElement.style.setProperty('--editor-heading-border-h1', 'rgba(100,160,210,0.7)');
        document.documentElement.style.setProperty('--editor-heading-border-h2', 'rgba(100,160,210,0.5)');
        document.documentElement.style.setProperty('--editor-heading-border-h3', 'rgba(100,160,210,0.35)');
      } else {
        document.documentElement.style.setProperty('--editor-heading-border-h1', 'rgba(160,120,60,0.5)');
        document.documentElement.style.setProperty('--editor-heading-border-h2', 'rgba(160,120,60,0.4)');
        document.documentElement.style.setProperty('--editor-heading-border-h3', 'rgba(160,120,60,0.35)');
      }
      document.documentElement.style.setProperty('--editor-heading-radius-h1', '12px 8px 10px 6px');
      document.documentElement.style.setProperty('--editor-heading-radius-h2', '8px 10px 6px 12px');
      document.documentElement.style.setProperty('--editor-heading-radius-h3', '6px 8px 10px 4px');
      const filterId = 'handwritten-roughen';
      if (!document.getElementById(filterId)) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('id', filterId);
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        svg.innerHTML = `<filter id="roughen"><feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="1" /><feDisplacementMap in="SourceGraphic" scale="1.5" /></filter>`;
        document.body.appendChild(svg);
      }
      document.documentElement.style.setProperty('--editor-heading-filter', 'url(#roughen)');
      const hatch = (color: string) =>
        `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${color} 4px, ${color} 5px), ${isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'}`;
      document.documentElement.style.setProperty('--editor-admonition-radius', '10px 6px 8px 12px');
      document.documentElement.style.setProperty('--editor-admonition-bg-note', hatch('rgba(31,111,235,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-tip', hatch('rgba(35,134,54,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-important', hatch('rgba(137,87,229,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-warning', hatch('rgba(210,153,34,0.08)'));
      document.documentElement.style.setProperty('--editor-admonition-bg-caution', hatch('rgba(218,54,51,0.08)'));
    } else {
      document.documentElement.style.removeProperty('--editor-heading-hatch');
      document.documentElement.style.removeProperty('--editor-heading-radius-h1');
      document.documentElement.style.removeProperty('--editor-heading-radius-h2');
      document.documentElement.style.removeProperty('--editor-heading-radius-h3');
      document.documentElement.style.removeProperty('--editor-heading-filter');
      document.documentElement.style.removeProperty('--editor-heading-border-h1');
      document.documentElement.style.removeProperty('--editor-heading-border-h2');
      document.documentElement.style.removeProperty('--editor-heading-border-h3');
      document.documentElement.style.removeProperty('--editor-heading-font-family');
      document.documentElement.style.removeProperty('--editor-admonition-radius');
      document.documentElement.style.removeProperty('--editor-admonition-bg-note');
      document.documentElement.style.removeProperty('--editor-admonition-bg-tip');
      document.documentElement.style.removeProperty('--editor-admonition-bg-important');
      document.documentElement.style.removeProperty('--editor-admonition-bg-warning');
      document.documentElement.style.removeProperty('--editor-admonition-bg-caution');
    }
    // Google Fonts 読み込み
    const families = [...new Set(
      [p.fontFamily, p.displayFont]
        .flatMap(s => s.split(','))
        .map(s => s.trim().replaceAll(/^["']|["']$/g, ''))
        .filter(f => !['Helvetica', 'Helvetica Neue', 'Arial', 'sans-serif', 'serif',
          'Georgia', 'Times New Roman', 'Arial Rounded MT Bold', 'Roboto'].includes(f)),
    )];
    if (families.length > 0) {
      const id = 'google-fonts-preset';
      document.getElementById(id)?.remove();
      const params = families.map(f => `family=${f.replaceAll(' ', '+')}:wght@400;600;700`).join('&');
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
      document.head.appendChild(link);
    }
  }, [presetName, themeMode]);

  const latestContentRef = useRef<string | null>(null);
  const historicalContentRef = useRef<string | null>(null);

  useEffect(() => {
    const msgState: MessageState = {
      ready,
      setLanding,
      setThemeMode,
      setPresetName,
      setReady,
      setCompareContent,
      setEditorKey,
      latestContentRef,
      historicalContentRef,
    };

    const handleMessage = (event: MessageEvent) => {
      // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
      if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
      const message = event.data;
      if (!message?.type) return;

      switch (message.type) {
        case 'setTheme':
          if (message.themeMode === 'light' || message.themeMode === 'dark') {
            msgState.setThemeMode(message.themeMode);
          }
          if (typeof message.claudeLocked === 'boolean') {
            isClaudeEditing = message.claudeLocked;
            setClaudeEditing(message.claudeLocked);
          }
          return;
        case 'setSettings':
          if (message.settings) {
            const s = message.settings;
            if (s.themeMode === 'light' || s.themeMode === 'dark') {
              msgState.setThemeMode(s.themeMode);
            }
            if (s.themePreset === 'handwritten' || s.themePreset === 'professional') {
              msgState.setPresetName(s.themePreset);
            }
            if (s.language === 'en' || s.language === 'ja') {
              setShimLocale(s.language);
              document.documentElement.lang = s.language;
              // locale 変更時にエディタを再マウントして翻訳を反映
              msgState.setEditorKey((k: number) => k + 1);
            }
          }
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
        case 'imageDownloaded':
          if (typeof message.originalUrl === 'string' && typeof message.localPath === 'string') {
            dispatchCustomEvent('vscode-image-downloaded', { originalUrl: message.originalUrl, localPath: message.localPath });
          }
          return;
        case 'pasteMarkdown':
          if (typeof message.text === 'string') dispatchCustomEvent('vscode-paste-markdown', message.text);
          return;
        case 'pasteCodeBlock':
          if (typeof message.text === 'string') dispatchCustomEvent('vscode-paste-codeblock', message.text);
          return;
        case 'claudeLock':
          return;
        case 'setAutoReload':
          if (typeof message.enabled === 'boolean') setAutoReload(message.enabled);
          return;
        case 'setMode':
          if (typeof message.mode === 'string') dispatchCustomEvent('vscode-set-mode', message.mode);
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

  const [claudeEditing, setClaudeEditing] = useState(false);
  const [autoReload, setAutoReload] = useState(true);
  const embedProviders = useMemo(() => createVsCodeEmbedProviders(), []);

  const handleModeChange = useCallback((mode: string) => {
    vscode.postMessage({ type: 'modeChanged', mode });
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

  const isDark = themeMode === 'dark';
  const isJa = (document.documentElement.lang || '').startsWith('ja');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ConfirmProvider>
        <EmbedProvidersProvider value={embedProviders}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <MarkdownEditorPage key={editorKey} hideToolbar sideToolbar hideSettings hideStatusBar readOnly={claudeEditing} externalCompareContent={compareContent} onCompareModeChange={handleCompareModeChange} onHeadingsChange={handleHeadingsChange} onCommentsChange={handleCommentsChange} onStatusChange={handleStatusChange} autoReload={autoReload} onModeChange={handleModeChange} themeMode={themeMode} presetName={presetName} showFrontmatter />
          {claudeEditing && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '4px 16px',
              backgroundColor: isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)',
              borderBottom: `2px solid ${isDark ? 'rgba(255,180,0,0.5)' : 'rgba(255,160,0,0.5)'}`,
              backdropFilter: 'blur(4px)',
              fontSize: 12,
              color: isDark ? 'rgba(255,200,100,0.9)' : 'rgba(160,100,0,0.9)',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 14, animation: 'claude-spin 2s linear infinite' }}>&#9881;</span>
              <span>{isJa ? 'Claude Code が編集中です' : 'Claude Code is editing'}</span>
              <style>{`@keyframes claude-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>
        </EmbedProvidersProvider>
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
