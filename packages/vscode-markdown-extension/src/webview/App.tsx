import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { getVsCodeApi } from './vscodeApi';
import { ACCENT_COLOR, applyEditorThemeCssVars, ConfirmProvider, createMarkdownT, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getPreset, STORAGE_KEY_CONTENT, STORAGE_KEY_SETTINGS, ThemeModeProvider, VanillaMarkdownEditorMount, type ThemePresetName } from '@anytime-markdown/markdown-viewer';
import { EmbedProvidersProvider } from '@anytime-markdown/markdown-viewer/src/contexts/EmbedProvidersContext';
// 脱React G4: vanilla orchestrator（rich codeblock 注入版）へ一本化
import { mountVanillaRichMarkdownEditor } from '@anytime-markdown/markdown-rich/src/vanilla/mountVanillaRichMarkdownEditor';
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
  readyRef: React.MutableRefObject<boolean>;
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
  const isInitial = !state.readyRef.current;
  currentContent = message.content;
  if (isInitial) {
    if (typeof message.compareContent === 'string') {
      state.setCompareContent(message.compareContent);
    }
    state.readyRef.current = true;
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

function detectLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function App() {
  const [ready, setReady] = useState(false);
  const [landing, setLanding] = useState(false);
  const [themeMode, setThemeMode] = useState<PaletteMode>('dark');
  const [presetName, setPresetName] = useState<ThemePresetName>('handwritten');
  const [locale, setLocale] = useState<string>(detectLocale);
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
    // 見出しボーダーはデザイン仕様準拠のニュートラル墨色（既定）に統一。
    // 旧 vscode 固有の暖色 rgba(160,120,60,*) は未文書化のドリフトのため撤去（web-app と一致）。
    applyEditorThemeCssVars({
      presetName,
      themeMode,
    });
  }, [presetName, themeMode]);

  const latestContentRef = useRef<string | null>(null);
  const historicalContentRef = useRef<string | null>(null);
  // ready の現在値をメッセージハンドラから参照するための ref。
  // useEffect の依存に ready を入れるとハンドラ再登録 → ready 再送 → setContent 再送で
  // コンテンツが二重ロードされるため、依存を空にして ref で現在値を読む。
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    const msgState: MessageState = {
      readyRef,
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
              document.documentElement.lang = s.language;
              setLocale(s.language);
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
          // requestId 付きの保存は発信元ノード（GIF ノード等）が直接受け取るため、
          // グローバルの画像挿入（カーソル位置へ挿入）は行わない。二重挿入の防止。
          if (typeof message.requestId === 'string') return;
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
    // 初回マウント時に一度だけ登録する。ready は readyRef 経由で参照する（上のコメント参照）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 脱React G3-2: vanilla orchestrator の onModeChange（ToolbarModeState）を React 経路の
  // mode 文字列通知へ変換する。
  const handleVanillaModeChange = useCallback((state: { sourceMode?: boolean; reviewMode?: boolean; readonlyMode?: boolean }) => {
    let mode = 'wysiwyg';
    if (state.sourceMode) mode = 'source';
    else if (state.reviewMode) mode = 'review';
    else if (state.readonlyMode) mode = 'readonly';
    handleModeChange(mode);
  }, [handleModeChange]);

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
    // DOM 変更時にリスナーを再アタッチ（モード切替等）。
    // TipTap は 1 打鍵で多数のミューテーションを発生させるため、rAF で 1 フレーム 1 回に間引いて
    // querySelector の多発（大規模ドキュメントでの DOM スキャン）を抑える。
    let rafId = 0;
    const scheduleAttach = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; attach(); });
    };
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
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
      <ThemeModeProvider mode={themeMode}>
      <ConfirmProvider>
        <EmbedProvidersProvider value={embedProviders}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <VanillaMarkdownEditorMount
            key={editorKey}
            // 脱React G4: vanilla 経路へ一本化。content は localStorage ブリッジ
            // （STORAGE_KEY_CONTENT）経由のため persistDraft で整合する。
            mount={mountVanillaRichMarkdownEditor}
            t={createMarkdownT('MarkdownEditor', locale)}
            locale={locale}
            hideToolbar
            sideToolbar
            hide={{ settings: true }}
            hideStatusBar
            readOnly={claudeEditing}
            externalCompareContent={compareContent}
            onCompareModeChange={handleCompareModeChange}
            onHeadingsChange={handleHeadingsChange}
            onCommentsChange={handleCommentsChange}
            onStatusChange={handleStatusChange}
            autoReload={autoReload}
            onModeChange={handleVanillaModeChange}
            themeMode={themeMode}
            presetName={presetName}
            showFrontmatter
            persistDraft
          />
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
      </ThemeModeProvider>
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
