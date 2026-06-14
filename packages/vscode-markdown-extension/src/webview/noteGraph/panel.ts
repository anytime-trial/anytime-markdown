/**
 * ノート網パネル（エディタ右サイドバーにスロット表示されるホスト所有 DOM）。
 *
 * graph-core の `buildNoteGraph` + `GraphView` でドキュメント関係グラフを描画する。
 * docs は拡張ホストが供給し（`setDocs`）、ノードクリック・接続は callback で通知する。
 * markdown-viewer は本要素を出し入れするだけで中身に関知しない。
 */

import {
  buildNoteGraph,
  GraphView,
  type NoteGraphDocInput,
  type NoteGraphEdgeLayers,
} from '@anytime-markdown/graph-core';

export interface NoteGraphPanelOptions {
  t: (key: string) => string;
  /** ノードクリック（接続モード以外）→ ファイルを開く。 */
  onOpenDoc: (path: string) => void;
  /** 接続モードで 2 ノードを選択 → 関連付け。 */
  onConnect: (from: string, to: string) => void;
  /** 再スキャン要求（ホストへ）。 */
  onRefresh: () => void;
}

export interface NoteGraphPanelHandle {
  element: HTMLElement;
  setDocs(input: { docs: NoteGraphDocInput[]; isDark: boolean }): void;
  /** パネルを閉じたときに接続モード等の一時状態を解除する。 */
  resetInteraction(): void;
  destroy(): void;
}

const PANEL_WIDTH = 300;

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

function shortName(p: string): string {
  return p.split('/').at(-1) ?? p;
}

export function createNoteGraphPanel(opts: NoteGraphPanelOptions): NoteGraphPanelHandle {
  injectStyles();

  const root = el('div', { className: 'ng-panel' });
  root.style.width = `${PANEL_WIDTH}px`;
  const toolbar = el('div', { className: 'ng-toolbar' });
  const canvasWrap = el('div', { className: 'ng-canvas' });
  const canvas = document.createElement('canvas');
  canvasWrap.append(canvas);
  const status = el('div', { className: 'ng-status' });
  root.append(toolbar, canvasWrap, status);

  const state = {
    docs: [] as NoteGraphDocInput[],
    isDark: true,
    layers: { related: true, tags: false, category: false, c4Scope: false } as NoteGraphEdgeLayers,
    connectMode: false,
    pendingSource: null as string | null,
  };

  const view = new GraphView(canvas, { theme: state.isDark ? 'dark' : 'light', movableNodes: true });

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const rebuild = (): void => {
    const doc = buildNoteGraph(state.docs, { isDark: state.isDark, edges: state.layers });
    view.setDocument(doc);
    view.fitToContent();
    setStatus(`${state.docs.length} / ${doc.edges.length}`);
  };

  view.on('nodeClick', (id: string) => {
    if (!state.connectMode) {
      opts.onOpenDoc(id);
      return;
    }
    if (!state.pendingSource) {
      state.pendingSource = id;
      setStatus(`→ ${shortName(id)}`);
      return;
    }
    if (state.pendingSource !== id) {
      opts.onConnect(state.pendingSource, id);
      setStatus(`${shortName(state.pendingSource)} → ${shortName(id)}`);
    }
    state.pendingSource = null;
  });

  const refreshBtn = button(opts.t('noteGraphRefresh'), () => opts.onRefresh());
  const connectBtn = button(opts.t('noteGraphConnect'), () => {
    state.connectMode = !state.connectMode;
    state.pendingSource = null;
    connectBtn.classList.toggle('active', state.connectMode);
    setStatus(state.connectMode ? 'A → B' : '');
  });
  const tagsToggle = layerToggle(opts.t('noteGraphTags'), (on) => {
    state.layers.tags = on;
    rebuild();
  });

  toolbar.append(refreshBtn, connectBtn, tagsToggle);

  return {
    element: root,
    setDocs(input): void {
      state.docs = input.docs;
      if (state.isDark !== input.isDark) {
        state.isDark = input.isDark;
        view.setTheme(state.isDark ? 'dark' : 'light');
      }
      rebuild();
    },
    resetInteraction(): void {
      state.connectMode = false;
      state.pendingSource = null;
      connectBtn.classList.remove('active');
      setStatus('');
    },
    destroy(): void {
      view.destroy();
      root.remove();
    },
  };
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

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ng-panel { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--am-color-divider, var(--vscode-panel-border)); color: var(--am-color-text-primary, var(--vscode-foreground)); font-size: 12px; }
    .ng-panel .ng-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; border-bottom: 1px solid var(--am-color-divider, var(--vscode-panel-border)); }
    .ng-panel .ng-canvas { position: relative; flex: 1 1 auto; min-height: 0; }
    .ng-panel .ng-canvas canvas { display: block; width: 100%; height: 100%; }
    .ng-panel .ng-status { padding: 2px 8px; min-height: 16px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--am-color-divider, var(--vscode-panel-border)); }
    .ng-panel .ng-btn { background: transparent; color: inherit; border: 1px solid var(--vscode-button-border, var(--am-color-divider, var(--vscode-panel-border))); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
    .ng-panel .ng-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .ng-panel .ng-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .ng-panel .ng-toggle { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; user-select: none; }
  `;
  document.head.append(style);
}
