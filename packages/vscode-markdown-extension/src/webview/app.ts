/**
 * webview vanilla bootstrap（旧 `App.tsx`（React + MUI）の脱 React 置換）。
 *
 * 役割:
 * - localStorage ブリッジ（`STORAGE_KEY_CONTENT` を VS Code `contentChanged` へ転送）
 * - extension host とのメッセージ配線（setContent / setTheme / setSettings / compare / コメント等）
 * - vanilla orchestrator（`mountVanillaRichMarkdownEditor`）の mount / live update / 再 mount
 *   （locale 変更・履歴比較は React 期の editorKey remount と同じく destroy → 再 mount）
 * - ランディング画面・Claude 編集中バナー・スクロール同期・リンク横取り
 *
 * テーマは `applyEditorThemeCssVars`（CSS 変数）+ body 背景色のみ（MUI ThemeProvider/CssBaseline 廃止）。
 * 確認ダイアログは orchestrator 既定の vanilla 確認、embed の外部 fetch は
 * `setEmbedProviders(createVsCodeEmbedProviders())` で注入する。
 */

import {
  applyEditorThemeCssVars,
  createMarkdownT,
  DEFAULT_DARK_BG,
  DEFAULT_LIGHT_BG,
  STORAGE_KEY_CONTENT,
  STORAGE_KEY_SETTINGS,
  type ThemePresetName,
} from '@anytime-markdown/markdown-viewer';
import { detectLocale } from '@anytime-markdown/markdown-viewer/src/i18n/createMarkdownT';
import { setEmbedProviders } from '@anytime-markdown/markdown-viewer/src/embedProviders';
import type { VanillaMarkdownEditorHandle } from '@anytime-markdown/markdown-viewer/src/host/vanillaMarkdownEditor';
import { mountVanillaRichMarkdownEditor } from '@anytime-markdown/markdown-rich/src/vanilla/mountVanillaRichMarkdownEditor';

import { getVsCodeApi } from './vscodeApi';
import { createVsCodeEmbedProviders } from './vscodeEmbedProviders';

const vscode = getVsCodeApi();
// markdown-core の EditorContextMenu 等から VS Code API にアクセスするため公開
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
} catch { /* settings 強制は失敗しても編集機能に影響しないため握りつぶす（初期化前の JSON 破損のみ） */ }

// --- Message handler helpers ---

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

// --- アプリ状態（React useState 相当の closure 変数） ---

interface AppState {
  ready: boolean;
  landing: boolean;
  themeMode: 'light' | 'dark';
  presetName: ThemePresetName;
  locale: string;
  claudeEditing: boolean;
  autoReload: boolean;
  compareContent: string | null;
}

const state: AppState = {
  ready: false,
  landing: false,
  themeMode: 'dark',
  presetName: 'handwritten',
  locale: detectLocale(),
  claudeEditing: false,
  autoReload: true,
  compareContent: null,
};

let rootEl: HTMLElement | null = null;
let editorHandle: VanillaMarkdownEditorHandle | null = null;
let bannerEl: HTMLElement | null = null;
// 履歴比較フロー（loadHistoryContent → compareModeChanged(active) で remount）の一時保持
let latestContent: string | null = null;
let historicalContent: string | null = null;

/** テーマ（CSS 変数 + body 背景）を反映する。MUI ThemeProvider/CssBaseline の置換。 */
function applyTheme(): void {
  applyEditorThemeCssVars({ presetName: state.presetName, themeMode: state.themeMode });
  document.body.style.margin = '0';
  document.body.style.backgroundColor = state.themeMode === 'dark' ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
  document.documentElement.style.colorScheme = state.themeMode;
}

// --- Claude 編集中バナー ---

const CLAUDE_BANNER_STYLE_ID = 'am-claude-banner-style';

function ensureClaudeBannerStyle(): void {
  if (document.getElementById(CLAUDE_BANNER_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = CLAUDE_BANNER_STYLE_ID;
  s.textContent = '@keyframes claude-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

function syncClaudeBanner(container: HTMLElement): void {
  if (!state.claudeEditing) {
    bannerEl?.remove();
    bannerEl = null;
    return;
  }
  if (bannerEl) return;
  ensureClaudeBannerStyle();
  const isDark = state.themeMode === 'dark';
  const isJa = state.locale.startsWith('ja');
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:absolute;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;' +
    'justify-content:center;gap:8px;padding:4px 16px;backdrop-filter:blur(4px);font-size:12px;' +
    `background-color:${isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)'};` +
    `border-bottom:2px solid ${isDark ? 'rgba(255,180,0,0.5)' : 'rgba(255,160,0,0.5)'};` +
    `color:${isDark ? 'rgba(255,200,100,0.9)' : 'rgba(160,100,0,0.9)'};pointer-events:none;`;
  const gear = document.createElement('span');
  gear.style.cssText = 'font-size:14px;animation:claude-spin 2s linear infinite;';
  gear.textContent = '⚙';
  const label = document.createElement('span');
  label.textContent = isJa ? 'Claude Code が編集中です' : 'Claude Code is editing';
  banner.append(gear, label);
  container.appendChild(banner);
  bannerEl = banner;
}

// --- ランディング画面（旧 LandingPage の素 DOM 版） ---

function renderLanding(container: HTMLElement): void {
  const isDark = state.themeMode === 'dark';
  const logoUri = (window as unknown as { __LOGO_URI__?: string }).__LOGO_URI__;
  const isJa = state.locale.startsWith('ja');

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;' +
    `background-color:${isDark ? '#1e1e1e' : '#ffffff'};color:${isDark ? '#cccccc' : '#333333'};` +
    "font-family:var(--vscode-font-family, sans-serif);gap:24px;";

  if (logoUri) {
    const img = document.createElement('img');
    img.src = logoUri;
    img.alt = 'Anytime Markdown';
    img.style.cssText = 'width:64px;height:64px;opacity:0.8;';
    wrap.appendChild(img);
  }

  const text = document.createElement('div');
  text.style.cssText = 'font-size:14px;text-align:center;line-height:1.8;';
  if (isJa) {
    text.append('差分は、サイドバー「Anytime Markdown」の', document.createElement('br'), 'GIT HISTORY で確認してください。');
  } else {
    const strong = document.createElement('strong');
    strong.textContent = 'GIT HISTORY';
    text.append('To view diffs, use ', strong, ' in the', document.createElement('br'), '"Anytime Markdown" sidebar.');
  }
  wrap.appendChild(text);

  const button = document.createElement('button');
  button.textContent = isJa ? 'Anytime Markdown で編集' : 'Open in Anytime Markdown';
  button.style.cssText =
    'padding:8px 24px;font-size:13px;cursor:pointer;border:none;border-radius:4px;' +
    `background-color:${isDark ? '#0e639c' : '#007acc'};color:#ffffff;`;
  button.addEventListener('click', () => {
    state.landing = false;
    renderApp();
  });
  wrap.appendChild(button);

  container.appendChild(wrap);
}

// --- エディタ mount / 再 mount ---

/** mode 文字列通知（vanilla の ToolbarModeState → React 期の mode 文字列へ変換）。 */
function handleVanillaModeChange(modeState: { sourceMode?: boolean; reviewMode?: boolean; readonlyMode?: boolean }): void {
  let mode = 'wysiwyg';
  if (modeState.sourceMode) mode = 'source';
  else if (modeState.reviewMode) mode = 'review';
  else if (modeState.readonlyMode) mode = 'readonly';
  vscode.postMessage({ type: 'modeChanged', mode });
}

function handleCompareModeChange(active: boolean): void {
  vscode.postMessage({ type: 'compareModeChanged', active });
  if (active && historicalContent != null && latestContent != null) {
    // 比較モード切替: 左=最新、右=選択コミット。再 mount 時の再トリガーを防ぐためクリアする。
    const latest = latestContent;
    const commit = historicalContent;
    historicalContent = null;
    latestContent = null;
    currentContent = latest;
    state.compareContent = commit;
    remountEditor();
  }
}

/** orchestrator の mount オプション（旧 VanillaMarkdownEditorMount の JSX props 相当）。 */
function buildMountOptions() {
  return {
    t: createMarkdownT('MarkdownEditor', state.locale),
    locale: state.locale,
    hideToolbar: true,
    sideToolbar: true,
    hide: { settings: true },
    hideStatusBar: true,
    readOnly: state.claudeEditing,
    externalCompareContent: state.compareContent,
    onCompareModeChange: handleCompareModeChange,
    onHeadingsChange: (headings: Array<{ level: number; text: string; pos: number; kind: string }>) =>
      vscode.postMessage({ type: 'headingsChanged', headings }),
    onCommentsChange: (comments: Array<{ id: string; text: string; resolved: boolean; createdAt: string; targetText: string; pos: number; isPoint: boolean }>) =>
      vscode.postMessage({ type: 'commentsChanged', comments }),
    onStatusChange: (status: { line: number; col: number; charCount: number; lineCount: number; lineEnding: string; encoding: string }) =>
      vscode.postMessage({ type: 'statusChanged', status }),
    autoReload: state.autoReload,
    onModeChange: handleVanillaModeChange,
    themeMode: state.themeMode,
    presetName: state.presetName,
    showFrontmatter: true,
    persistDraft: true,
  };
}

/**
 * エディタを mount する。失敗時は旧 EditorErrorBoundary 相当のフォールバック
 * （再読み込みボタン + console / `editorError` 転送）を表示する。
 */
function mountEditor(container: HTMLElement): void {
  try {
    editorHandle = mountVanillaRichMarkdownEditor(container, buildMountOptions());
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // eslint-disable-next-line no-console
    console.error(`[${new Date().toISOString()}] [webview] エディタの mount でエラーが発生`, err, err.stack ?? '');
    vscode.postMessage({ type: 'editorError', message: err.message, stack: err.stack ?? '', componentStack: '' });
    container.replaceChildren();
    const fallback = document.createElement('div');
    fallback.setAttribute('role', 'alert');
    fallback.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh;gap:16px;padding:32px;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:1.25rem;';
    title.textContent = 'エディタでエラーが発生しました';
    const detail = document.createElement('div');
    detail.style.cssText = 'max-width:480px;text-align:center;white-space:pre-wrap;font-size:0.875rem;';
    detail.textContent = err.message;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '再読み込み';
    retry.addEventListener('click', () => {
      renderApp();
    });
    fallback.append(title, detail, retry);
    container.appendChild(fallback);
  }
}

/** エディタを破棄して mount し直す（React 期の editorKey remount 相当）。 */
function remountEditor(): void {
  renderApp();
}

/** ルート DOM を状態に基づき再構築する。 */
function renderApp(): void {
  if (!rootEl) return;
  editorHandle?.destroy();
  editorHandle = null;
  bannerEl = null;
  rootEl.replaceChildren();

  if (!state.ready) return;

  if (state.landing) {
    renderLanding(rootEl);
    return;
  }

  const container = document.createElement('div');
  container.style.cssText = 'position:relative;width:100%;height:100%;';
  rootEl.appendChild(container);
  mountEditor(container);
  syncClaudeBanner(container);
}

/** live props を orchestrator へ反映する（remount 不要な変更）。 */
function pushLiveUpdate(): void {
  editorHandle?.update({
    readOnly: state.claudeEditing,
    themeMode: state.themeMode,
    presetName: state.presetName,
    autoReload: state.autoReload,
    externalCompareContent: state.compareContent,
  });
}

// --- メッセージ配線 ---

function handleSetContent(message: { content: string; compareContent?: string }): void {
  const isInitial = !state.ready;
  currentContent = message.content;
  if (isInitial) {
    if (typeof message.compareContent === 'string') {
      state.compareContent = message.compareContent;
    }
    state.ready = true;
    renderApp();
  } else {
    dispatchCustomEvent('vscode-set-content', message.content);
  }
}

function handleLoadHistoryContent(message: { content: string }): void {
  latestContent = currentContent;
  historicalContent = message.content;
  currentContent = message.content;
  dispatchCustomEvent('vscode-set-content', message.content);
}

function handleSetSettings(s: { themeMode?: string; themePreset?: string; language?: string }): void {
  let themeChanged = false;
  if (s.themeMode === 'light' || s.themeMode === 'dark') {
    state.themeMode = s.themeMode;
    themeChanged = true;
  }
  if (s.themePreset === 'handwritten' || s.themePreset === 'professional') {
    state.presetName = s.themePreset;
    themeChanged = true;
  }
  if (themeChanged) {
    applyTheme();
    pushLiveUpdate();
    // バナー配色はテーマ依存のため作り直す
    if (bannerEl) {
      const container = bannerEl.parentElement;
      bannerEl.remove();
      bannerEl = null;
      if (container) syncClaudeBanner(container);
    }
  }
  if (s.language === 'en' || s.language === 'ja') {
    document.documentElement.lang = s.language;
    if (state.locale !== s.language) {
      state.locale = s.language;
      // locale / t は orchestrator の mount 時固定（live patch 対象外）のため再 mount で反映する。
      remountEditor();
    }
  }
}

function handleMessage(event: MessageEvent): void {
  // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
  if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
  const message = event.data;
  if (!message?.type) return;

  switch (message.type) {
    case 'setTheme':
      if (message.themeMode === 'light' || message.themeMode === 'dark') {
        state.themeMode = message.themeMode;
        applyTheme();
        pushLiveUpdate();
      }
      if (typeof message.claudeLocked === 'boolean') {
        isClaudeEditing = message.claudeLocked;
        state.claudeEditing = message.claudeLocked;
        pushLiveUpdate();
        const container = rootEl?.firstElementChild as HTMLElement | null;
        if (container) syncClaudeBanner(container);
      }
      return;
    case 'setSettings':
      if (message.settings) handleSetSettings(message.settings);
      return;
    case 'setLanding':
      if (message.landing === true) {
        state.landing = true;
        renderApp();
      }
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
      if (typeof message.content === 'string') handleLoadHistoryContent(message);
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
    case 'setAutoReload':
      if (typeof message.enabled === 'boolean') {
        state.autoReload = message.enabled;
        pushLiveUpdate();
      }
      return;
    case 'setMode':
      if (typeof message.mode === 'string') dispatchCustomEvent('vscode-set-mode', message.mode);
      return;
    case 'setContent':
      if (typeof message.content === 'string') handleSetContent(message);
      return;
  }
}

// --- スクロール同期（webview → extension host） ---

function installScrollSync(): void {
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
}

// --- リンク横取り（相対リンクを extension host で解決） ---

function installLinkInterception(): void {
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
}

// --- 起動 ---

/** webview アプリを起動する（旧 createRoot(container).render(<App/>) の置換）。 */
export function startApp(container: HTMLElement): void {
  rootEl = container;
  // embed プレビュー（vanilla）の外部 fetch を拡張ホスト経由に注入（起動時に一度）
  setEmbedProviders(createVsCodeEmbedProviders());
  applyTheme();
  window.addEventListener('message', handleMessage);
  window.addEventListener('vscode-save-compare-file', (e: Event) => {
    const content = (e as CustomEvent<string>).detail;
    vscode.postMessage({ type: 'saveCompareFile', content });
  });
  installScrollSync();
  installLinkInterception();
  vscode.postMessage({ type: 'ready' });
}
