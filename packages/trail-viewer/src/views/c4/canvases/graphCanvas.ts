/**
 * GraphCanvas vanilla factory for the C4 architecture graph.
 *
 * Ports useCanvasBase (graph-react-islands) interaction logic to native DOM
 * events and runs a rAF render loop with the graph-core engine renderer.
 *
 * Exported from GraphCanvas.tsx for back-compat; types remain there.
 */

import type { GraphDocument, GraphGroup, GraphNode, SelectionState, Viewport } from '@anytime-markdown/graph-core';
import {
  drawSelectionRect,
  hitTestFrameBody,
  hitTestGroup,
  hitTestNode,
  nodeIntersection,
  pan,
  render,
  screenToWorld,
  zoom,
} from '@anytime-markdown/graph-core/engine';
import type { Action } from '@anytime-markdown/graph-core/state';

import {
  GHOST_EDGE_COMMIT_DARK,
  GHOST_EDGE_COMMIT_LIGHT,
  GHOST_EDGE_SESSION_DARK,
  GHOST_EDGE_SESSION_LIGHT,
  GHOST_EDGE_SUBAGENT_DARK,
  GHOST_EDGE_SUBAGENT_LIGHT,
} from '../../../c4/ghostEdgeColors';

// ---------------------------------------------------------------------------
// Re-exported types (defined here; GraphCanvas.tsx re-exports for back-compat)
// ---------------------------------------------------------------------------

export interface CommunityOverlayStyle {
  readonly color: string;
  readonly isGodNode: boolean;
}

export type C4GhostEdgeGranularity = 'commit' | 'session' | 'subagentType';

export interface C4GhostEdgeRender {
  readonly source: string;
  readonly target: string;
  readonly jaccard: number;
  readonly direction?: 'A→B' | 'B→A' | 'undirected';
  readonly confidenceForward?: number;
}

// ---------------------------------------------------------------------------
// Props / handle types
// ---------------------------------------------------------------------------

export interface GraphCanvasViewProps {
  readonly document: GraphDocument;
  readonly viewport: Viewport;
  readonly dispatch: (action: Action) => void;
  /** Callback receives the canvas element as soon as it is created. */
  readonly onCanvasReady?: (el: HTMLCanvasElement) => void;
  /** Mutable ref object that will hold the canvas element. */
  readonly canvasRef?: { current: HTMLCanvasElement | null };
  readonly selectedNodeId?: string | null;
  readonly centerOnSelect?: boolean;
  readonly overlayMap?: ReadonlyMap<string, string> | null;
  readonly claudeActivityMap?: ReadonlyMap<string, string> | null;
  readonly communityMap?: ReadonlyMap<string, CommunityOverlayStyle> | null;
  readonly communityRoleBadgeMap?: ReadonlyMap<string, string> | null;
  readonly ghostEdges?: ReadonlyArray<C4GhostEdgeRender>;
  readonly ghostEdgeGranularity?: C4GhostEdgeGranularity;
  readonly onNodeSelect?: (nodeId: string | null) => void;
  readonly onMultiNodeSelect?: (c4Ids: readonly string[]) => void;
  readonly onNodeDoubleClick?: (nodeId: string) => void;
  readonly onNodeContextMenu?: (c4Id: string, x: number, y: number) => void;
  readonly onGroupContextMenu?: (groupId: string, x: number, y: number) => void;
  readonly isDark?: boolean;
}

export interface GraphCanvasHandle {
  update(props: GraphCanvasViewProps): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIM_OPACITY = 10;
const COMMUNITY_OVERLAY_ALPHA = 0.5;
const GOD_NODE_STROKE_WIDTH = 3;
const PAN_STEP = 20;
const EMPTY_SELECTION: SelectionState = { nodeIds: [], edgeIds: [] };

// ---------------------------------------------------------------------------
// Pure color helpers (ported verbatim from GraphCanvas.tsx)
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r, g, b];
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function blendColors(base: string, overlay: string, alpha: number): string {
  const baseRgb = parseHex(base);
  const overRgb = parseHex(overlay);
  if (!baseRgb || !overRgb) return base;
  return toHex([
    baseRgb[0] * (1 - alpha) + overRgb[0] * alpha,
    baseRgb[1] * (1 - alpha) + overRgb[1] * alpha,
    baseRgb[2] * (1 - alpha) + overRgb[2] * alpha,
  ]);
}

function adjustBrightness(hex: string, factor: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]);
}

// ---------------------------------------------------------------------------
// Derived data helpers (ported from GraphCanvas.tsx useMemo blocks)
// ---------------------------------------------------------------------------

function resolveEdges(doc: GraphDocument): GraphDocument['edges'] {
  return doc.edges.map((e) => {
    if (e.type === 'connector' && e.from.nodeId && e.to.nodeId) {
      const fromNode = doc.nodes.find((n) => n.id === e.from.nodeId);
      const toNode = doc.nodes.find((n) => n.id === e.to.nodeId);
      if (fromNode && toNode) {
        const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 };
        const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };
        const fromPt = nodeIntersection(fromNode, toCenter.x, toCenter.y);
        const toPt = nodeIntersection(toNode, fromCenter.x, fromCenter.y);
        return {
          ...e,
          type: 'line' as const,
          from: { ...e.from, x: fromPt.x, y: fromPt.y },
          to: { ...e.to, x: toPt.x, y: toPt.y },
        };
      }
    }
    return e;
  });
}

function computeFocusScope(
  resolvedEdges: GraphDocument['edges'],
  selectedNodeId: string | null | undefined,
): { nodeIds: Set<string>; edgeIds: Set<string> } | null {
  if (!selectedNodeId) return null;
  const nodeIds = new Set<string>([selectedNodeId]);
  const edgeIds = new Set<string>();
  for (const edge of resolvedEdges) {
    const fromId = edge.from.nodeId;
    const toId = edge.to.nodeId;
    if (!fromId || !toId) continue;
    if (fromId === selectedNodeId || toId === selectedNodeId) {
      edgeIds.add(edge.id);
      nodeIds.add(fromId);
      nodeIds.add(toId);
    }
  }
  return { nodeIds, edgeIds };
}

function applyOverlays(
  nodes: readonly GraphNode[],
  overlayMap: ReadonlyMap<string, string> | null | undefined,
  communityMap: ReadonlyMap<string, CommunityOverlayStyle> | null | undefined,
  claudeActivityMap: ReadonlyMap<string, string> | null | undefined,
  focusScope: { nodeIds: Set<string>; edgeIds: Set<string> } | null,
): readonly GraphNode[] {
  let result = nodes;

  // metric overlay
  if (overlayMap) {
    result = result.map((n) => {
      if (n.type === 'frame') return n;
      const c4Id = n.metadata?.c4Id as string | undefined;
      if (!c4Id) return n;
      const fill = overlayMap.get(c4Id);
      if (!fill) return n;
      return { ...n, style: { ...n.style, fill } };
    });
  }

  // community overlay
  if (communityMap && communityMap.size > 0) {
    result = result.map((n) => {
      const c4Id = n.metadata?.c4Id as string | undefined;
      if (!c4Id) return n;
      const community = communityMap.get(c4Id);
      if (!community) return n;
      const overlayFill = overlayMap?.get(c4Id);
      const fill = overlayFill
        ? blendColors(community.color, overlayFill, COMMUNITY_OVERLAY_ALPHA)
        : community.color;
      const style = community.isGodNode
        ? { ...n.style, fill, stroke: adjustBrightness(community.color, 0.6), strokeWidth: GOD_NODE_STROKE_WIDTH }
        : { ...n.style, fill };
      return { ...n, style };
    });
  }

  // claude activity overlay
  if (claudeActivityMap) {
    result = result.map((n) => {
      const c4Id = n.metadata?.c4Id as string | undefined;
      if (!c4Id) return n;
      const fill = claudeActivityMap.get(c4Id);
      if (!fill) return n;
      return { ...n, style: { ...n.style, fill } };
    });
  }

  // focus dim
  if (focusScope) {
    result = result.map((node) => {
      if (focusScope.nodeIds.has(node.id)) return node;
      return { ...node, style: { ...node.style, opacity: DIM_OPACITY } };
    });
  }

  return result;
}

function applyEdgeFocusDim(
  edges: GraphDocument['edges'],
  focusScope: { nodeIds: Set<string>; edgeIds: Set<string> } | null,
): GraphDocument['edges'] {
  if (!focusScope) return edges;
  return edges.map((edge) => {
    if (focusScope.edgeIds.has(edge.id)) return edge;
    return { ...edge, style: { ...edge.style, opacity: DIM_OPACITY } };
  });
}

// ---------------------------------------------------------------------------
// Drawing helpers (ported verbatim from GraphCanvas.tsx)
// ---------------------------------------------------------------------------

function drawGhostEdges(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  nodes: ReadonlyArray<GraphNode>,
  ghosts: ReadonlyArray<C4GhostEdgeRender>,
  granularity: C4GhostEdgeGranularity,
  isDark: boolean,
): void {
  if (ghosts.length === 0) return;
  const color =
    granularity === 'subagentType'
      ? (isDark ? GHOST_EDGE_SUBAGENT_DARK : GHOST_EDGE_SUBAGENT_LIGHT)
      : granularity === 'session'
        ? (isDark ? GHOST_EDGE_SESSION_DARK : GHOST_EDGE_SESSION_LIGHT)
        : (isDark ? GHOST_EDGE_COMMIT_DARK : GHOST_EDGE_COMMIT_LIGHT);

  const idToWorld = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const c4Id = n.metadata?.c4Id as string | undefined;
    if (!c4Id) continue;
    idToWorld.set(c4Id, { x: n.x + (n.width ?? 0) / 2, y: n.y + (n.height ?? 0) / 2 });
  }

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';

  for (const ge of ghosts) {
    const s = idToWorld.get(ge.source);
    const t = idToWorld.get(ge.target);
    if (!s || !t) continue;
    const sx = s.x * viewport.scale + viewport.offsetX;
    const sy = s.y * viewport.scale + viewport.offsetY;
    const tx = t.x * viewport.scale + viewport.offsetX;
    const ty = t.y * viewport.scale + viewport.offsetY;
    const width = 1 + Math.max(0, Math.min(ge.jaccard, 1)) * 3;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    if (ge.direction === 'A→B' || ge.direction === 'B→A') {
      const from = ge.direction === 'A→B' ? { x: sx, y: sy } : { x: tx, y: ty };
      const to = ge.direction === 'A→B' ? { x: tx, y: ty } : { x: sx, y: sy };
      drawArrowHead(ctx, from, to, width);
    }
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  thickness: number,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLen = Math.max(6, thickness * 3);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const BADGE_ROLE_COLORS: Readonly<Record<string, string>> = { P: '#e53935', S: '#1e88e5', D: '#fb8c00' };

function drawCommunityRoleBadges(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  nodes: ReadonlyArray<GraphNode>,
  badgeMap: ReadonlyMap<string, string>,
): void {
  const { scale, offsetX, offsetY } = viewport;
  const radius = Math.max(6, Math.min(10, scale * 10));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(radius * 1.3)}px sans-serif`;

  for (const node of nodes) {
    if (node.type === 'frame') continue;
    const c4Id = node.metadata?.c4Id as string | undefined;
    if (!c4Id) continue;
    const label = badgeMap.get(c4Id);
    if (!label) continue;

    const bx = (node.x + node.width) * scale + offsetX - radius * 0.6;
    const by = node.y * scale + offsetY + radius * 0.6;

    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_ROLE_COLORS[label] ?? '#616161';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, bx, by);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// SelectRect overlay drawing (ported from useCanvasBase.drawSelectOverlay)
// ---------------------------------------------------------------------------

interface SelectRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function drawSelectOverlay(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  selectRect: SelectRect | null,
): void {
  if (!selectRect) return;
  const r = selectRect;
  ctx.save();
  ctx.translate(vp.offsetX, vp.offsetY);
  ctx.scale(vp.scale, vp.scale);
  const x = Math.min(r.x1, r.x2);
  const y = Math.min(r.y1, r.y2);
  const w = Math.abs(r.x2 - r.x1);
  const h = Math.abs(r.y2 - r.y1);
  drawSelectionRect(ctx, x, y, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// DragMode type
// ---------------------------------------------------------------------------

type DragMode = 'none' | 'pan' | 'select-rect' | 'move';

interface DragState {
  mode: DragMode;
  startScreenX: number;
  startScreenY: number;
  startWorldX: number;
  startWorldY: number;
  moveIds?: string[];
  initialPositions?: Map<string, { x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountGraphCanvas(
  container: HTMLElement,
  initialProps: GraphCanvasViewProps,
): GraphCanvasHandle {
  // ── closure state ──
  let props = initialProps;
  let selectionIds: string[] = initialProps.selectedNodeId ? [initialProps.selectedNodeId] : [];
  let isFocused = false;
  let rafId = 0;
  let destroyed = false;

  // Drag / interaction state
  const drag: DragState = { mode: 'none', startScreenX: 0, startScreenY: 0, startWorldX: 0, startWorldY: 0 };
  let selectRect: SelectRect | null = null;

  // ── DOM ──
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'architecture diagram');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
  container.appendChild(canvas);

  // ノード数を含む動的 aria-label（旧 `C4 architecture graph with N nodes`）。update でも更新する。
  function updateAriaLabel(): void {
    canvas.setAttribute('aria-label', `C4 architecture graph with ${getNodes().length} nodes`);
  }
  updateAriaLabel();

  // Expose canvas to parent
  props.onCanvasReady?.(canvas);
  if (props.canvasRef) props.canvasRef.current = canvas;

  // ── Cleanup list ──
  const cleanupFns: (() => void)[] = [];

  function addListener<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | typeof globalThis,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    (target as HTMLElement).addEventListener(type as string, handler as EventListener, options);
    cleanupFns.push(() => (target as HTMLElement).removeEventListener(type as string, handler as EventListener, options));
  }

  // ── ResizeObserver (jsdom guard) ──
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      updateCursorStyle();
    });
    ro.observe(container);
    cleanupFns.push(() => ro.disconnect());
  }

  // ── Helpers: screen pos from event ──
  function screenPos(e: MouseEvent): { sx: number; sy: number } {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function getViewport(): Viewport {
    return props.viewport;
  }

  function getNodes(): readonly GraphNode[] {
    return props.document.nodes;
  }

  function getGroups(): readonly GraphGroup[] {
    return props.document.groups ?? [];
  }

  function dispatchAction(action: Action): void {
    props.dispatch(action);
  }

  function setViewportAction(vp: Viewport): void {
    dispatchAction({ type: 'SET_VIEWPORT', viewport: vp } as unknown as Action);
  }

  function setSelectionAction(sel: SelectionState): void {
    selectionIds = sel.nodeIds;
    dispatchAction({ type: 'SET_SELECTION', selection: sel } as unknown as Action);
  }

  // ── Hit test ──
  function nodeAtScreen(sx: number, sy: number): GraphNode | undefined {
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);
    const nodes = getNodes();
    // non-frames first (matching z-order)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 'frame') continue;
      if (hitTestNode(n, world.x, world.y)) return n;
    }
    // 非 frame がヒットしなければ frame（Boundary 枠）もヒットテストする。
    // 旧 useCanvasBase は skipFrames=false（C4 GraphCanvas）でこの第二ループを持ち、
    // frame body ドラッグでのグループ一括移動・frame 選択・frame ダブルクリックを成立させていた。
    // これが無いと handleMouseDown の frame 分岐（hit.type==='frame'）が到達不能になる。
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type !== 'frame') continue;
      if (hitTestNode(n, world.x, world.y)) return n;
    }
    return undefined;
  }

  // ── Mouse handlers ──
  function handleMouseDown(e: MouseEvent): void {
    const { sx, sy } = screenPos(e);
    const world = screenToWorld(getViewport(), sx, sy);

    if (e.button === 1 || e.button === 2) {
      drag.mode = 'pan';
      drag.startScreenX = sx;
      drag.startScreenY = sy;
      drag.startWorldX = world.x;
      drag.startWorldY = world.y;
      return;
    }
    if (e.button !== 0) return;

    const hit = nodeAtScreen(sx, sy);
    if (!hit) {
      // select-rect
      if (!e.shiftKey) {
        selectionIds = [];
        setSelectionAction(EMPTY_SELECTION);
        props.onNodeSelect?.(null);
      }
      drag.mode = 'select-rect';
      drag.startScreenX = sx;
      drag.startScreenY = sy;
      drag.startWorldX = world.x;
      drag.startWorldY = world.y;
      selectRect = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      return;
    }

    if (hit.type === 'frame') {
      const onBody = hitTestFrameBody({ x: world.x, y: world.y }, hit);
      if (!onBody) {
        // select-rect on frame header
        if (!e.shiftKey) {
          selectionIds = [];
          setSelectionAction(EMPTY_SELECTION);
          props.onNodeSelect?.(null);
        }
        drag.mode = 'select-rect';
        drag.startScreenX = sx;
        drag.startScreenY = sy;
        drag.startWorldX = world.x;
        drag.startWorldY = world.y;
        selectRect = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      } else {
        const nodes = getNodes();
        const childIds = nodes.filter((n) => n.groupId === hit.id).map((n) => n.id);
        const moveIds = [hit.id, ...childIds];
        const initialPositions = new Map(
          nodes.filter((n) => moveIds.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]),
        );
        selectionIds = moveIds;
        setSelectionAction({ nodeIds: moveIds, edgeIds: [] });
        const c4Id = hit.metadata?.c4Id as string | undefined;
        props.onNodeSelect?.(c4Id ?? hit.id);
        dispatchAction({ type: 'SNAPSHOT' } as unknown as Action);
        drag.mode = 'move';
        drag.startScreenX = sx;
        drag.startScreenY = sy;
        drag.startWorldX = world.x;
        drag.startWorldY = world.y;
        drag.moveIds = moveIds;
        drag.initialPositions = initialPositions;
      }
      return;
    }

    // Ctrl/Cmd click: multi-select toggle
    if ((e.ctrlKey || e.metaKey) && props.onMultiNodeSelect) {
      const current = selectionIds;
      const newNodeIds = current.includes(hit.id)
        ? current.filter((id) => id !== hit.id)
        : [...current, hit.id];
      selectionIds = newNodeIds;
      setSelectionAction({ nodeIds: newNodeIds, edgeIds: [] });
      const allC4Ids = newNodeIds.flatMap((nodeId) => {
        const n = getNodes().find((nd) => nd.id === nodeId);
        const c4Id = n?.metadata?.c4Id as string | undefined;
        return c4Id ? [c4Id] : [];
      });
      props.onMultiNodeSelect(allC4Ids);
      return;
    }

    // Normal node hit: select + start a MOVE drag so individual nodes can be
    // repositioned (useCanvasBase did this whenever an editor dispatch existed;
    // dispatch is a required prop here, so the original behavior is to move).
    const c4Id = hit.metadata?.c4Id as string | undefined;
    selectionIds = [hit.id];
    setSelectionAction({ nodeIds: [hit.id], edgeIds: [] });
    props.onNodeSelect?.(c4Id ?? hit.id);

    dispatchAction({ type: 'SNAPSHOT' } as unknown as Action);
    drag.mode = 'move';
    drag.startScreenX = sx;
    drag.startScreenY = sy;
    drag.startWorldX = world.x;
    drag.startWorldY = world.y;
    drag.moveIds = [hit.id];
    drag.initialPositions = new Map([[hit.id, { x: hit.x, y: hit.y }]]);

    updateCursorStyle();
  }

  function handleMouseMove(e: MouseEvent): void {
    if (drag.mode === 'none') return;
    const { sx, sy } = screenPos(e);

    if (drag.mode === 'pan') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      drag.startScreenX = sx;
      drag.startScreenY = sy;
      setViewportAction(pan(getViewport(), dx, dy));
    }

    if (drag.mode === 'move' && drag.moveIds && drag.initialPositions) {
      const vp = getViewport();
      const world = screenToWorld(vp, sx, sy);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      const updates = drag.moveIds.flatMap((id) => {
        const init = drag.initialPositions!.get(id);
        if (!init) return [];
        return [{ id, x: init.x + dx, y: init.y + dy }];
      });
      dispatchAction({ type: 'SET_NODE_POSITIONS', updates } as unknown as Action);
    }

    if (drag.mode === 'select-rect') {
      const vp = getViewport();
      const world = screenToWorld(vp, sx, sy);
      selectRect = { x1: drag.startWorldX, y1: drag.startWorldY, x2: world.x, y2: world.y };
    }

    updateCursorStyle();
  }

  function handleMouseUp(): void {
    if (drag.mode === 'select-rect') {
      const r = selectRect;
      if (r) {
        const minX = Math.min(r.x1, r.x2);
        const maxX = Math.max(r.x1, r.x2);
        const minY = Math.min(r.y1, r.y2);
        const maxY = Math.max(r.y1, r.y2);
        if (maxX - minX > 2 || maxY - minY > 2) {
          const nodes = getNodes();
          const selectedIds = nodes
            .filter((n) => n.type !== 'frame' && n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY)
            .map((n) => n.id);
          selectionIds = selectedIds;
          setSelectionAction({ nodeIds: selectedIds, edgeIds: [] });
        }
      }
      selectRect = null;
    }

    drag.mode = 'none';
    drag.startScreenX = 0;
    drag.startScreenY = 0;
    drag.startWorldX = 0;
    drag.startWorldY = 0;
    drag.moveIds = undefined;
    drag.initialPositions = undefined;

    updateCursorStyle();
  }

  function handleDoubleClick(e: MouseEvent): void {
    const { sx, sy } = screenPos(e);
    const hit = nodeAtScreen(sx, sy);
    if (hit) {
      const c4Id = hit.metadata?.c4Id as string | undefined;
      props.onNodeDoubleClick?.(c4Id ?? hit.id);
    }
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) return;

    const { sx, sy } = screenPos(e);
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);
    const nodes = getNodes();

    // Check node hit first
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (hitTestNode(nodes[i], world.x, world.y)) {
        const node = nodes[i];
        const c4Id = node.metadata?.c4Id as string | undefined;
        if (c4Id) props.onNodeContextMenu?.(c4Id, e.clientX, e.clientY);
        return;
      }
    }

    // Group context menu (only if no node hit)
    if (props.onGroupContextMenu) {
      const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));
      const group = hitTestGroup(world.x, world.y, getGroups(), nodeMap);
      if (group) {
        props.onGroupContextMenu(group.id, e.clientX, e.clientY);
      }
    }
  }

  // ── Keyboard handlers ──
  function handleKeyDown(e: KeyboardEvent): void {
    const vp = getViewport();

    // Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      selectionIds = [];
      setSelectionAction(EMPTY_SELECTION);
      return;
    }

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        dispatchAction({ type: e.shiftKey ? 'REDO' : 'UNDO' } as unknown as Action);
        return;
      }
      if (e.key === 'y') {
        e.preventDefault();
        dispatchAction({ type: 'REDO' } as unknown as Action);
        return;
      }
      if (e.key === 'a') {
        e.preventDefault();
        const allIds = getNodes().map((n) => n.id);
        selectionIds = allIds;
        setSelectionAction({ nodeIds: allIds, edgeIds: [] });
        return;
      }
      return;
    }

    // Arrow pan
    const PAN_DELTAS: Record<string, [number, number]> = {
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
    };
    const panDelta = PAN_DELTAS[e.key];
    if (panDelta) {
      e.preventDefault();
      setViewportAction(pan(vp, panDelta[0], panDelta[1]));
      return;
    }

    // Zoom
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setViewportAction({ ...vp, scale: vp.scale * 1.1 });
      return;
    }
    if (e.key === '-') {
      e.preventDefault();
      setViewportAction({ ...vp, scale: vp.scale * 0.9 });
      return;
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectionIds.length > 0) {
        e.preventDefault();
        dispatchAction({ type: 'DELETE_SELECTED' } as unknown as Action);
      }
      return;
    }

    // Group
    if (e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      if (selectionIds.length >= 2) {
        dispatchAction({ type: 'CREATE_GROUP', memberIds: selectionIds } as unknown as Action);
      }
      return;
    }
    if (e.key === 'G' && e.shiftKey) {
      e.preventDefault();
      const selectedSet = new Set(selectionIds);
      for (const g of getGroups()) {
        if (g.memberIds.some((id) => selectedSet.has(id))) {
          dispatchAction({ type: 'DELETE_GROUP', id: g.id } as unknown as Action);
        }
      }
    }
  }

  // ── Wheel zoom (non-passive) ──
  function handleWheel(e: WheelEvent): void {
    if (!e.shiftKey) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setViewportAction(zoom(getViewport(), cx, cy, e.deltaY));
  }

  // ── Focus / blur ──
  function handleFocus(): void {
    isFocused = true;
    updateCursorStyle();
  }

  function handleBlur(): void {
    isFocused = false;
    updateCursorStyle();
  }

  // ── Cursor & focus ring ──
  function updateCursorStyle(): void {
    let cursor = 'default';
    if (drag.mode === 'select-rect') cursor = 'crosshair';
    else if (drag.mode === 'pan' || drag.mode === 'move') cursor = 'grabbing';
    canvas.style.cursor = cursor;
    canvas.style.boxShadow = isFocused ? 'inset 0 0 0 2px #4FC3F7' : 'none';
  }

  // ── Register listeners ──
  addListener(canvas, 'mousedown', handleMouseDown);
  addListener(canvas, 'mousemove', handleMouseMove);
  addListener(canvas, 'mouseup', handleMouseUp);
  addListener(canvas, 'mouseleave', handleMouseUp);
  addListener(canvas, 'dblclick', handleDoubleClick);
  addListener(canvas, 'contextmenu', handleContextMenu);
  addListener(canvas, 'keydown', handleKeyDown);
  addListener(canvas, 'focus', handleFocus);
  addListener(canvas, 'blur', handleBlur);
  addListener(canvas, 'wheel', handleWheel as (e: HTMLElementEventMap['wheel']) => void, { passive: false });

  // ── render loop ──
  function draw(): void {
    if (destroyed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafId = requestAnimationFrame(draw);
      return;
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const vp = props.viewport;
    const doc = props.document;

    const edgesResolved = resolveEdges(doc);
    const focusScope = computeFocusScope(edgesResolved, props.selectedNodeId);
    const styledNodes = applyOverlays(doc.nodes, props.overlayMap, props.communityMap, props.claudeActivityMap, focusScope);
    const styledEdges = applyEdgeFocusDim(edgesResolved, focusScope);

    const sel = selectionIds;
    render({
      ctx,
      width: w,
      height: h,
      nodes: styledNodes,
      edges: styledEdges,
      groups: doc.groups ?? [],
      viewport: vp,
      selection: sel.length > 0 ? { nodeIds: sel, edgeIds: [] } : EMPTY_SELECTION,
      showGrid: false,
      isDark: props.isDark ?? true,
    });

    drawGhostEdges(
      ctx,
      vp,
      styledNodes,
      props.ghostEdges ?? [],
      props.ghostEdgeGranularity ?? 'commit',
      props.isDark ?? false,
    );

    const badgeMap = props.communityRoleBadgeMap;
    if (badgeMap && badgeMap.size > 0) {
      drawCommunityRoleBadges(ctx, vp, styledNodes, badgeMap);
    }

    drawSelectOverlay(ctx, vp, selectRect);

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  // ── centerOnSelect ──
  function applyCenterOnSelect(newProps: GraphCanvasViewProps, prevSelectedNodeId: string | null | undefined): void {
    if (!newProps.centerOnSelect || !newProps.selectedNodeId) return;
    if (newProps.selectedNodeId === prevSelectedNodeId) return;
    const node = newProps.document.nodes.find((n) => n.id === newProps.selectedNodeId);
    if (!node) return;
    const vp = newProps.viewport;
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const canvasCenterX = canvas.clientWidth / 2;
    const canvasCenterY = canvas.clientHeight / 2;
    newProps.dispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        ...vp,
        offsetX: canvasCenterX - centerX * vp.scale,
        offsetY: canvasCenterY - centerY * vp.scale,
      },
    } as unknown as Action);
  }

  // ── update / destroy ──
  function update(newProps: GraphCanvasViewProps): void {
    const prevSelectedNodeId = props.selectedNodeId;
    props = newProps;

    // Sync canvasRef if provided
    if (newProps.canvasRef && newProps.canvasRef.current !== canvas) {
      newProps.canvasRef.current = canvas;
    }

    // Update selection when selectedNodeId changes externally
    const sel = newProps.selectedNodeId;
    if (sel !== prevSelectedNodeId) {
      if (!sel && selectionIds.length > 1) {
        // Keep multi-selection if selectedNodeId cleared while multi-select active
      } else {
        selectionIds = sel ? [sel] : [];
      }
    }

    applyCenterOnSelect(newProps, prevSelectedNodeId);
    updateCursorStyle();
    updateAriaLabel();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(rafId);
    for (const fn of cleanupFns) fn();
    if (props.canvasRef) props.canvasRef.current = null;
    canvas.remove();
  }

  return { update, destroy };
}
