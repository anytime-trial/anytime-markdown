/**
 * ノート網ビューア webview エントリ。
 *
 * 拡張ホストから受け取った `NoteGraphDocInput[]` を graph-core の `buildNoteGraph`
 * でグラフ化し、`GraphView`（vanilla Canvas）で描画する。ノードクリックで
 * ファイルを開き、接続モードでは 2 ノードを結んで `related` を追記する。
 */

import {
  buildNoteGraph,
  GraphView,
  type NoteGraphDocInput,
  type NoteGraphEdgeLayers,
} from '@anytime-markdown/graph-core';

interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

interface State {
  docs: NoteGraphDocInput[];
  isDark: boolean;
  layers: NoteGraphEdgeLayers;
  connectMode: boolean;
  pendingSource: string | null;
}

const state: State = {
  docs: [],
  isDark: true,
  layers: { related: true, tags: false, category: false, c4Scope: false },
  connectMode: false,
  pendingSource: null,
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

function startApp(root: HTMLElement): void {
  injectStyles();

  const toolbar = el('div', { className: 'ng-toolbar' });
  const status = el('div', { className: 'ng-status' });
  const canvasWrap = el('div', { className: 'ng-canvas' });
  const canvas = document.createElement('canvas');
  canvasWrap.append(canvas);
  root.append(toolbar, canvasWrap, status);

  const view = new GraphView(canvas, { theme: state.isDark ? 'dark' : 'light', movableNodes: true });

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const rebuild = (): void => {
    const doc = buildNoteGraph(state.docs, { isDark: state.isDark, edges: state.layers });
    view.setDocument(doc);
    view.fitToContent();
    setStatus(`${state.docs.length} ドキュメント / ${doc.edges.length} リンク`);
  };

  view.on('nodeClick', (id: string) => {
    if (!state.connectMode) {
      vscode.postMessage({ type: 'openDoc', path: id });
      return;
    }
    if (!state.pendingSource) {
      state.pendingSource = id;
      setStatus(`接続元: ${shortName(id)} → 接続先ノードをクリック`);
      return;
    }
    if (state.pendingSource !== id) {
      vscode.postMessage({ type: 'connect', from: state.pendingSource, to: id });
      setStatus(`関連付け: ${shortName(state.pendingSource)} → ${shortName(id)}`);
    }
    state.pendingSource = null;
  });

  // ── ツールバー ───────────────────────────────────────────────
  const refreshBtn = button('再読み込み', () => vscode.postMessage({ type: 'refresh' }));

  const connectBtn = button('接続モード', () => {
    state.connectMode = !state.connectMode;
    state.pendingSource = null;
    connectBtn.classList.toggle('active', state.connectMode);
    setStatus(state.connectMode ? '接続モード: ノード A → ノード B をクリック' : '');
  });

  const repoBtn = button('リポジトリ選択', () => vscode.postMessage({ type: 'pickRepository' }));

  const tagsToggle = layerToggle('タグ', (on) => {
    state.layers.tags = on;
    rebuild();
  });
  const categoryToggle = layerToggle('カテゴリ', (on) => {
    state.layers.category = on;
    rebuild();
  });
  const c4Toggle = layerToggle('C4', (on) => {
    state.layers.c4Scope = on;
    rebuild();
  });

  toolbar.append(refreshBtn, connectBtn, repoBtn, divider(), tagsToggle, categoryToggle, c4Toggle);

  // ── ホストからのメッセージ ───────────────────────────────────
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as { type?: string; docs?: NoteGraphDocInput[]; isDark?: boolean; message?: string };
    if (msg.type === 'docs' && Array.isArray(msg.docs)) {
      state.docs = msg.docs;
      if (typeof msg.isDark === 'boolean') {
        state.isDark = msg.isDark;
        view.setTheme(state.isDark ? 'dark' : 'light');
      }
      rebuild();
    } else if (msg.type === 'error') {
      setStatus(msg.message === 'noRepository' ? '対象リポジトリが見つかりません' : '読み込みに失敗しました');
    }
  });

  vscode.postMessage({ type: 'ready' });
}

function shortName(p: string): string {
  return p.split('/').at(-1) ?? p;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { className: 'ng-btn', textContent: label });
  b.addEventListener('click', onClick);
  return b;
}

function layerToggle(label: string, onChange: (on: boolean) => void): HTMLLabelElement {
  const input = el('input', { type: 'checkbox', className: 'ng-check' });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'ng-toggle' }, [input, label]);
}

function divider(): HTMLSpanElement {
  return el('span', { className: 'ng-divider' });
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; }
    #root { display: flex; flex-direction: column; height: 100%; }
    .ng-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    .ng-canvas { position: relative; flex: 1 1 auto; min-height: 0; }
    .ng-canvas canvas { display: block; width: 100%; height: 100%; }
    .ng-status { padding: 2px 8px; min-height: 16px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border); }
    .ng-btn { background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
    .ng-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
    .ng-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .ng-toggle { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; user-select: none; }
    .ng-divider { width: 1px; height: 16px; background: var(--vscode-panel-border); margin: 0 4px; }
  `;
  document.head.append(style);
}

const container = document.getElementById('root');
if (container) startApp(container);
