/**
 * ノート網パネル（ホスト所有 DOM）。
 *
 * `buildNoteGraph` + `GraphView` でドキュメント関係グラフを描画する vanilla DOM 部品。
 * docs はホストが供給し（`setDocs`）、ノードクリック・接続・再スキャンは callback で通知する。
 * VS Code 拡張・web-app の双方から共有される（host 非依存: graph-core + DOM + callback のみ）。
 */

import { GraphView } from './GraphView';
import {
  buildNoteGraph,
  buildNoteNeighborhood,
  RELATION_TYPES,
  resolveRelationEdgeStyle,
} from '../presets/index';
import type {
  NoteGraphDocInput,
  NoteGraphEdgeLayers,
  RelationType,
} from '../presets/index';

/** 関係種別 → i18n キー（凡例・型ピッカーのラベル）。語彙は presets と一致。 */
const TYPE_LABEL_KEY: Record<RelationType, string> = {
  references: 'noteGraphTypeReferences',
  'depends-on': 'noteGraphTypeDependsOn',
  implements: 'noteGraphTypeImplements',
  'part-of': 'noteGraphTypePartOf',
  supersedes: 'noteGraphTypeSupersedes',
  refines: 'noteGraphTypeRefines',
};

export interface NoteGraphPanelOptions {
  t: (key: string) => string;
  /** ノードクリック（接続モード以外）→ ファイルを開く。 */
  onOpenDoc: (path: string) => void;
  /** 接続モードで 2 ノードを選択し型を確定 → 型付き関連付け。 */
  onConnect: (from: string, to: string, type: RelationType) => void;
  /** 再スキャン要求（ホストへ）。 */
  onRefresh: () => void;
  /**
   * 接続 UI（関連付け追加）と再スキャンボタンを隠す。閲覧専用ホスト（web-app）用。
   * 省略時は false（従来どおり接続・再スキャンを表示）。
   */
  readOnly?: boolean;
}

export interface NoteGraphPanelHandle {
  element: HTMLElement;
  setDocs(input: { docs: NoteGraphDocInput[]; isDark: boolean; currentPath?: string }): void;
  /** パネルを閉じたときに接続モード等の一時状態を解除する。 */
  resetInteraction(): void;
  /** ピン留め中か（他パネルを開いても自動で閉じない）。 */
  isPinned(): boolean;
  destroy(): void;
}

const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 200;
const MAX_WIDTH = 720;
const WIDTH_STORAGE_KEY = 'anytime.noteGraph.panelWidth';

function loadWidth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[noteGraph] panel width restore unavailable', err);
  }
  return DEFAULT_WIDTH;
}

function saveWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[noteGraph] panel width persist unavailable', err);
  }
}

const PIN_STORAGE_KEY = 'anytime.noteGraph.pinned';
// PushPinIcon（Material）
const ICON_PIN =
  'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';

function loadPinned(): boolean {
  try {
    return globalThis.localStorage?.getItem(PIN_STORAGE_KEY) === '1';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[noteGraph] pin state restore unavailable', err);
    return false;
  }
}

function savePinned(pinned: boolean): void {
  try {
    globalThis.localStorage?.setItem(PIN_STORAGE_KEY, pinned ? '1' : '0');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[noteGraph] pin state persist unavailable', err);
  }
}

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
  const readOnly = opts.readOnly ?? false;

  const root = el('div', { className: 'ng-panel' });
  // 左端のドラッグハンドル（パネルは右側に出るため左移動で広がる）
  const resizeHandle = el('div', { className: 'ng-resize' });
  const inner = el('div', { className: 'ng-inner' });
  const toolbar = el('div', { className: 'ng-toolbar' });
  // 型→色の凡例（トグル表示）と、接続確定時の型ピッカー（A→B 選択後に出現）。
  const legend = el('div', { className: 'ng-legend' });
  legend.hidden = true;
  const typePicker = el('div', { className: 'ng-typepicker' });
  typePicker.hidden = true;
  const canvasWrap = el('div', { className: 'ng-canvas' });
  const canvas = document.createElement('canvas');
  canvasWrap.append(canvas);
  const status = el('div', { className: 'ng-status' });
  inner.append(toolbar, legend, typePicker, canvasWrap, status);
  root.append(resizeHandle, inner);

  let panelWidth = loadWidth();
  root.style.width = `${panelWidth}px`;

  const state = {
    docs: [] as NoteGraphDocInput[],
    isDark: true,
    layers: { related: true, tags: false, category: false, c4Scope: false } as NoteGraphEdgeLayers,
    connectMode: false,
    pendingSource: null as string | null,
    pendingTarget: null as string | null,
    legendVisible: false,
    pinned: loadPinned(),
    // 表示モード: 中心表示（現在 doc 中心の近傍）/ 全体表示（リポジトリ全体）
    mode: 'neighborhood' as 'neighborhood' | 'global',
    includeBodyLinks: true,
    currentPath: undefined as string | undefined,
    // 再センタリング時の中心 override（クリックで隣接 doc を中心に）
    centerOverride: null as string | null,
  };

  const view = new GraphView(canvas, { theme: state.isDark ? 'dark' : 'light', movableNodes: true });

  // キャンバス backing store を表示サイズ×dpr に同期して再描画（DPR 補正）。
  // 幅ドラッグ・ウィンドウリサイズ・パネル開閉の全てを ResizeObserver が拾う。
  const syncCanvasSize = (): void => {
    const rect = canvasWrap.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w / dpr}px`;
    canvas.style.height = `${h / dpr}px`;
    view.resize();
  };
  const resizeObserver = new ResizeObserver(() => syncCanvasSize());
  resizeObserver.observe(canvasWrap);

  // 左端ハンドルのドラッグで幅を変更（min/max でクランプ・localStorage に保存）。
  let dragStartX = 0;
  let dragStartW = 0;
  let dragging = false;
  resizeHandle.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartW = panelWidth;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  resizeHandle.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    panelWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartW + (dragStartX - e.clientX)));
    root.style.width = `${panelWidth}px`;
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try {
      resizeHandle.releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture 未確立時は無視（同一 pointerId のみ対象のため実害なし）
    }
    saveWidth(panelWidth);
  };
  resizeHandle.addEventListener('pointerup', endDrag);
  resizeHandle.addEventListener('pointercancel', endDrag);

  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  const activeCenter = (): string | undefined => state.centerOverride ?? state.currentPath;

  // 型→色のスウォッチ（凡例・型ピッカー共通）。色はキャンバスのエッジ色と一致させる。
  const swatch = (type: RelationType): HTMLElement => {
    const s = resolveRelationEdgeStyle(type, state.isDark);
    const line = el('span', { className: 'ng-swatch' });
    line.style.borderTopColor = s.stroke;
    line.style.borderTopStyle = s.dashed ? 'dashed' : 'solid';
    return line;
  };

  const renderLegend = (): void => {
    legend.replaceChildren(
      ...RELATION_TYPES.map((type) =>
        el('span', { className: 'ng-legend-item' }, [swatch(type), opts.t(TYPE_LABEL_KEY[type])]),
      ),
    );
  };

  // 接続選択（pendingSource / pendingTarget）と型ピッカーを初期化する。
  const resetConnectSelection = (): void => {
    state.pendingSource = null;
    state.pendingTarget = null;
    typePicker.hidden = true;
    typePicker.replaceChildren();
    setStatus(state.connectMode ? 'A → B' : '');
  };

  // A→B 選択後、関係型を選ばせる型ピッカーを表示する。型確定で onConnect。
  const showTypePicker = (): void => {
    const from = state.pendingSource;
    const to = state.pendingTarget;
    if (!from || !to) return;
    const prompt = el('span', { className: 'ng-picker-label', textContent: opts.t('noteGraphSelectType') });
    const buttons = RELATION_TYPES.map((type) => {
      const label = opts.t(TYPE_LABEL_KEY[type]);
      const b = el('button', { className: 'ng-btn ng-type-btn' }, [swatch(type), label]);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        opts.onConnect(from, to, type);
        resetConnectSelection();
      });
      return b;
    });
    typePicker.replaceChildren(prompt, ...buttons);
    typePicker.hidden = false;
  };

  const rebuild = (): void => {
    if (state.mode === 'neighborhood' && activeCenter()) {
      const doc = buildNoteNeighborhood(state.docs, activeCenter() as string, {
        isDark: state.isDark,
        includeBodyLinks: state.includeBodyLinks,
      });
      view.setDocument(doc);
      view.fitToContent();
      setStatus(`${shortName(activeCenter() as string)} · ${doc.nodes.length - 1}`);
      return;
    }
    const doc = buildNoteGraph(state.docs, { isDark: state.isDark, edges: state.layers });
    view.setDocument(doc);
    view.fitToContent();
    setStatus(`${state.docs.length} / ${doc.edges.length}`);
  };

  view.on('nodeClick', (id: string) => {
    if (state.connectMode) {
      if (!state.pendingSource) {
        state.pendingSource = id;
        setStatus(`→ ${shortName(id)}`);
        return;
      }
      if (state.pendingSource === id) {
        // 同一ノード再クリックで選択解除
        resetConnectSelection();
        return;
      }
      // A→B 確定。型ピッカーで関係種別を選んでから関連付ける。
      state.pendingTarget = id;
      setStatus(`${shortName(state.pendingSource)} → ${shortName(id)}`);
      showTypePicker();
      return;
    }
    // 中心表示: クリックで再センタリング。既に中心のノードを再クリックで開く。
    if (state.mode === 'neighborhood') {
      if (id === activeCenter()) {
        opts.onOpenDoc(id);
      } else {
        state.centerOverride = id;
        rebuild();
      }
      return;
    }
    // 全体表示: クリックで開く
    opts.onOpenDoc(id);
  });

  // 全体表示トグル（active=全体 / 非active=中心表示）
  const globalBtn = button(opts.t('noteGraphGlobalView'), () => {
    state.mode = state.mode === 'global' ? 'neighborhood' : 'global';
    state.centerOverride = null;
    globalBtn.classList.toggle('active', state.mode === 'global');
    rebuild();
  });
  const legendBtn = button(opts.t('noteGraphLegend'), () => {
    state.legendVisible = !state.legendVisible;
    legend.hidden = !state.legendVisible;
    legendBtn.classList.toggle('active', state.legendVisible);
    if (state.legendVisible) renderLegend();
  });
  const bodyToggle = layerToggle(opts.t('noteGraphBodyLinks'), (on) => {
    state.includeBodyLinks = on;
    rebuild();
  });
  bodyToggle.querySelector('input')!.checked = state.includeBodyLinks;
  // ピン: 有効時は他パネル（Outline 等）を開いてもノート網が自動で閉じない
  const pinBtn = iconButton(ICON_PIN, opts.t('noteGraphPin'), () => {
    state.pinned = !state.pinned;
    savePinned(state.pinned);
    pinBtn.classList.toggle('active', state.pinned);
  });
  pinBtn.classList.toggle('active', state.pinned);

  // 閲覧専用では接続モードが無いため no-op。接続 UI を持つ場合のみ下で上書きする。
  let resetInteractionImpl = (): void => {};

  toolbar.append(globalBtn);
  // 閲覧専用（web-app）では再スキャン・接続 UI を出さない。
  if (!readOnly) {
    const refreshBtn = button(opts.t('noteGraphRefresh'), () => opts.onRefresh());
    const connectBtn = button(opts.t('noteGraphConnect'), () => {
      state.connectMode = !state.connectMode;
      connectBtn.classList.toggle('active', state.connectMode);
      resetConnectSelection();
    });
    toolbar.append(refreshBtn, connectBtn);
    // resetInteraction が connectBtn を参照するためクロージャで保持する。
    resetInteractionImpl = (): void => {
      state.connectMode = false;
      connectBtn.classList.remove('active');
      resetConnectSelection();
    };
  }
  toolbar.append(legendBtn, bodyToggle, pinBtn);

  return {
    element: root,
    setDocs(input): void {
      state.docs = input.docs;
      // 別ドキュメントを開いたときだけ再センタリングをリセットする。
      // 同一ドキュメントの再スキャン（Refresh 等）では再センタリング状態を維持する。
      if (input.currentPath !== undefined && input.currentPath !== state.currentPath) {
        state.currentPath = input.currentPath;
        state.centerOverride = null;
      }
      if (state.isDark !== input.isDark) {
        state.isDark = input.isDark;
        view.setTheme(state.isDark ? 'dark' : 'light');
        // 凡例のスウォッチ色はテーマ依存のため再描画する
        if (state.legendVisible) renderLegend();
      }
      rebuild();
    },
    resetInteraction(): void {
      resetInteractionImpl();
    },
    isPinned(): boolean {
      return state.pinned;
    },
    destroy(): void {
      resizeObserver.disconnect();
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

function iconButton(svgPath: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { className: 'ng-btn ng-icon-btn', title: label });
  b.setAttribute('aria-label', label);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const pathEl = document.createElementNS(ns, 'path');
  pathEl.setAttribute('d', svgPath);
  svg.append(pathEl);
  b.append(svg);
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
    .ng-panel { display: flex; flex-direction: row; min-height: 0; border-left: 1px solid var(--am-color-divider, var(--vscode-panel-border)); color: var(--am-color-text-primary, var(--vscode-foreground)); font-size: 12px; flex-shrink: 0; }
    .ng-panel .ng-resize { flex: 0 0 6px; align-self: stretch; cursor: col-resize; background: transparent; touch-action: none; }
    .ng-panel .ng-resize:hover { background: var(--am-color-primary-main, var(--vscode-focusBorder)); opacity: 0.6; }
    .ng-panel .ng-inner { display: flex; flex-direction: column; min-height: 0; min-width: 0; flex: 1 1 auto; }
    .ng-panel .ng-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; border-bottom: 1px solid var(--am-color-divider, var(--vscode-panel-border)); }
    .ng-panel .ng-canvas { position: relative; flex: 1 1 auto; min-height: 0; }
    .ng-panel .ng-canvas canvas { display: block; width: 100%; height: 100%; }
    .ng-panel .ng-status { padding: 2px 8px; min-height: 16px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--am-color-divider, var(--vscode-panel-border)); }
    .ng-panel .ng-btn { background: transparent; color: inherit; border: 1px solid var(--vscode-button-border, var(--am-color-divider, var(--vscode-panel-border))); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 12px; }
    .ng-panel .ng-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
    .ng-panel .ng-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .ng-panel .ng-icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; }
    .ng-panel .ng-toggle { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; user-select: none; }
    .ng-panel .ng-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 4px 8px; border-bottom: 1px solid var(--am-color-divider, var(--vscode-panel-border)); }
    .ng-panel .ng-legend-item { display: inline-flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); }
    .ng-panel .ng-swatch { display: inline-block; width: 18px; height: 0; border-top-width: 2px; vertical-align: middle; flex-shrink: 0; }
    .ng-panel .ng-typepicker { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid var(--am-color-divider, var(--vscode-panel-border)); background: var(--vscode-editorWidget-background, transparent); }
    .ng-panel .ng-picker-label { color: var(--vscode-descriptionForeground); margin-right: 2px; }
    .ng-panel .ng-type-btn { display: inline-flex; align-items: center; gap: 4px; }
  `;
  document.head.append(style);
}
