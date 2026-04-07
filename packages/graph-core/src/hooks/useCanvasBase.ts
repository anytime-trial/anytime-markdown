/**
 * グラフキャンバスの基本操作フック。
 * パン・ズーム・矩形選択・ノードクリック・キーボードナビゲーションを提供する。
 */
import { useCallback, useEffect, useRef } from 'react';

import {
  pan, zoom, screenToWorld, hitTestNode, drawSelectionRect,
} from '../engine/index';
import type { GraphNode, Viewport, SelectionState } from '../types';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type DragMode = 'none' | 'pan' | 'select-rect';

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
  /** フレームノードをヒットテスト対象から除外するか（デフォルト true） */
  readonly skipFrames?: boolean;

  // --- Editor key bindings (optional) ---
  /** 現在の選択状態を取得する */
  readonly getSelection?: () => SelectionState;
  /** dispatch 関数（DELETE_SELECTED, UNDO, REDO 等のアクション発行用） */
  readonly dispatch?: (action: { type: string; [key: string]: unknown }) => void;
  /** Space キーによるパンモード切替を有効にするか（デフォルト false） */
  readonly enableSpacePan?: boolean;
  /** コピー実行時のコールバック */
  readonly onCopy?: () => void;
  /** ペースト実行時のコールバック */
  readonly onPaste?: () => void;
  /** Delete キー押下時のコールバック（未指定の場合 dispatch DELETE_SELECTED） */
  readonly onDelete?: () => void;
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
    skipFrames = true,
    getSelection,
    dispatch: editorDispatch,
    enableSpacePan = false,
    onCopy,
    onPaste,
    onDelete,
  } = options;

  // --- Refs ---
  const dragRef = useRef<{
    mode: DragMode;
    startScreenX: number;
    startScreenY: number;
    startWorldX: number;
    startWorldY: number;
  }>({ mode: 'none', startScreenX: 0, startScreenY: 0, startWorldX: 0, startWorldY: 0 });

  const selectRectRef = useRef<SelectRect | null>(null);
  const spaceRef = useRef(false);

  // --- Helpers ---

  const nodeAtScreen = useCallback((sx: number, sy: number): GraphNode | undefined => {
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);
    const nodes = getNodes();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (skipFrames && n.type === 'frame') continue;
      if (hitTestNode(n, world.x, world.y)) return n;
    }
    return undefined;
  }, [getViewport, getNodes, skipFrames]);

  const screenPos = useCallback((e: React.MouseEvent): { sx: number; sy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }, [canvasRef]);

  // --- Mouse down ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { sx, sy } = screenPos(e);
    const vp = getViewport();
    const world = screenToWorld(vp, sx, sy);

    // Middle/right button or Space held → pan
    if (e.button === 1 || e.button === 2 || (enableSpacePan && spaceRef.current)) {
      dragRef.current = { mode: 'pan', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y };
      return;
    }

    // Left button
    if (e.button === 0) {
      const hit = nodeAtScreen(sx, sy);
      if (hit) {
        onNodeClick?.(hit);
        setSelection({ nodeIds: [hit.id], edgeIds: [] });
        dragRef.current = { mode: 'pan', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y };
      } else {
        if (!e.shiftKey) {
          onNodeClick?.(null);
          setSelection(EMPTY_SELECTION);
        }
        dragRef.current = { mode: 'select-rect', startScreenX: sx, startScreenY: sy, startWorldX: world.x, startWorldY: world.y };
        selectRectRef.current = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      }
    }
  }, [screenPos, getViewport, nodeAtScreen, onNodeClick, setSelection]);

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

    if (drag.mode === 'select-rect') {
      const vp = getViewport();
      const world = screenToWorld(vp, sx, sy);
      selectRectRef.current = { x1: drag.startWorldX, y1: drag.startWorldY, x2: world.x, y2: world.y };
    }
  }, [screenPos, getViewport, setViewport]);

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
  }, [getNodes, setSelection, skipFrames]);

  // --- Double click ---
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const { sx, sy } = screenPos(e);
    const hit = nodeAtScreen(sx, sy);
    onNodeDoubleClick?.(hit ?? null);
  }, [screenPos, nodeAtScreen, onNodeDoubleClick]);

  // --- Keyboard ---
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Space → pan mode
    if (enableSpacePan && e.code === 'Space' && !e.repeat) {
      spaceRef.current = true;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      return;
    }

    // Escape → clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      setSelection(EMPTY_SELECTION);
      return;
    }

    // Delete / Backspace → delete selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = getSelection?.();
      if (sel && (sel.nodeIds.length > 0 || sel.edgeIds.length > 0)) {
        e.preventDefault();
        if (onDelete) {
          onDelete();
        } else {
          editorDispatch?.({ type: 'DELETE_SELECTED' });
        }
        return;
      }
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'z':
          e.preventDefault();
          editorDispatch?.({ type: e.shiftKey ? 'REDO' : 'UNDO' });
          return;
        case 'y':
          e.preventDefault();
          editorDispatch?.({ type: 'REDO' });
          return;
        case 'a':
          e.preventDefault();
          setSelection({ nodeIds: getNodes().map(n => n.id), edgeIds: [] });
          return;
        case 'c':
          e.preventDefault();
          onCopy?.();
          return;
        case 'v':
          e.preventDefault();
          onPaste?.();
          return;
        case 'g':
          e.preventDefault();
          if (e.shiftKey) {
            editorDispatch?.({ type: 'UNGROUP_SELECTED' });
          } else {
            editorDispatch?.({ type: 'GROUP_SELECTED', groupId: crypto.randomUUID() });
          }
          return;
      }
    }

    // Viewport navigation
    const vp = getViewport();
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setViewport(pan(vp, 0, PAN_STEP));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setViewport(pan(vp, 0, -PAN_STEP));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setViewport(pan(vp, PAN_STEP, 0));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setViewport(pan(vp, -PAN_STEP, 0));
        break;
      case '+':
      case '=':
        e.preventDefault();
        setViewport({ ...vp, scale: vp.scale * 1.1 });
        break;
      case '-':
        e.preventDefault();
        setViewport({ ...vp, scale: vp.scale * 0.9 });
        break;
    }
  }, [getViewport, setViewport, setSelection, getNodes, getSelection, editorDispatch, enableSpacePan, canvasRef, onCopy, onPaste, onDelete]);

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
  }, []);

  // --- Wheel zoom (non-passive) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setViewport(zoom(getViewport(), cx, cy, e.deltaY));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef, getViewport, setViewport]);

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
