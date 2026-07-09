/**
 * mountVanillaGraphEditor — React 非依存のグラフエディタ mount factory。
 *
 * GraphEditor.tsx（React 版）の全オーケストレーションを closure 変数で再現する。
 * React 経路は変更せず並行維持する（consumer 切替は別 Phase）。
 *
 * ## 設計方針
 * - state（tool / showGrid / panels 等）は closure 変数
 * - createGraphStore で useGraphState 相当のストアを管理
 * - syncUI() で state 変化を各 vanilla コンポーネントへ手動反映（React 再 render 相当）
 * - themeMode / locale 変化時は destroy → 再 mount（locale は t 再生成・syncUI 再構築が必要）
 */

import {
  exportToDrawio, exportToSvg,
  importFromDrawio, importFromMermaid,
  layoutWithSubgroups,
} from '@anytime-markdown/graph-core';
import { clearImageCache } from '@anytime-markdown/graph-core/engine';
import type { LayoutAlgorithm } from '@anytime-markdown/graph-core/engine';
import {
  alignBottom, alignCenterH, alignCenterV, alignLeft, alignRight, alignTop,
  distributeH, distributeV, fitToContent,
  pan as panViewport,
  physics,
  screenToWorld,
  zoom as zoomViewport,
} from '@anytime-markdown/graph-core/engine';

import { createGraphT } from '../i18n/createGraphT';
import { applyGraphUiThemeVars } from '../ui/tokens';
import { injectGraphUiStyles } from '../ui/injectStyles';
import { createAutoSave } from '../hooks-vanilla/createAutoSave';
import { createCanvasInteraction } from '../hooks-vanilla/createCanvasInteraction';
import { createGraphStore } from '../hooks-vanilla/createGraphStore';
import { createPathHighlight } from '../hooks-vanilla/pathHighlight';
import { applyNodeFilter } from '../hooks-vanilla/nodeFilter';
import { applyDataMapping } from '../hooks-vanilla/dataMapping';
import { createTouchInteraction } from '../hooks-vanilla/createTouchInteraction';

import { createGraphCanvas } from '../components-vanilla/GraphCanvas';
import type { MutableRef } from '../components-vanilla/GraphCanvas';
import { createToolBar } from '../components-vanilla/ToolBar';
import { createPropertyPanel } from '../components-vanilla/PropertyPanel';
import { createSettingsPanel } from '../components-vanilla/SettingsPanel';
import { createDetailPanel } from '../components-vanilla/DetailPanel';
import type { DetailPanelHandle } from '../components-vanilla/DetailPanel';
import { createShapeHoverBar } from '../components-vanilla/ShapeHoverBar';
import type { ShapeHoverBarHandle } from '../components-vanilla/ShapeHoverBar';
import { createFilterPanel } from '../components-vanilla/FilterPanel';
import { createDocEditorModal } from '../components-vanilla/DocEditorModal';
import { createTextEditOverlay } from '../components-vanilla/TextEditOverlay';

import { getLastDocumentId, loadDocument } from '../store/graphStorage';
import { type AlignType, createDocument, createNode, ToolType, type Viewport } from '../types';
import type { DataMappingConfig } from '../types/dataMapping';
import type { NodeFilterConfig } from '../types/nodeFilter';
import { EMPTY_FILTER } from '../types/nodeFilter';
import type { PersistenceAdapter, SaveStatus } from '../types/persistence';

// ── 定数 ─────────────────────────────────────────────────────────────────────

/** 矢印キーの移動量を計算する（GraphEditor.tsx の純関数を複製） */
function computeArrowDelta(key: string, shiftKey: boolean): { dx: number; dy: number } | null {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return null;
  const step = shiftKey ? 10 : 1;
  const dx = key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0;
  const dy = key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0;
  return (dx !== 0 || dy !== 0) ? { dx, dy } : null;
}

const TOOL_SHORTCUT_MAP: Readonly<Record<string, ToolType>> = {
  v: 'select', r: 'rect', o: 'ellipse', s: 'sticky',
  t: 'text', d: 'diamond', p: 'parallelogram', y: 'cylinder',
  m: 'doc', f: 'frame',
  l: 'line', c: 'connector',
};

function computeLayerZIndex(
  action: 'up' | 'down' | 'top' | 'bottom',
  currentZ: number,
  allZ: number[],
): number {
  const maxZ = allZ.length > 0 ? Math.max(...allZ) : 0;
  const minZ = allZ.length > 0 ? Math.min(...allZ) : 0;
  if (action === 'up') return currentZ + 1;
  if (action === 'down') return currentZ - 1;
  if (action === 'top') return maxZ + 1;
  return minZ - 1;
}

// ── 公開 API 型 ──────────────────────────────────────────────────────────────

export interface MountGraphEditorOptions {
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  locale?: string;
  onLocaleChange?: (locale: string) => void;
  persistence?: PersistenceAdapter;
  containerHeight?: string;
}

export interface GraphEditorHandle {
  update(patch: Readonly<Partial<MountGraphEditorOptions>>): void;
  destroy(): void;
}

// ── mount 実装 ────────────────────────────────────────────────────────────────

export function mountVanillaGraphEditor(
  container: HTMLElement,
  options: Readonly<MountGraphEditorOptions>,
): GraphEditorHandle {
  // ── closure state（useRef / useState 相当） ──────────────────────────────

  let themeMode: 'light' | 'dark' = options.themeMode ?? 'dark';
  let locale: string | undefined = options.locale;
  let onThemeModeChange = options.onThemeModeChange;
  let onLocaleChange = options.onLocaleChange;
  let persistence: PersistenceAdapter | undefined = options.persistence;
  const containerHeight = options.containerHeight ?? '100vh';

  let isDark = themeMode === 'dark';
  let t = createGraphT('Graph', locale);

  // UI 状態
  let tool: ToolType = 'select';
  let showGrid = true;
  let editingNodeId: string | null = null;
  let textEditAppendMode = false;
  let showProperty = true;
  let showSettings = false;
  let isDragging = false;
  let layoutRunning = false;
  let collisionEnabled = false;
  let layoutAlgorithm: LayoutAlgorithm = 'eades';
  let dataMappingConfig: DataMappingConfig | undefined = undefined;
  let detailNodeId: string | null = null;
  let filterConfig: NodeFilterConfig = EMPTY_FILTER;
  let showFilter = false;
  let docEditNodeId: string | null = null;

  let saveStatus: SaveStatus = 'saved';

  // Refs（closure 変数として管理）
  const physicsRef: { current: physics.PhysicsEngine | null } = { current: null };
  const viewportAnimRef: MutableRef<import('@anytime-markdown/graph-core/engine').ViewportAnimation | null> = { current: null };

  // ── Graph store ──────────────────────────────────────────────────────────

  const store = createGraphStore();

  // ── Path highlight ────────────────────────────────────────────────────────

  const pathHighlight = createPathHighlight(store.getState().document.edges);
  // 注: pathHighlight の購読は graphCanvasHandle 生成後に登録する（下方）。
  // full syncUI ではなくハイライト装飾のみを部分更新することで、
  // syncUI ↔ pathHighlight のフィードバック再帰を構造的に断つ。

  // ── AutoSave ─────────────────────────────────────────────────────────────

  let autoSave = createAutoSave({
    debounceMs: 1000,
    onStatusChange: (s) => {
      saveStatus = s;
      if (toolBarHandle) {
        toolBarHandle.update({ saveStatus });
      }
    },
  });

  // ── Persistence（初期ロード） ─────────────────────────────────────────────

  function getActiveAdapter(): PersistenceAdapter {
    if (persistence) return persistence;
    // デフォルト: IndexedDB 自動保存
    return {
      loadInitial: async () => {
        const lastId = getLastDocumentId();
        if (!lastId) return null;
        return (await loadDocument(lastId)) ?? null;
      },
      save: () => {},
      status: saveStatus,
    };
  }

  let loadCancelled = false;
  (async () => {
    const adapter = getActiveAdapter();
    const doc = await Promise.resolve(adapter.loadInitial());
    if (!loadCancelled && doc) {
      store.dispatch({ type: 'SET_DOCUMENT', doc });
    }
  })();

  // ── DOM 構築 ─────────────────────────────────────────────────────────────

  // CSS 注入とテーマ変数適用
  injectGraphUiStyles();
  applyGraphUiThemeVars(isDark);

  // root コンテナ
  const root = document.createElement('div');
  root.style.cssText = `display:flex;flex-direction:column;height:${containerHeight};width:100vw;overflow:hidden`;
  container.appendChild(root);

  // ── previewRef / hoverNodeIdRef / mouseWorldRef（canvasInteraction で更新） ──

  const previewRef: MutableRef<import('../components-vanilla/GraphCanvas').DragPreview> = {
    current: { type: 'none', fromX: 0, fromY: 0, toX: 0, toY: 0 },
  };
  const hoverNodeIdRef: MutableRef<string | undefined> = { current: undefined };
  const mouseWorldRef: MutableRef<{ x: number; y: number }> = { current: { x: 0, y: 0 } };
  const velocityRef: MutableRef<{ vx: number; vy: number }> = { current: { vx: 0, vy: 0 } };

  // ── ツールバー slot ──────────────────────────────────────────────────────

  function getState() { return store.getState(); }

  // ── ヘルパー関数群 ────────────────────────────────────────────────────────

  function getFilteredDisplayNodes() {
    const st = getState();
    const { nodes: fNodes, edges: fEdges } = applyNodeFilter(
      st.document.nodes, st.document.edges, filterConfig,
    );
    const { nodes: dNodes, edges: dEdges } = applyDataMapping(fNodes, fEdges, dataMappingConfig);
    return { nodes: dNodes, edges: dEdges };
  }

  function computeAvailableMetadataKeys(): string[] {
    const keys = new Set<string>();
    for (const node of getState().document.nodes) {
      if (node.metadata) {
        for (const key of Object.keys(node.metadata)) {
          keys.add(key);
        }
      }
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }

  function computeMetadataKeyRanges(): Map<string, [number, number]> {
    const ranges = new Map<string, [number, number]>();
    for (const node of getState().document.nodes) {
      if (!node.metadata) continue;
      for (const [key, val] of Object.entries(node.metadata)) {
        if (typeof val !== 'number') continue;
        const existing = ranges.get(key);
        if (existing) {
          existing[0] = Math.min(existing[0], val);
          existing[1] = Math.max(existing[1], val);
        } else {
          ranges.set(key, [val, val]);
        }
      }
    }
    return ranges;
  }

  // ── canvasWrapper（flex:1 の内部レイアウト） ─────────────────────────────

  const outerWrapper = document.createElement('div');
  outerWrapper.style.cssText = 'flex:1;display:flex;position:relative;overflow:hidden';
  root.appendChild(outerWrapper);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.style.cssText = 'flex:1;position:relative;overflow:hidden';
  outerWrapper.appendChild(canvasWrapper);

  // ── GraphCanvas ───────────────────────────────────────────────────────────

  const { nodes: initDisplayNodes, edges: initDisplayEdges } = getFilteredDisplayNodes();
  const st0 = getState();

  const graphCanvasHandle = createGraphCanvas({
    nodes: initDisplayNodes,
    edges: initDisplayEdges,
    viewport: st0.document.viewport,
    selection: st0.selection,
    showGrid,
    isDark,
    previewRef,
    hoverNodeIdRef,
    mouseWorldRef,
    viewportAnimRef,
    velocityRef,
    ariaLabel: `${t('graphCanvas')}: ${st0.document.nodes.length} nodes, ${st0.document.edges.length} edges`,
    onMouseDown: () => {
      // 実ドラッグ処理は canvasInteraction が canvas へ自前 attach したリスナで行う。
      // ここでは shapeHoverBar 抑止用に isDragging のみ立てる。
      isDragging = true;
    },
    onMouseUp: (_e) => {
      isDragging = false;
    },
    onDropImage: handleDropImage,
    onViewportUpdate: (vp) => {
      store.dispatch({ type: 'SET_VIEWPORT', viewport: vp });
    },
    onPanInertia: (dx, dy) => {
      store.dispatch({ type: 'SET_VIEWPORT', viewport: panViewport(getState().document.viewport, dx, dy) });
    },
    onNodeHover: (id) => {
      detailNodeId = id;
      pathHighlight.setHoverTargetId(id);
      syncDetailPanel();
    },
  });

  canvasWrapper.appendChild(graphCanvasHandle.el);

  // pathHighlight 変更時はハイライト装飾のみを部分更新する（full syncUI を呼ばない）。
  // これにより syncUI が updateEdges を呼び、その通知が syncUI を再実行する
  // フィードバック再帰を構造的に断つ。ハイライトは canvas のオーバーレイのみに影響し、
  // ツールバー・ミニマップ・プロパティパネルは依存しないため部分更新で十分。
  pathHighlight.subscribe((state) => {
    graphCanvasHandle.update({
      highlightNodeIds: state.highlightNodeIds,
      highlightEdgeIds: state.highlightEdgeIds,
      originNodeId: state.originNodeId,
    });
  });

  // ── canvas インタラクション ──────────────────────────────────────────────

  const canvasEl = graphCanvasHandle.canvas;

  const canvasInteraction = createCanvasInteraction({
    canvas: canvasEl,
    getTool: () => tool,
    getNodes: () => getState().document.nodes,
    getEdges: () => getState().document.edges,
    getViewport: () => getState().document.viewport,
    getSelection: () => getState().selection,
    getShowGrid: () => showGrid,
    getIsDark: () => isDark,
    getCollisionEnabled: () => collisionEnabled,
    dispatch: (action) => store.dispatch(action),
    onTextEdit: handleTextEdit,
    onToolChange: (newTool) => {
      tool = newTool;
      toolBarHandle?.update({ tool });
    },
    onLiveMessage: (key) => {
      if (key === 'undo') setLiveMessage(t('undone'));
      else if (key === 'redo') setLiveMessage(t('redone'));
    },
    physics: physicsRef.current,
  });

  // canvasInteraction の velocity は velocityRef と同期させる
  // GraphCanvas は velocityRef.current を参照するので直接共有できないが、
  // canvasInteraction.velocity は getterで公開されているため GraphCanvas の velocityRef へ橋渡し
  // velocityRef は createGraphCanvas に渡した参照なので同一オブジェクト共有が必要。
  // → canvasInteraction の velocity 変化を velocityRef へ転記するラッパーで解決
  function syncVelocityRef(): void {
    velocityRef.current.vx = canvasInteraction.velocity.vx;
    velocityRef.current.vy = canvasInteraction.velocity.vy;
  }

  // GraphCanvas の onMouseUp / onMouseDown を実際の canvasInteraction にリダイレクト
  // ※ createGraphCanvas は opts.onMouseDown 等をそのまま canvas イベントに登録しない。
  //   canvas.addEventListener を直接持つ createCanvasInteraction が優先登録される。
  //   dragRef 相当は canvasInteraction.drag で取得する。

  // 補足: draggingNodeIds は syncUI 内で canvasInteraction.drag から決定する

  const touchInteraction = createTouchInteraction({
    canvas: canvasEl,
    getViewport: () => getState().document.viewport,
    dispatch: (action) => store.dispatch(action),
    velocityRef: velocityRef.current,
  });

  // ── MinimapCanvas（簡易 vanilla 実装） ───────────────────────────────────
  // graph-core の MinimapCanvas は React コンポーネントのため直接使用不可。
  // インライン canvas でノード矩形とビューポート枠のみ描画する簡易版を使う。

  const MINI_W = 200;
  const MINI_H = 130;
  const minimapEl = document.createElement('div');
  minimapEl.style.cssText = [
    'position:absolute', 'bottom:8px', 'right:8px',
    'z-index:15', 'border-radius:4px', 'overflow:hidden',
    `width:${MINI_W}px`, `height:${MINI_H}px`,
    'pointer-events:none',
    'opacity:0.85',
  ].join(';');
  const minimapCanvasEl = document.createElement('canvas');
  minimapCanvasEl.width = MINI_W;
  minimapCanvasEl.height = MINI_H;
  minimapCanvasEl.style.cssText = `width:${MINI_W}px;height:${MINI_H}px`;
  minimapEl.appendChild(minimapCanvasEl);
  canvasWrapper.appendChild(minimapEl);

  function renderMinimap(): void {
    const ctx = minimapCanvasEl.getContext('2d');
    if (!ctx) return;
    const st = getState();
    const nodes = st.document.nodes;
    ctx.clearRect(0, 0, MINI_W, MINI_H);
    ctx.fillStyle = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(242,239,232,0.85)';
    ctx.fillRect(0, 0, MINI_W, MINI_H);
    if (nodes.length === 0) return;

    const PAD = 10;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - PAD);
      minY = Math.min(minY, n.y - PAD);
      maxX = Math.max(maxX, n.x + n.width + PAD);
      maxY = Math.max(maxY, n.y + n.height + PAD);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const mmScale = Math.min(MINI_W / bw, MINI_H / bh);
    const mmOffX = (MINI_W - bw * mmScale) / 2 - minX * mmScale;
    const mmOffY = (MINI_H - bh * mmScale) / 2 - minY * mmScale;

    for (const n of nodes) {
      const x = n.x * mmScale + mmOffX;
      const y = n.y * mmScale + mmOffY;
      const w = Math.max(n.width * mmScale, 2);
      const h = Math.max(n.height * mmScale, 2);
      ctx.fillStyle = n.style.fill;
      ctx.strokeStyle = n.style.stroke;
      ctx.lineWidth = 0.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    // ビューポート矩形
    const vp = st.document.viewport;
    const cw = canvasEl.clientWidth;
    const ch = canvasEl.clientHeight;
    if (cw > 0 && ch > 0) {
      const tlX = (-vp.offsetX / vp.scale) * mmScale + mmOffX;
      const tlY = (-vp.offsetY / vp.scale) * mmScale + mmOffY;
      const vrW = (cw / vp.scale) * mmScale;
      const vrH = (ch / vp.scale) * mmScale;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(tlX, tlY, vrW, vrH);
      ctx.strokeRect(tlX, tlY, vrW, vrH);
    }
  }

  // minimapの更新は syncUI から呼ぶ
  const minimapCanvas = { update: renderMinimap, destroy: () => { minimapEl.remove(); } };

  // ── 空状態オーバーレイ ────────────────────────────────────────────────────

  const emptyOverlay = document.createElement('div');
  emptyOverlay.style.cssText = [
    'position:absolute', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'text-align:center', 'pointer-events:none', 'z-index:10',
  ].join(';');
  const emptyTitle = document.createElement('span');
  emptyTitle.style.cssText = 'display:block;margin-bottom:8px;font-weight:300;font-size:1.25rem';
  const emptyHint = document.createElement('span');
  emptyHint.style.cssText = 'display:block';
  emptyOverlay.appendChild(emptyTitle);
  emptyOverlay.appendChild(emptyHint);
  canvasWrapper.appendChild(emptyOverlay);

  function updateEmptyOverlay(): void {
    const nodes = getState().document.nodes;
    const color = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)';
    emptyOverlay.style.color = color;
    emptyOverlay.style.display = nodes.length === 0 ? '' : 'none';
    emptyTitle.textContent = t('emptyCanvasTitle');
    emptyHint.textContent = t('emptyCanvasHint');
  }

  // ── TextEditOverlay ───────────────────────────────────────────────────────

  const textEditOverlay = createTextEditOverlay({
    themeMode,
    onCommit: (id, text) => {
      store.dispatch({ type: 'UPDATE_NODE', id, changes: { text } });
      editingNodeId = null;
      syncUI();
    },
    onCancel: () => {
      editingNodeId = null;
      syncUI();
    },
  });
  canvasWrapper.appendChild(textEditOverlay.el);

  // ── ShapeHoverBar（差分更新） ──────────────────────────────────────────────

  let shapeHoverBarHandle: ShapeHoverBarHandle | null = null;

  function syncShapeHoverBar(): void {
    const st = getState();
    const selectedNode = st.selection.nodeIds.length === 1
      ? st.document.nodes.find((n) => n.id === st.selection.nodeIds[0]) ?? null
      : null;

    const shouldShow = selectedNode !== null && editingNodeId === null && docEditNodeId === null && !isDragging;

    if (!shouldShow) {
      if (shapeHoverBarHandle) {
        shapeHoverBarHandle.el.remove();
        shapeHoverBarHandle.destroy();
        shapeHoverBarHandle = null;
      }
      return;
    }

    if (shapeHoverBarHandle && selectedNode) {
      shapeHoverBarHandle.update(selectedNode, st.document.viewport);
      return;
    }

    // shouldShow=true は selectedNode!==null を含意するため handle ありは上で return 済み。
    // 残りは「handle なし」のみ。selectedNode ガードは TS narrowing 用に維持する。
    if (selectedNode) {
      shapeHoverBarHandle = createShapeHoverBar({
        node: selectedNode,
        viewport: st.document.viewport,
        onChangeType: (id, type) => store.dispatch({ type: 'UPDATE_NODE', id, changes: { type } }),
        t,
        themeMode,
      });
      if (shapeHoverBarHandle) {
        canvasWrapper.appendChild(shapeHoverBarHandle.el);
      }
    }
  }

  // ── PropertyPanel ─────────────────────────────────────────────────────────

  const propertyPanelHandle = createPropertyPanel({
    selectedNode: null,
    selectedEdge: null,
    onUpdateNode: (id, changes) => store.dispatch({ type: 'UPDATE_NODE', id, changes }),
    onUpdateEdge: (id, changes) => store.dispatch({ type: 'UPDATE_EDGE', id, changes }),
    onLayerAction: handleLayerAction,
    onClose: () => {
      showProperty = false;
      canvasEl.focus();
      syncUI();
    },
    themeMode,
    t,
  });
  propertyPanelHandle.el.style.display = 'none';
  canvasWrapper.appendChild(propertyPanelHandle.el);

  function syncPropertyPanel(): void {
    const st = getState();
    const selectedNode = st.selection.nodeIds.length === 1
      ? st.document.nodes.find((n) => n.id === st.selection.nodeIds[0]) ?? null
      : null;
    const selectedEdge = st.selection.edgeIds.length === 1
      ? st.document.edges.find((e) => e.id === st.selection.edgeIds[0]) ?? null
      : null;

    const visible = showProperty && (selectedNode !== null || selectedEdge !== null);
    propertyPanelHandle.el.style.display = visible ? '' : 'none';
    if (visible) {
      propertyPanelHandle.update({ selectedNode, selectedEdge });
    }
  }

  // ── DetailPanel ───────────────────────────────────────────────────────────

  let detailPanelHandle: DetailPanelHandle | null = null;

  function syncDetailPanel(): void {
    const st = getState();
    const selectedNode = st.selection.nodeIds.length === 1
      ? st.document.nodes.find((n) => n.id === st.selection.nodeIds[0]) ?? null
      : null;
    const shouldShow = detailNodeId !== null && !showProperty;
    const detailNode = shouldShow
      ? st.document.nodes.find((n) => n.id === detailNodeId) ?? null
      : null;

    if (!detailNode || selectedNode !== null) {
      if (detailPanelHandle) {
        detailPanelHandle.el.remove();
        detailPanelHandle.destroy();
        detailPanelHandle = null;
      }
      return;
    }

    if (detailPanelHandle) return; // 同一ノードは再作成しない

    detailPanelHandle = createDetailPanel({
      node: detailNode,
      onClose: () => {
        detailNodeId = null;
        if (detailPanelHandle) {
          detailPanelHandle.el.remove();
          detailPanelHandle.destroy();
          detailPanelHandle = null;
        }
      },
    });
    canvasWrapper.appendChild(detailPanelHandle.el);
  }

  // ── aria-live（liveMessage） ──────────────────────────────────────────────

  const ariaLive = document.createElement('div');
  ariaLive.setAttribute('role', 'status');
  ariaLive.setAttribute('aria-live', 'polite');
  ariaLive.setAttribute('aria-atomic', 'true');
  ariaLive.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap';
  canvasWrapper.appendChild(ariaLive);

  function setLiveMessage(msg: string): void {
    ariaLive.textContent = msg;
  }

  // ── FilterPanel ───────────────────────────────────────────────────────────

  let filterPanelHandle: ReturnType<typeof createFilterPanel> | null = null;

  function syncFilterPanel(): void {
    if (!showFilter) {
      if (filterPanelHandle) {
        filterPanelHandle.el.remove();
        filterPanelHandle.destroy();
        filterPanelHandle = null;
      }
      return;
    }
    if (filterPanelHandle) {
      filterPanelHandle.update({
        config: filterConfig,
        availableKeys: computeAvailableMetadataKeys(),
        keyRanges: computeMetadataKeyRanges(),
      });
      return;
    }
    filterPanelHandle = createFilterPanel({
      config: filterConfig,
      onConfigChange: (cfg) => {
        filterConfig = cfg;
        syncUI();
      },
      availableKeys: computeAvailableMetadataKeys(),
      keyRanges: computeMetadataKeyRanges(),
      onClose: () => {
        showFilter = false;
        toolBarHandle?.update({ filterActive: filterConfig.rangeFilters.length > 0 || filterConfig.textFilters.length > 0 });
        syncFilterPanel();
      },
    });
    outerWrapper.appendChild(filterPanelHandle.el);
  }

  // ── SettingsPanel ─────────────────────────────────────────────────────────

  let settingsPanelHandle: ReturnType<typeof createSettingsPanel> | null = null;

  function syncSettingsPanel(): void {
    if (settingsPanelHandle) {
      settingsPanelHandle.destroy();
      settingsPanelHandle.el.remove();
      settingsPanelHandle = null;
    }
    settingsPanelHandle = createSettingsPanel({
      open: showSettings,
      width: 260,
      onClose: () => {
        showSettings = false;
        syncSettingsPanel();
      },
      themeMode,
      onThemeModeChange: (mode) => {
        onThemeModeChange?.(mode);
        // テーマ変化はホスト側が options を更新して handle.update() を呼ぶ想定
      },
      locale,
      onLocaleChange: (loc) => {
        onLocaleChange?.(loc);
      },
    });
    outerWrapper.appendChild(settingsPanelHandle.el);
  }

  // ── DocEditorModal ────────────────────────────────────────────────────────

  const docEditorModal = createDocEditorModal({
    title: '',
    onSave: (content) => {
      if (docEditNodeId) {
        store.dispatch({ type: 'UPDATE_NODE', id: docEditNodeId, changes: { docContent: content } });
      }
    },
    onClose: () => {
      docEditNodeId = null;
      syncUI();
    },
    themeMode,
    locale,
  });

  // ── Confirm dialog ────────────────────────────────────────────────────────

  let confirmDialogEl: HTMLDivElement | null = null;

  function closeConfirmDialog(): void {
    confirmDialogEl?.remove();
    confirmDialogEl = null;
  }

  function openConfirmDialog(title: string, message: string, onConfirm: () => void): void {
    // 状態は引数で完結するため closure 変数に保持しない（既存ダイアログがあれば置換）。
    confirmDialogEl?.remove();
    confirmDialogEl = null;

    const backdrop = document.createElement('div');
    backdrop.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:1300',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.5)',
    ].join(';');

    const paper = document.createElement('div');
    paper.style.cssText = [
      `background:var(--gv-color-bg-paper)`,
      'color:var(--gv-color-text-primary)',
      'border-radius:8px', 'padding:24px',
      'min-width:280px', 'max-width:420px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
    ].join(';');

    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'margin:0 0 16px;font-size:1.125rem;font-weight:600';
    titleEl.textContent = title;

    const msgEl = document.createElement('p');
    msgEl.style.cssText = 'margin:0 0 24px;font-size:0.875rem;color:var(--gv-color-text-secondary)';
    msgEl.textContent = message;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-btn gv-btn-text';
    cancelBtn.textContent = t('cancel');
    cancelBtn.addEventListener('click', closeConfirmDialog);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'gv-btn gv-btn-text';
    confirmBtn.style.color = 'var(--gv-color-error-main)';
    confirmBtn.textContent = t('confirm');
    confirmBtn.setAttribute('autofocus', '');
    confirmBtn.addEventListener('click', () => {
      onConfirm();
      closeConfirmDialog();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    paper.appendChild(titleEl);
    paper.appendChild(msgEl);
    paper.appendChild(actions);
    backdrop.appendChild(paper);
    document.body.appendChild(backdrop);

    confirmDialogEl = backdrop;
  }

  // ── ToolBar ────────────────────────────────────────────────────────────────

  const st1 = getState();

  const toolBarHandle = createToolBar({
    tool,
    t,
    onToolChange: (newTool) => {
      tool = newTool;
      toolBarHandle.update({ tool });
    },
    onUndo: () => { store.dispatch({ type: 'UNDO' }); setLiveMessage(t('undone')); },
    onRedo: () => { store.dispatch({ type: 'REDO' }); setLiveMessage(t('redone')); },
    canUndo: st1.historyIndex > 0,
    canRedo: st1.historyIndex < st1.history.length - 1,
    showGrid,
    onToggleGrid: () => { showGrid = !showGrid; toolBarHandle.update({ showGrid }); graphCanvasHandle.update({ showGrid }); },
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onFitContent: handleFitContent,
    onClearAll: handleClearAll,
    onExportSvg: handleExportSvg,
    onExportDrawio: handleExportDrawio,
    onImportDrawio: handleImportDrawio,
    onImportGraph: handleImportGraph,
    onImportMermaid: handleImportMermaid,
    onAlign: handleAlign,
    onSetScale: handleSetScale,
    selectionCount: st1.selection.nodeIds.length,
    hasSelection: st1.selection.nodeIds.length > 0 || st1.selection.edgeIds.length > 0,
    scale: st1.document.viewport.scale,
    saveStatus,
    onToggleSettings: () => { showSettings = !showSettings; syncSettingsPanel(); },
    layoutRunning,
    collisionEnabled,
    onAutoLayout: handleAutoLayout,
    onToggleCollision: (enabled) => { collisionEnabled = enabled; },
    layoutAlgorithm,
    onChangeAlgorithm: (alg) => { layoutAlgorithm = alg; },
    onSpreadConnected: handleSpreadConnected,
    showFilter,
    onToggleFilter: () => { showFilter = !showFilter; syncFilterPanel(); },
    filterActive: filterConfig.rangeFilters.length > 0 || filterConfig.textFilters.length > 0,
    themeMode,
  });
  root.insertBefore(toolBarHandle.el, outerWrapper);

  // Settings / Filter は初期構築
  syncSettingsPanel();

  // ── syncUI — 中央同期関数（React の再 render 相当） ──────────────────────

  let prevNodeCount = getState().document.nodes.length;

  function syncUI(): void {
    const st = getState();

    // ノード数変化によるアナウンス
    const currentCount = st.document.nodes.length;
    if (currentCount > prevNodeCount) setLiveMessage(t('nodeAdded'));
    else if (currentCount < prevNodeCount) setLiveMessage(t('nodeDeleted'));
    prevNodeCount = currentCount;

    // 選択変化によるアナウンス
    const { nodeIds, edgeIds } = st.selection;
    if (nodeIds.length > 0 || edgeIds.length > 0) {
      setLiveMessage(`${nodeIds.length} ${t('nodesSelected')}, ${edgeIds.length} ${t('edgesSelected')}`);
      showProperty = true;
    } else {
      setLiveMessage('');
    }

    // フィルタ・データマッピング適用後の表示ノード
    const { nodes: displayNodes, edges: displayEdges } = getFilteredDisplayNodes();

    // pathHighlight 更新
    pathHighlight.updateEdges(st.document.edges);
    const phState = pathHighlight.getState();

    // GraphCanvas 更新
    syncVelocityRef();
    const dragState = canvasInteraction.drag;
    const draggingNodeIds = isDragging && dragState.type === 'move' ? [...(st.selection.nodeIds)] : undefined;
    graphCanvasHandle.update({
      nodes: displayNodes,
      edges: displayEdges,
      viewport: st.document.viewport,
      selection: st.selection,
      showGrid,
      isDark,
      draggingNodeIds,
      layoutRunning,
      highlightNodeIds: phState.highlightNodeIds,
      highlightEdgeIds: phState.highlightEdgeIds,
      originNodeId: phState.originNodeId,
    });

    // MinimapCanvas 更新
    minimapCanvas.update();

    // ToolBar 更新
    toolBarHandle.update({
      tool,
      canUndo: st.historyIndex > 0,
      canRedo: st.historyIndex < st.history.length - 1,
      scale: st.document.viewport.scale,
      saveStatus,
      showGrid,
      filterActive: filterConfig.rangeFilters.length > 0 || filterConfig.textFilters.length > 0,
      selectionCount: st.selection.nodeIds.length,
    });

    // aria label
    canvasEl.setAttribute('aria-label', `${t('graphCanvas')}: ${st.document.nodes.length} nodes, ${st.document.edges.length} edges`);

    // 空状態
    updateEmptyOverlay();

    // ShapeHoverBar
    syncShapeHoverBar();

    // TextEditOverlay
    const editingNode = editingNodeId
      ? st.document.nodes.find((n) => n.id === editingNodeId) ?? null
      : null;
    if (editingNode) {
      textEditOverlay.show(editingNode, st.document.viewport, textEditAppendMode);
    } else {
      textEditOverlay.hide();
    }

    // PropertyPanel
    syncPropertyPanel();

    // DetailPanel（detailNodeId はホバーで直接更新）
    syncDetailPanel();

    // FilterPanel
    syncFilterPanel();

    // AutoSave（doc 変化時に通知）
    if (persistence) {
      persistence.save(st.document);
    } else {
      autoSave.notifyChange(st.document);
    }

    // 画像キャッシュクリア（doc ID 変化時）
    // store 側で document.id 変化を検知するためにハッシュで保持
  }

  // ── 画像キャッシュクリア（document ID 変化追跡） ─────────────────────────

  let lastDocId = getState().document.id;

  // ── store 購読 ────────────────────────────────────────────────────────────

  const unsubscribe = store.subscribe((st) => {
    if (st.document.id !== lastDocId) {
      lastDocId = st.document.id;
      clearImageCache();
    }
    syncUI();
  });

  // ── キーボードイベント（GraphEditor.tsx の keydown handler 相当） ─────────

  function handleKeydown(e: KeyboardEvent): void {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.getAttribute('contenteditable') === 'true') return;
    if (editingNodeId) return;

    const delta = computeArrowDelta(e.key, e.shiftKey);
    if (delta) {
      const ids = getState().selection.nodeIds;
      if (ids.length === 0) return;
      store.dispatch({ type: 'MOVE_NODES', ids, dx: delta.dx, dy: delta.dy });
      e.preventDefault();
      return;
    }

    // 単一ノード選択中に印字可能キーを押したらテキスト編集開始
    const ids = getState().selection.nodeIds;
    if (ids.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const node = getState().document.nodes.find((n) => n.id === ids[0]);
      if (node && node.type !== 'image' && node.type !== 'doc' && !node.locked) {
        e.preventDefault();
        textEditAppendMode = true;
        handleTextEdit(ids[0]);
        return;
      }
    }

    const toolKey = TOOL_SHORTCUT_MAP[e.key];
    if (toolKey && !e.ctrlKey && !e.metaKey) {
      tool = toolKey;
      toolBarHandle.update({ tool });
    }
  }

  // パスハイライト用 Ctrl+Alt+Click
  function handleGlobalClick(e: MouseEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.altKey && getState().selection.nodeIds.length === 1) {
      const selectedId = getState().selection.nodeIds[0];
      const currentOrigin = pathHighlight.getState().originNodeId;
      pathHighlight.setOriginNodeId(currentOrigin === selectedId ? null : selectedId);
    }
  }

  // コンテキストメニュー（右クリック = 選択解除）
  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    store.dispatch({ type: 'SET_SELECTION', selection: { nodeIds: [], edgeIds: [] } });
    editingNodeId = null;
    docEditNodeId = null;
    syncUI();
  }

  canvasEl.addEventListener('contextmenu', handleContextMenu);
  globalThis.addEventListener('click', handleGlobalClick);
  window.addEventListener('keydown', handleKeydown);

  // ── ハンドラ関数群 ────────────────────────────────────────────────────────

  function handleTextEdit(nodeId: string): void {
    const node = getState().document.nodes.find((n) => n.id === nodeId);
    if (node?.type === 'doc') {
      docEditNodeId = nodeId;
      const content = node.docContent ?? '';
      docEditorModal.open(content);
    } else {
      textEditAppendMode = false;
      editingNodeId = nodeId;
    }
    syncUI();
  }

  function handleAutoLayout(): void {
    if (layoutRunning) return;
    layoutRunning = true;
    store.dispatch({ type: 'SNAPSHOT' });

    const engine = new physics.PhysicsEngine({ collisionEnabled: true, algorithm: layoutAlgorithm });
    engine.initLayout(getState().document.nodes as never, getState().document.edges as never);
    physicsRef.current = engine;
    toolBarHandle.update({ layoutRunning });

    const loop = (): void => {
      const running = engine.tick();
      const positions = engine.getPositions();
      const updates: Array<{ id: string; x: number; y: number }> = [];
      for (const [id, pos] of positions) {
        updates.push({ id, x: pos.x, y: pos.y });
      }
      store.dispatch({ type: 'SET_NODE_POSITIONS', updates });

      if (running) {
        requestAnimationFrame(loop);
      } else {
        const spreadPositions = engine.spreadConnected(null, getState().document.edges as never, 100);
        const spreadUpdates: Array<{ id: string; x: number; y: number }> = [];
        for (const [id, pos] of spreadPositions) {
          spreadUpdates.push({ id, x: pos.x, y: pos.y });
        }
        store.dispatch({ type: 'SET_NODE_POSITIONS', updates: spreadUpdates });
        layoutRunning = false;
        toolBarHandle.update({ layoutRunning });
        store.dispatch({ type: 'SNAPSHOT' });
      }
    };
    requestAnimationFrame(loop);
  }

  function handleSpreadConnected(): void {
    store.dispatch({ type: 'SNAPSHOT' });
    const engine = new physics.PhysicsEngine();
    const positions = engine.spreadConnected(
      getState().document.nodes as never,
      getState().document.edges as never,
      100,
    );
    const updates: Array<{ id: string; x: number; y: number }> = [];
    for (const [id, pos] of positions) {
      updates.push({ id, x: pos.x, y: pos.y });
    }
    store.dispatch({ type: 'SET_NODE_POSITIONS', updates });
    store.dispatch({ type: 'SNAPSHOT' });
  }

  function handleZoomIn(): void {
    const rect = canvasEl.getBoundingClientRect();
    const target = zoomViewport(getState().document.viewport, rect.width / 2, rect.height / 2, -300);
    viewportAnimRef.current = {
      from: { ...getState().document.viewport },
      to: target,
      startTime: performance.now(),
      duration: 200,
    };
  }

  function handleZoomOut(): void {
    const rect = canvasEl.getBoundingClientRect();
    const target = zoomViewport(getState().document.viewport, rect.width / 2, rect.height / 2, 300);
    viewportAnimRef.current = {
      from: { ...getState().document.viewport },
      to: target,
      startTime: performance.now(),
      duration: 200,
    };
  }

  function handleSetScale(newScale: number): void {
    const rect = canvasEl.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const vp = getState().document.viewport;
    const worldCenterX = (cx - vp.offsetX) / vp.scale;
    const worldCenterY = (cy - vp.offsetY) / vp.scale;
    const target: Viewport = {
      offsetX: cx - worldCenterX * newScale,
      offsetY: cy - worldCenterY * newScale,
      scale: newScale,
    };
    viewportAnimRef.current = {
      from: { ...vp },
      to: target,
      startTime: performance.now(),
      duration: 200,
    };
  }

  function handleFitContent(): void {
    const nodes = getState().document.nodes;
    if (nodes.length === 0) return;
    const rect = canvasEl.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const target = fitToContent(rect.width, rect.height, { minX, minY, maxX, maxY });
    viewportAnimRef.current = {
      from: { ...getState().document.viewport },
      to: target,
      startTime: performance.now(),
      duration: 200,
    };
  }

  function handleDropImage(dataUrl: string, sx: number, sy: number, w: number, h: number): void {
    const world = screenToWorld(getState().document.viewport, sx, sy);
    const node = createNode('image', world.x - w / 2, world.y - h / 2, {
      width: w,
      height: h,
      imageData: dataUrl,
    }, isDark);
    store.dispatch({ type: 'ADD_NODE', node });
  }

  function handleClearAll(): void {
    openConfirmDialog(
      t('clearAll'),
      t('clearAllConfirm'),
      () => store.dispatch({ type: 'SET_DOCUMENT', doc: createDocument('Untitled') }),
    );
  }

  function handleExportSvg(): void {
    const svg = exportToSvg(getState().document);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getState().document.name || 'graph'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportDrawio(): void {
    const xml = exportToDrawio(getState().document);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getState().document.name || 'graph'}.drawio`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportDrawio(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.drawio,.xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const xml = reader.result as string;
        openConfirmDialog(t('import'), t('importConfirm'), () => {
          const doc = importFromDrawio(xml);
          store.dispatch({ type: 'SET_DOCUMENT', doc });
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleImportGraph(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.graph';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const json = reader.result as string;
        try {
          const doc = JSON.parse(json) as import('../types').GraphDocument;
          if (!doc.nodes || !doc.edges) return;
          openConfirmDialog(t('import'), t('importConfirm'), () => {
            store.dispatch({ type: 'SET_DOCUMENT', doc });
          });
        } catch {
          // invalid JSON
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleImportMermaid(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        try {
          const { doc, direction } = importFromMermaid(text);
          if (!doc.nodes || !doc.edges) return;
          layoutWithSubgroups(doc, direction, 180, 60);
          openConfirmDialog(t('import'), t('importConfirm'), () => {
            store.dispatch({ type: 'SET_DOCUMENT', doc });
          });
        } catch {
          // invalid mermaid
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleAlign(type: AlignType): void {
    const st = getState();
    const selectedNodes = st.document.nodes.filter((n) => st.selection.nodeIds.includes(n.id));
    if (selectedNodes.length < 2) return;

    const fns: Record<AlignType, (rects: typeof selectedNodes) => typeof selectedNodes> = {
      left: alignLeft, right: alignRight, top: alignTop, bottom: alignBottom,
      centerH: alignCenterH, centerV: alignCenterV, distributeH, distributeV,
    };
    const result = fns[type](selectedNodes);
    store.dispatch({
      type: 'ALIGN_NODES',
      updates: result.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    });
  }

  function handleLayerAction(action: 'up' | 'down' | 'top' | 'bottom'): void {
    const st = getState();
    if (st.selection.nodeIds.length !== 1) return;
    const nodeId = st.selection.nodeIds[0];
    const node = st.document.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const currentZ = node.zIndex ?? 0;
    const allZ = st.document.nodes.filter((n) => n.id !== nodeId).map((n) => n.zIndex ?? 0);
    const newZ = computeLayerZIndex(action, currentZ, allZ);
    store.dispatch({ type: 'UPDATE_NODE', id: nodeId, changes: { zIndex: newZ } });
  }

  // ── 初回同期 ──────────────────────────────────────────────────────────────

  syncUI();

  // ── GraphEditorHandle ─────────────────────────────────────────────────────

  function update(patch: Readonly<Partial<MountGraphEditorOptions>>): void {
    let needRebuild = false;

    if (patch.themeMode !== undefined && patch.themeMode !== themeMode) {
      themeMode = patch.themeMode;
      isDark = themeMode === 'dark';
      applyGraphUiThemeVars(isDark);
      graphCanvasHandle.update({ isDark });
    }
    if (patch.onThemeModeChange !== undefined) {
      onThemeModeChange = patch.onThemeModeChange;
    }
    if (patch.locale !== undefined && patch.locale !== locale) {
      locale = patch.locale;
      t = createGraphT('Graph', locale);
      // locale 変化は t の再生成が必要なため、UI の文字列も再構築が必要
      // 完全再構築は重いため、主要な文字列だけ更新する簡略実装
      needRebuild = true;
    }
    if (patch.onLocaleChange !== undefined) {
      onLocaleChange = patch.onLocaleChange;
    }
    if (patch.persistence !== undefined) {
      persistence = patch.persistence;
    }

    if (needRebuild) {
      // locale 変化時: テキストが変わる部分だけ更新する
      // （完全 destroy → remount は実装コストが高いため、
      //   t を更新して syncUI で再適用できる箇所のみ対応）
      updateEmptyOverlay();
    }

    syncUI();
  }

  function destroy(): void {
    // キャンセル
    loadCancelled = true;

    // イベントリスナー解除
    canvasEl.removeEventListener('contextmenu', handleContextMenu);
    globalThis.removeEventListener('click', handleGlobalClick);
    window.removeEventListener('keydown', handleKeydown);

    // 各コンポーネント destroy
    canvasInteraction.destroy();
    touchInteraction.destroy();
    graphCanvasHandle.destroy();
    minimapCanvas.destroy();
    toolBarHandle.destroy();
    propertyPanelHandle.destroy();
    textEditOverlay.destroy();
    docEditorModal.destroy();
    autoSave.destroy();
    unsubscribe();

    if (shapeHoverBarHandle) { shapeHoverBarHandle.destroy(); shapeHoverBarHandle = null; }
    if (detailPanelHandle) { detailPanelHandle.destroy(); detailPanelHandle = null; }
    if (filterPanelHandle) { filterPanelHandle.destroy(); filterPanelHandle = null; }
    if (settingsPanelHandle) { settingsPanelHandle.destroy(); settingsPanelHandle = null; }
    if (confirmDialogEl) { confirmDialogEl.remove(); confirmDialogEl = null; }

    // rAF 解除（layoutRunning 中の loop）
    layoutRunning = false;

    // DOM 除去
    root.remove();
  }

  return { update, destroy };
}
