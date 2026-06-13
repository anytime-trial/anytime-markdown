/**
 * graph-viewer vanilla GraphCanvas ファクトリ。
 *
 * React 版 `components/GraphCanvas.tsx` の vanilla 移植。
 * rAF ループで canvas に描画し、DPR リサイズ・慣性スクロール・
 * reduced-motion 対応を closure 変数で管理する。
 *
 * ## 使い方
 * ```ts
 * const handle = createGraphCanvas({
 *   nodes, edges, viewport, selection, showGrid, isDark,
 *   previewRef, hoverNodeIdRef, mouseWorldRef,
 *   onMouseDown, onMouseMove, onMouseUp, onWheel, onDoubleClick, onContextMenu,
 * });
 * container.appendChild(handle.el);
 * // ...
 * handle.update({ nodes, edges, viewport, isDark });
 * // ...
 * handle.destroy();
 * ```
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import type { GraphEdge, GraphNode, SelectionState, Viewport } from '@anytime-markdown/graph-core';
import type { ViewportAnimation } from '@anytime-markdown/graph-core/engine';
import {
  drawEdgePreview,
  drawSelectionRect,
  drawShapePreview,
  drawSmartGuides,
  drawSnapHighlight,
  interpolateViewport,
  render,
  resolveEdgesForRender,
} from '@anytime-markdown/graph-core/engine';
import type { GuideLine } from '@anytime-markdown/graph-core/engine';

// ── ローカル型（React.RefObject を使わない MutableRef 相当） ──

/** 外部から書き換えられる mutable ref 相当。current のみ持つ。 */
export interface MutableRef<T> {
  current: T;
}

/** DragPreview — useCanvasInteraction.ts から型定義を複製（React 依存なし版） */
export interface DragPreview {
  type: 'none' | 'edge' | 'shape' | 'select-rect';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  shapeType?: 'rect' | 'ellipse' | 'sticky' | 'text' | 'diamond' | 'parallelogram' | 'cylinder' | 'doc' | 'frame';
  edgeType?: 'line' | 'connector';
  /** ドラッグ中にスナップしているノードID */
  snapNodeId?: string;
  /** スマートガイドライン */
  guides?: GuideLine[];
}

// ── createGraphCanvas のオプション型 ──

export interface GraphCanvasOpts {
  // ── 描画入力（update(patch) で更新可能） ──
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  viewport: Viewport;
  selection: SelectionState;
  showGrid: boolean;
  isDark?: boolean;
  draggingNodeIds?: string[];
  layoutRunning?: boolean;
  highlightNodeIds?: ReadonlySet<string>;
  highlightEdgeIds?: ReadonlySet<string>;
  originNodeId?: string | null;

  // ── Ref 経由でフレームごとに参照する描画入力 ──
  /** DragPreview ref — 毎フレーム .current を参照 */
  previewRef: MutableRef<DragPreview>;
  /** ホバー中のノードID ref — 毎フレーム .current を参照 */
  hoverNodeIdRef: MutableRef<string | undefined>;
  /** マウスのワールド座標 ref — 毎フレーム .current を参照 */
  mouseWorldRef: MutableRef<{ x: number; y: number }>;
  /** viewport アニメーション ref（補間描画用） */
  viewportAnimRef?: MutableRef<ViewportAnimation | null>;
  /** 慣性スクロール速度 ref */
  velocityRef?: MutableRef<{ vx: number; vy: number }>;

  // ── イベントコールバック ──
  onMouseDown?: (e: MouseEvent) => void;
  onMouseMove?: (e: MouseEvent) => void;
  onMouseUp?: (e: MouseEvent) => void;
  onWheel?: (e: WheelEvent) => void;
  onDoubleClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onDropImage?: (dataUrl: string, x: number, y: number, width: number, height: number) => void;
  /** viewport 補間中に毎フレーム呼ばれる */
  onViewportUpdate?: (viewport: Viewport) => void;
  /** 慣性スクロール dx/dy を親に委譲 */
  onPanInertia?: (dx: number, dy: number) => void;
  /** ホバーノードが変化したときに呼ばれる */
  onNodeHover?: (nodeId: string | null) => void;

  // ── アクセシビリティ ──
  ariaLabel?: string;
}

/** update(patch) で渡せるフィールド */
export type GraphCanvasPatch = Partial<Pick<GraphCanvasOpts,
  | 'nodes'
  | 'edges'
  | 'viewport'
  | 'selection'
  | 'showGrid'
  | 'isDark'
  | 'draggingNodeIds'
  | 'layoutRunning'
  | 'highlightNodeIds'
  | 'highlightEdgeIds'
  | 'originNodeId'
>>;

// ── handle 型 ──

export interface GraphCanvasHandle {
  /** 生成した canvas 要素。ホスト側で interaction を attach できる */
  readonly canvas: HTMLCanvasElement;
  /** canvas をラップするコンテナ（必要に応じて container.appendChild に使用） */
  readonly el: HTMLElement;
  /** 描画入力を部分更新する。次フレームに反映される */
  update(patch: GraphCanvasPatch): void;
  /** rAF ループ・ResizeObserver・イベントリスナーをすべて解除し DOM から除去する */
  destroy(): void;
}

// ── ローカルヘルパー描画関数（GraphCanvas.tsx から移植） ──

/** パスハイライト描画（暗化 + ハイライトエッジ + オリジンマーカー） */
function drawPathHighlight(
  ctx: CanvasRenderingContext2D,
  nodes: readonly GraphNode[],
  resolvedEdges: readonly GraphEdge[],
  activeViewport: Viewport,
  highlightNodeIds: ReadonlySet<string>,
  highlightEdgeIds: ReadonlySet<string> | undefined,
  originNodeId: string | null | undefined,
): void {
  ctx.save();
  ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
  ctx.scale(activeViewport.scale, activeViewport.scale);

  for (const node of nodes) {
    if (!highlightNodeIds.has(node.id)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
  }

  if (highlightEdgeIds) {
    drawHighlightEdges(ctx, resolvedEdges, highlightEdgeIds);
  }

  if (originNodeId) {
    drawOriginNodeMarker(ctx, nodes, originNodeId);
  }

  ctx.restore();
}

/** ハイライトエッジを太い金色で描画 */
function drawHighlightEdges(
  ctx: CanvasRenderingContext2D,
  resolvedEdges: readonly GraphEdge[],
  highlightEdgeIds: ReadonlySet<string>,
): void {
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.8;
  for (const edge of resolvedEdges) {
    if (!highlightEdgeIds.has(edge.id)) continue;
    ctx.beginPath();
    if (edge.waypoints && edge.waypoints.length >= 2) {
      ctx.moveTo(edge.waypoints[0].x, edge.waypoints[0].y);
      for (let i = 1; i < edge.waypoints.length; i++) {
        ctx.lineTo(edge.waypoints[i].x, edge.waypoints[i].y);
      }
    } else if (edge.bezierPath?.length === 4) {
      const [s, c1, c2, end] = edge.bezierPath;
      ctx.moveTo(s.x, s.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    } else {
      ctx.moveTo(edge.from.x, edge.from.y);
      ctx.lineTo(edge.to.x, edge.to.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** オリジンノードマーカー描画 */
function drawOriginNodeMarker(
  ctx: CanvasRenderingContext2D,
  nodes: readonly GraphNode[],
  originNodeId: string,
): void {
  const originNode = nodes.find(n => n.id === originNodeId);
  if (!originNode) return;
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(originNode.x - 4, originNode.y - 4, originNode.width + 8, originNode.height + 8);
  ctx.setLineDash([]);
}

/** ドラッグプレビュー描画 */
function drawDragPreview(
  ctx: CanvasRenderingContext2D,
  preview: DragPreview,
  activeViewport: Viewport,
  nodes: readonly GraphNode[],
  isDark: boolean,
): void {
  const colors = getCanvasColors(isDark);
  ctx.save();
  ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
  ctx.scale(activeViewport.scale, activeViewport.scale);
  if (preview.type === 'edge' && preview.edgeType) {
    if (preview.snapNodeId) {
      const snapNode = nodes.find(n => n.id === preview.snapNodeId);
      if (snapNode) drawSnapHighlight(ctx, snapNode, colors);
    }
    const isValidTarget = !!preview.snapNodeId;
    drawEdgePreview(ctx, { fromX: preview.fromX, fromY: preview.fromY, toX: preview.toX, toY: preview.toY }, preview.edgeType, isValidTarget, colors);
  } else if (preview.type === 'shape' && preview.shapeType) {
    drawShapePreview(ctx, preview.fromX, preview.fromY, preview.toX, preview.toY, preview.shapeType, colors);
  } else if (preview.type === 'select-rect') {
    const x = Math.min(preview.fromX, preview.toX);
    const y = Math.min(preview.fromY, preview.toY);
    const w = Math.abs(preview.toX - preview.fromX);
    const h = Math.abs(preview.toY - preview.fromY);
    drawSelectionRect(ctx, x, y, w, h, colors);
  }
  ctx.restore();
}

// ── ファクトリ本体 ──

/**
 * GraphCanvas vanilla ファクトリ。
 * rAF ループで canvas を描画し、DPR リサイズ・慣性スクロール・reduced-motion を管理する。
 */
export function createGraphCanvas(opts: Readonly<GraphCanvasOpts>): GraphCanvasHandle {
  // ── closure 変数（描画状態） ──
  let nodes = opts.nodes;
  let edges = opts.edges;
  let viewport = opts.viewport;
  let selection = opts.selection;
  let showGrid = opts.showGrid;
  let isDark = opts.isDark ?? true;
  let draggingNodeIds = opts.draggingNodeIds;
  let layoutRunning = opts.layoutRunning;
  let highlightNodeIds = opts.highlightNodeIds;
  let highlightEdgeIds = opts.highlightEdgeIds;
  let originNodeId = opts.originNodeId;

  // resolvedEdges は nodes/edges/layoutRunning 変化時に再計算
  let resolvedEdges: readonly GraphEdge[] = resolveEdgesForRender(nodes, edges, { layoutRunning });

  // ── closure 変数（内部状態） ──
  let rafId = 0;
  let prevHoverId: string | undefined = undefined;
  let prefersReducedMotion = false;
  let destroyed = false;

  // ── DOM 生成 ──
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  if (opts.ariaLabel) canvas.setAttribute('aria-label', opts.ariaLabel);
  canvas.setAttribute('aria-roledescription', 'graph canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';

  const el = document.createElement('div');
  el.style.cssText = 'width:100%;height:100%;position:relative';
  el.appendChild(canvas);

  // ── クリーンアップ関数リスト（destroy 時に一括実行） ──
  const cleanupFns: (() => void)[] = [];

  // ── reduced-motion 監視 ──
  const mq = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  if (mq) {
    prefersReducedMotion = mq.matches;
    const mqHandler = (e: MediaQueryListEvent): void => {
      prefersReducedMotion = e.matches;
    };
    mq.addEventListener('change', mqHandler);
    cleanupFns.push(() => mq.removeEventListener('change', mqHandler));
  }

  // ── イベントリスナー登録 ──

  function addListener<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    canvas.addEventListener(type, handler as EventListener, options);
    cleanupFns.push(() => canvas.removeEventListener(type, handler as EventListener, options));
  }

  if (opts.onMouseDown) addListener('mousedown', opts.onMouseDown);
  if (opts.onMouseMove) addListener('mousemove', opts.onMouseMove);
  if (opts.onMouseUp) addListener('mouseup', opts.onMouseUp);
  if (opts.onWheel) addListener('wheel', opts.onWheel, { passive: false });
  if (opts.onDoubleClick) addListener('dblclick', opts.onDoubleClick);
  if (opts.onContextMenu) addListener('contextmenu', opts.onContextMenu);

  // ドラッグ&ドロップ（画像）
  addListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  addListener('drop', (e: DragEvent) => {
    e.preventDefault();
    if (!opts.onDropImage || !e.dataTransfer) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const maxW = 300;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const w = img.width * scale;
          const h = img.height * scale;
          opts.onDropImage!(dataUrl, sx, sy, w, h);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  });

  // ── ResizeObserver でキャンバスサイズを親に合わせる ──
  function applyResize(): void {
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parent.clientWidth * dpr;
    canvas.height = parent.clientHeight * dpr;
    canvas.style.width = `${parent.clientWidth}px`;
    canvas.style.height = `${parent.clientHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  // 初回適用
  applyResize();

  const resizeObserver = new ResizeObserver(() => applyResize());
  resizeObserver.observe(el);
  cleanupFns.push(() => resizeObserver.disconnect());

  // window.resize も購読（元 .tsx に合わせて）
  const windowResizeHandler = (): void => applyResize();
  window.addEventListener('resize', windowResizeHandler);
  cleanupFns.push(() => window.removeEventListener('resize', windowResizeHandler));

  // ── rAF ループ ──
  function renderFrame(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // アニメーション中なら補間した viewport を使用
    let activeViewport = viewport;
    const anim = opts.viewportAnimRef?.current ?? null;
    if (anim) {
      const { viewport: interpolated, done } = interpolateViewport(anim, performance.now());
      activeViewport = interpolated;
      opts.onViewportUpdate?.(interpolated);
      if (done && opts.viewportAnimRef) {
        opts.viewportAnimRef.current = null;
      }
    }

    // 慣性スクロール（reduced-motion 時は即停止）
    if (opts.velocityRef && opts.onPanInertia) {
      const vel = opts.velocityRef.current;
      if (prefersReducedMotion) {
        vel.vx = 0;
        vel.vy = 0;
      } else if (Math.abs(vel.vx) > 0.5 || Math.abs(vel.vy) > 0.5) {
        opts.onPanInertia(vel.vx, vel.vy);
        vel.vx *= 0.92;
        vel.vy *= 0.92;
        if (Math.abs(vel.vx) < 0.5) vel.vx = 0;
        if (Math.abs(vel.vy) < 0.5) vel.vy = 0;
      }
    }

    render({
      ctx,
      width: canvas.width,
      height: canvas.height,
      nodes,
      edges: resolvedEdges,
      viewport: activeViewport,
      selection,
      showGrid,
      hoverNodeId: opts.hoverNodeIdRef.current,
      mouseWorldX: opts.mouseWorldRef.current.x,
      mouseWorldY: opts.mouseWorldRef.current.y,
      draggingNodeIds,
      isDark,
    });

    // ホバーノード変更時にコールバック通知
    if (opts.onNodeHover) {
      const currentHover = opts.hoverNodeIdRef.current;
      if (currentHover !== prevHoverId) {
        prevHoverId = currentHover;
        opts.onNodeHover(currentHover ?? null);
      }
    }

    // パスハイライト描画
    if (highlightNodeIds && highlightNodeIds.size > 0) {
      drawPathHighlight(ctx, nodes, resolvedEdges, activeViewport, highlightNodeIds, highlightEdgeIds, originNodeId);
    }

    // ドラッグプレビュー描画
    const preview = opts.previewRef.current;
    if (preview.type !== 'none') {
      drawDragPreview(ctx, preview, activeViewport, nodes, isDark);
    }

    // スマートガイド描画
    if (preview.guides && preview.guides.length > 0) {
      ctx.save();
      ctx.translate(activeViewport.offsetX, activeViewport.offsetY);
      ctx.scale(activeViewport.scale, activeViewport.scale);
      drawSmartGuides(ctx, preview.guides, getCanvasColors(isDark));
      ctx.restore();
    }
  }

  function rafLoop(): void {
    if (destroyed) return;
    renderFrame();
    rafId = requestAnimationFrame(rafLoop);
  }

  rafId = requestAnimationFrame(rafLoop);

  // ── handle ──

  function update(patch: GraphCanvasPatch): void {
    let edgesChanged = false;

    if (patch.nodes !== undefined) { nodes = patch.nodes; edgesChanged = true; }
    if (patch.edges !== undefined) { edges = patch.edges; edgesChanged = true; }
    if (patch.layoutRunning !== undefined) { layoutRunning = patch.layoutRunning; edgesChanged = true; }
    if (patch.viewport !== undefined) viewport = patch.viewport;
    if (patch.selection !== undefined) selection = patch.selection;
    if (patch.showGrid !== undefined) showGrid = patch.showGrid;
    if (patch.isDark !== undefined) isDark = patch.isDark;
    if (patch.draggingNodeIds !== undefined) draggingNodeIds = patch.draggingNodeIds;
    if (patch.highlightNodeIds !== undefined) highlightNodeIds = patch.highlightNodeIds;
    if (patch.highlightEdgeIds !== undefined) highlightEdgeIds = patch.highlightEdgeIds;
    if (patch.originNodeId !== undefined) originNodeId = patch.originNodeId;

    if (edgesChanged) {
      resolvedEdges = resolveEdgesForRender(nodes, edges, { layoutRunning });
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(rafId);
    for (const fn of cleanupFns) fn();
    el.remove();
  }

  return { canvas, el, update, destroy };
}
