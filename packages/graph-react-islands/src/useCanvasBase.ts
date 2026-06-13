/**
 * グラフキャンバスの基本操作フック。
 * パン・ズーム・矩形選択・ノードクリック・キーボードナビゲーションを提供する。
 */
import { useCallback, useEffect, useRef } from 'react';

import {
  pan, zoom, screenToWorld, hitTestNode, hitTestFrameBody, drawSelectionRect,
} from '@anytime-markdown/graph-core/engine';
import type { GraphNode, GraphGroup, Viewport, SelectionState } from '@anytime-markdown/graph-core/types';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type DragMode = 'none' | 'pan' | 'select-rect' | 'move';

export interface SelectRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface UseCanvasBaseOptions {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly getViewport: () => Viewport;
  readonly getNodes: () => readonly GraphNode[];
  readonly setViewport: (vp: Viewport) => void;
  readonly setSelection: (sel: SelectionState) => void;
  /** ノードクリック時のコールバック。null で選択解除 */
  readonly onNodeClick?: (node: GraphNode | null) => void;
  /** ダブルクリック時のコールバック */
  readonly onNodeDoubleClick?: (node: GraphNode | null) => void;
  /** 右クリック時のコールバック */
  readonly onNodeContextMenu?: (node: GraphNode, screenX: number, screenY: number) => void;
  /** Ctrl+クリック時のコールバック（複数選択トグル後に呼ばれる） */
  readonly onNodeCtrlClick?: (node: GraphNode) => void;
  /** フレームノードをヒットテスト対象から除外するか（デフォルト true） */
  readonly skipFrames?: boolean;

  // --- Editor key bindings (optional) ---
  /** 現在の選択状態を取得する */
  readonly getSelection?: () => SelectionState;
  /** dispatch 関数（DELETE_SELECTED, UNDO, REDO 等のアクション発行用） */
  readonly dispatch?: (action: { type: string; [key: string]: unknown }) => void;
  /** Space キーによるパンモード切替を有効にするか（デフォルト false） */
  readonly enableSpacePan?: boolean;
  /** ホイールズームに Shift を要求するか（デフォルト true） */
  readonly wheelRequiresShift?: boolean;
  /** コピー実行時のコールバック */
  readonly onCopy?: () => void;
  /** ペースト実行時のコールバック */
  readonly onPaste?: () => void;
  /** Delete キー押下時のコールバック（未指定の場合 dispatch DELETE_SELECTED） */
  readonly onDelete?: () => void;
  /** 現在のグループ一覧を取得する（Shift+G での DELETE_GROUP に使用） */
  readonly getGroups?: () => readonly GraphGroup[];
}

export interface UseCanvasBaseReturn {
  /** canvas の onMouseDown に渡す */
  readonly handleMouseDown: (e: React.MouseEvent) => void;
  /** canvas の onMouseMove に渡す */
  readonly handleMouseMove: (e: React.MouseEvent) => void;
  /** canvas の onMouseUp / onMouseLeave に渡す */
  readonly handleMouseUp: () => void;
  /** canvas の onDoubleClick に渡す */
  readonly handleDoubleClick: (e: React.MouseEvent) => void;
  /** canvas の onKeyDown に渡す */
  readonly handleKeyDown: (e: React.KeyboardEvent) => void;
  /** canvas の onKeyUp に渡す（Space パンモード解除用） */
  readonly handleKeyUp: (e: React.KeyboardEvent) => void;
  /** canvas の onContextMenu に渡す（右クリックメニュー抑止） */
  readonly handleContextMenu: (e: React.MouseEvent) => void;
  /** 現在のドラッグモード */
  readonly getDragMode: () => DragMode;
  /** 現在の選択矩形（null = 非表示） */
  readonly getSelectRect: () => SelectRect | null;
  /** render ループ内で呼び出して選択矩形を描画する */
  readonly drawSelectOverlay: (ctx: CanvasRenderingContext2D, viewport: Viewport) => void;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const PAN_STEP = 20;

const EMPTY_SELECTION: SelectionState = { nodeIds: [], edgeIds: [] };

export function deleteGroupsContainingSelection(
  selectedIds: Set<string>,
  groups: readonly GraphGroup[],
  dispatch: ((action: { type: string; [key: string]: unknown }) => void) | undefined,
): void {
  for (const g of groups) {
    if (g.memberIds.some(id => selectedIds.has(id))) {
      dispatch?.({ type: 'DELETE_GROUP', id: g.id });
    }
  }
}

// ---------------------------------------------------------------------------
//  Hook
// ---------------------------------------------------------------------------

export function useCanvasBase(options: UseCanvasBaseOptions): UseCanvasBaseReturn {
  const {
    canvasRef,
    getViewport,
    getNodes,
    setViewport,
    setSelection,
    onNodeClick,
    onNodeDoubleClick,
    onNodeContextMenu,
    onNodeCtrlClick,
    skipFrames = true,
    getSelection,
    dispatch: editorDispatch,
    enableSpacePan = false,
    wheelRequiresShift = true,
    onCopy,
    onPaste,
    onDelete,
    getGroups,
  } = options;

  // --- Refs ---
  const dragRef = useRef<{
    mode: DragMode;
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldY: number;
    moveIds?: string[];
    initialPositions?: Map<string, { x: number; y: number }>;
  }>({ mode: 'none', startScreenX: 0, startScreenY: 0, startWorldX: 0, startWorldY: 0 });

  const selectRectRef = useRef<SelectRect | null>(null);
  const spaceRef = useRef(false);

  // --- Helpers ---

  const nodeAtScreen = useCallback((sx: number, sy: number): GraphNode | undefined => {
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);
    const nodes = getNodes();
    // Non-frames render on top of frames (matching renderer z-order), so check non-frames first.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 'frame') continue;
      if (hitTestNode(n, world.x, world.y)) return n;
    }
    if (!skipFrames) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.type !== 'frame') continue;
        if (hitTestNode(n, world.x, world.y)) return n;
      }
    }
    return undefined;
  }, [getViewport, getNodes, skipFrames]);

  const screenPos = useCallback((e: React.MouseEvent): { sx: number; sy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }, [canvasRef]);

  // --- Mouse down helpers ---

  const startPanDrag = useCallback((sx: number, sy: number, world: { x: number; y: number }) => {
    dragRef.current = { mode: 'pan', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y };
  }, []);

  const startSelectRect = useCallback(
    (sx: number, sy: number, world: { x: number; y: number }, shiftKey: boolean) => {
      if (!shiftKey) {
        onNodeClick?.(null);
        setSelection(EMPTY_SELECTION);
      }
      dragRef.current = { mode: 'select-rect', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y };
      selectRectRef.current = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
    },
    [onNodeClick, setSelection],
  );

  const startMoveDrag = useCallback(
    (sx: number, sy: number, world: { x: number; y: number }, moveIds: string[], initialPositions: Map<string, { x: number; y: number }>) => {
      editorDispatch?.({ type: 'SNAPSHOT' });
      dragRef.current = { mode: 'move', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y, moveIds, initialPositions };
    },
    [editorDispatch],
  );

  const handleFrameNodeHit = useCallback(
    (hit: GraphNode, e: React.MouseEvent, sx: number, sy: number, world: { x: number; y: number }) => {
      const onBody = hitTestFrameBody({ x: world.x, y: world.y }, hit);
      if (!(onBody && editorDispatch)) {
        startSelectRect(sx, sy, world, e.shiftKey);
        return;
      }
      // タイトル/枠線 → frame + 全 groupId 子ノードをドラッグ
      const nodes = getNodes();
      const childIds = nodes.filter(n => n.groupId === hit.id).map(n => n.id);
      const moveIds = [hit.id, ...childIds];
      const initialPositions = new Map(
        nodes.filter(n => moveIds.includes(n.id)).map(n => [n.id, { x: n.x, y: n.y }]),
      );
      onNodeClick?.(hit);
      setSelection({ nodeIds: moveIds, edgeIds: [] });
      startMoveDrag(sx, sy, world, moveIds, initialPositions);
    },
    [editorDispatch, getNodes, onNodeClick, setSelection, startMoveDrag, startSelectRect],
  );

  const handleCtrlNodeHit = useCallback(
    (hit: GraphNode) => {
      if (!onNodeCtrlClick) return;
      const current = getSelection?.()?.nodeIds ?? [];
      const newNodeIds = current.includes(hit.id)
        ? current.filter(id => id !== hit.id)
        : [...current, hit.id];
      setSelection({ nodeIds: newNodeIds, edgeIds: [] });
      onNodeCtrlClick(hit);
    },
    [onNodeCtrlClick, getSelection, setSelection],
  );

  const handleNormalNodeHit = useCallback(
    (hit: GraphNode, sx: number, sy: number, world: { x: number; y: number }) => {
      onNodeClick?.(hit);
      setSelection({ nodeIds: [hit.id], edgeIds: [] });
      if (!editorDispatch) {
        startPanDrag(sx, sy, world);
        return;
      }
      const initialPositions = new Map([[hit.id, { x: hit.x, y: hit.y }]]);
      startMoveDrag(sx, sy, world, [hit.id], initialPositions);
    },
    [onNodeClick, setSelection, editorDispatch, startMoveDrag, startPanDrag],
  );

  // --- Mouse down ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { sx, sy } = screenPos(e);
    const world = screenToWorld(getViewport(), sx, sy);

    if (e.button === 1 || e.button === 2 || (enableSpacePan && spaceRef.current)) {
      startPanDrag(sx, sy, world);
      return;
    }
    if (e.button !== 0) return;

    const hit = nodeAtScreen(sx, sy);
    if (!hit) {
      startSelectRect(sx, sy, world, e.shiftKey);
      return;
    }
    if (hit.type === 'frame') {
      handleFrameNodeHit(hit, e, sx, sy, world);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && onNodeCtrlClick) {
      handleCtrlNodeHit(hit);
      return;
    }
    handleNormalNodeHit(hit, sx, sy, world);
  }, [screenPos, getViewport, enableSpacePan, nodeAtScreen, onNodeCtrlClick, startPanDrag, startSelectRect, handleFrameNodeHit, handleCtrlNodeHit, handleNormalNodeHit]);

  // --- Mouse move ---
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag.mode === 'none') return;

    const { sx, sy } = screenPos(e);

    if (drag.mode === 'pan') {
      const dx = sx - drag.startScreenX;
      const dy = sy - drag.startScreenY;
      drag.startScreenX = sx;
      drag.startScreenY = sy;
      setViewport(pan(getViewport(), dx, dy));
    }

    if (drag.mode === 'move' && drag.moveIds && drag.initialPositions) {
      const vp = getViewport();
      const world = screenToWorld(vp, sx, sy);
      const dx = world.x - drag.startWorldX;
      const dy = world.y - drag.startWorldY;
      const updates = drag.moveIds.flatMap(id => {
        const init = drag.initialPositions!.get(id);
        if (!init) return [];
        return [{ id, x: init.x + dx, y: init.y + dy }];
      });
      editorDispatch?.({ type: 'SET_NODE_POSITIONS', updates });
    }

    if (drag.mode === 'select-rect') {
      const vp = getViewport();
      const world = screenToWorld(vp, sx, sy);
      selectRectRef.current = { x1: drag.startWorldX, y1: drag.startWorldY, x2: world.x, y2: world.y };
    }
  }, [screenPos, getViewport, setViewport, editorDispatch]);

  // --- Mouse up ---
  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;

    if (drag.mode === 'select-rect') {
      const r = selectRectRef.current;
      if (r) {
        const minX = Math.min(r.x1, r.x2);
        const maxX = Math.max(r.x1, r.x2);
        const minY = Math.min(r.y1, r.y2);
        const maxY = Math.max(r.y1, r.y2);
        if (maxX - minX > 2 || maxY - minY > 2) {
          const nodes = getNodes();
          const selectedIds = nodes
            .filter(n => (!skipFrames || n.type !== 'frame') && n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY)
            .map(n => n.id);
          setSelection({ nodeIds: selectedIds, edgeIds: [] });
        }
      }
      selectRectRef.current = null;
    }

    dragRef.current = { mode: 'none', startScreenX: 0, startScreenY: 0, startWorldX: 0, startWorldY: 0 };
  }, [getNodes, setSelection, skipFrames, editorDispatch]);

  // --- Double click ---
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const { sx, sy } = screenPos(e);
    const hit = nodeAtScreen(sx, sy);
    onNodeDoubleClick?.(hit ?? null);
  }, [screenPos, nodeAtScreen, onNodeDoubleClick]);

  // --- Keyboard helpers ---

  /** 各ハンドラはキーを消化したら true を返し、そうでなければ false を返す */
  const handleSpaceKey = useCallback((e: React.KeyboardEvent): boolean => {
    if (!enableSpacePan || e.code !== 'Space' || e.repeat) return false;
    spaceRef.current = true;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    return true;
  }, [enableSpacePan, canvasRef]);

  const handleEscapeKey = useCallback((e: React.KeyboardEvent): boolean => {
    if (e.key !== 'Escape') return false;
    e.preventDefault();
    setSelection(EMPTY_SELECTION);
    return true;
  }, [setSelection]);

  const handleDeleteKey = useCallback((e: React.KeyboardEvent): boolean => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return false;
    const sel = getSelection?.();
    if (!sel || (sel.nodeIds.length === 0 && sel.edgeIds.length === 0)) return false;
    e.preventDefault();
    if (onDelete) onDelete();
    else editorDispatch?.({ type: 'DELETE_SELECTED' });
    return true;
  }, [getSelection, onDelete, editorDispatch]);

  const handleCtrlShortcut = useCallback((e: React.KeyboardEvent): boolean => {
    if (!e.ctrlKey && !e.metaKey) return false;
    const dispatchType = (() => {
      switch (e.key) {
        case 'z': return e.shiftKey ? 'REDO' : 'UNDO';
        case 'y': return 'REDO';
        default: return null;
      }
    })();
    if (dispatchType) {
      e.preventDefault();
      editorDispatch?.({ type: dispatchType });
      return true;
    }
    if (e.key === 'a') {
      e.preventDefault();
      setSelection({ nodeIds: getNodes().map(n => n.id), edgeIds: [] });
      return true;
    }
    if (e.key === 'c') { e.preventDefault(); onCopy?.(); return true; }
    if (e.key === 'v') { e.preventDefault(); onPaste?.(); return true; }
    return false;
  }, [editorDispatch, setSelection, getNodes, onCopy, onPaste]);

  const handleGroupKey = useCallback((e: React.KeyboardEvent): boolean => {
    if (e.ctrlKey || e.metaKey) return false;
    if (e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      const sel = getSelection?.();
      if (sel && sel.nodeIds.length >= 2) {
        editorDispatch?.({ type: 'CREATE_GROUP', memberIds: sel.nodeIds });
      }
      return true;
    }
    if (e.key === 'G' && e.shiftKey) {
      e.preventDefault();
      const sel = getSelection?.();
      if (sel) {
        deleteGroupsContainingSelection(new Set(sel.nodeIds), getGroups?.() ?? [], editorDispatch);
      }
      return true;
    }
    return false;
  }, [getSelection, editorDispatch, getGroups]);

  const handleViewportKey = useCallback((e: React.KeyboardEvent): boolean => {
    const vp = getViewport();
    const PAN_DELTAS: Record<string, [number, number]> = {
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
    };
    const panDelta = PAN_DELTAS[e.key];
    if (panDelta) {
      e.preventDefault();
      setViewport(pan(vp, panDelta[0], panDelta[1]));
      return true;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setViewport({ ...vp, scale: vp.scale * 1.1 });
      return true;
    }
    if (e.key === '-') {
      e.preventDefault();
      setViewport({ ...vp, scale: vp.scale * 0.9 });
      return true;
    }
    return false;
  }, [getViewport, setViewport]);

  // --- Keyboard ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (handleSpaceKey(e)) return;
    if (handleEscapeKey(e)) return;
    if (handleDeleteKey(e)) return;
    if (handleCtrlShortcut(e)) return;
    if (handleGroupKey(e)) return;
    handleViewportKey(e);
  }, [handleSpaceKey, handleEscapeKey, handleDeleteKey, handleCtrlShortcut, handleGroupKey, handleViewportKey]);

  // --- Key up (Space release) ---
  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (enableSpacePan && e.code === 'Space') {
      spaceRef.current = false;
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
    }
  }, [enableSpacePan, canvasRef]);

  // --- Context menu ---
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!onNodeContextMenu) return;
    const { sx, sy } = screenPos(e);
    // frame ノードも対象にするため skipFrames を無視した hit test を行う
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);
    const nodes = getNodes();
    let node: GraphNode | undefined;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (hitTestNode(nodes[i], world.x, world.y)) {
        node = nodes[i];
        break;
      }
    }
    if (node) {
      onNodeContextMenu(node, e.clientX, e.clientY);
    }
  }, [onNodeContextMenu, screenPos, getViewport, getNodes]);

  // --- Global Space key listener for pan mode (canvas must be hovered) ---
  useEffect(() => {
    if (!enableSpacePan) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let isOver = false;
    const onMouseEnter = () => { isOver = true; };
    const onMouseLeave = () => { isOver = false; };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || !isOver || spaceRef.current) return;
      spaceRef.current = true;
      canvas.style.cursor = 'grab';
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      if (dragRef.current.mode !== 'pan') canvas.style.cursor = 'default';
    };
    canvas.addEventListener('mouseenter', onMouseEnter);
    canvas.addEventListener('mouseleave', onMouseLeave);
    globalThis.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener('keyup', onKeyUp);
    return () => {
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      globalThis.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener('keyup', onKeyUp);
    };
  }, [enableSpacePan, canvasRef]);

  // --- Wheel zoom (non-passive) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (wheelRequiresShift && !e.shiftKey) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setViewport(zoom(getViewport(), cx, cy, e.deltaY));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef, getViewport, setViewport, wheelRequiresShift]);

  // --- Draw helper ---
  const drawSelectOverlay = useCallback((ctx: CanvasRenderingContext2D, vp: Viewport) => {
    const r = selectRectRef.current;
    if (!r) return;
    ctx.save();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(vp.scale, vp.scale);
    const x = Math.min(r.x1, r.x2);
    const y = Math.min(r.y1, r.y2);
    const w = Math.abs(r.x2 - r.x1);
    const h = Math.abs(r.y2 - r.y1);
    drawSelectionRect(ctx, x, y, w, h);
    ctx.restore();
  }, []);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleKeyDown,
    handleKeyUp,
    handleContextMenu,
    getDragMode: () => dragRef.current.mode,
    getSelectRect: () => selectRectRef.current,
    drawSelectOverlay,
  };
}
