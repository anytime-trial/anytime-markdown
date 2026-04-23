'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import IconButton from '@mui/material/IconButton';

import { fitToContent, screenToWorld, zoom } from '../engine/viewport';
import { getCanvasColors } from '../theme';
import type { GraphNode, Viewport } from '../types';

export interface MinimapCanvasProps {
  readonly nodes: readonly GraphNode[];
  readonly viewport: Viewport;
  /** メインキャンバスの参照（表示領域サイズ取得用） */
  readonly mainCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly onViewportChange: (vp: Viewport) => void;
  readonly isDark?: boolean;
  /** ミニマップの幅 px（デフォルト 200） */
  readonly width?: number;
  /** ミニマップの高さ px（デフォルト 130） */
  readonly height?: number;
}

type DragState =
  | { mode: 'select';   startX: number; startY: number; currentX: number; currentY: number }
  | { mode: 'viewport'; startX: number; startY: number; currentX: number; currentY: number;
      initialOffsetX: number; initialOffsetY: number }
  | null;

const PAD = 10;
const ZOOM_DELTA = 300;

function computeBounds(nodes: readonly GraphNode[]) {
  if (nodes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  return { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD };
}

export function MinimapCanvas({
  nodes,
  viewport,
  mainCanvasRef,
  onViewportChange,
  isDark = true,
  width = 200,
  height = 130,
}: MinimapCanvasProps) {
  const colors = getCanvasColors(isDark);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const hasMoved = drag !== null
    && (Math.abs(drag.currentX - drag.startX) > 3 || Math.abs(drag.currentY - drag.startY) > 3);

  // ワールド全体のバウンドからミニマップ変換係数を計算
  const bounds = computeBounds(nodes);
  const bw = bounds ? bounds.maxX - bounds.minX : 1;
  const bh = bounds ? bounds.maxY - bounds.minY : 1;
  const mmScale = Math.min(width / bw, height / bh);
  const mmOffX = (width  - bw * mmScale) / 2 - (bounds?.minX ?? 0) * mmScale;
  const mmOffY = (height - bh * mmScale) / 2 - (bounds?.minY ?? 0) * mmScale;

  const toMinimap = useCallback(
    (wx: number, wy: number) => ({ x: wx * mmScale + mmOffX, y: wy * mmScale + mmOffY }),
    [mmScale, mmOffX, mmOffY],
  );
  const toWorld = useCallback(
    (mx: number, my: number) => ({ x: (mx - mmOffX) / mmScale, y: (my - mmOffY) / mmScale }),
    [mmScale, mmOffX, mmOffY],
  );

  /** ミニマップ座標 (mx, my) が現在のビューポート矩形の内側かどうか */
  const isInsideViewportRect = useCallback((mx: number, my: number) => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return false;
    const cw = mainCanvas.clientWidth;
    const ch = mainCanvas.clientHeight;
    const tl = screenToWorld(viewport, 0,  0);
    const br = screenToWorld(viewport, cw, ch);
    const p1 = toMinimap(tl.x, tl.y);
    const p2 = toMinimap(br.x, br.y);
    return mx >= p1.x && mx <= p2.x && my >= p1.y && my <= p2.y;
  }, [mainCanvasRef, viewport, toMinimap]);

  // ズームボタン: メインキャンバス中央を基点に拡大縮小
  const handleZoomIn = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;
    onViewportChange(zoom(viewport, mainCanvas.clientWidth / 2, mainCanvas.clientHeight / 2, -ZOOM_DELTA));
  }, [mainCanvasRef, viewport, onViewportChange]);

  const handleZoomOut = useCallback(() => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas) return;
    onViewportChange(zoom(viewport, mainCanvas.clientWidth / 2, mainCanvas.clientHeight / 2, ZOOM_DELTA));
  }, [mainCanvasRef, viewport, onViewportChange]);

  // 描画
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = globalThis.devicePixelRatio ?? 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 背景
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(242,239,232,0.85)';
    ctx.fillRect(0, 0, width, height);

    if (!bounds) return;

    // ノードを描画
    for (const n of nodes) {
      const { x, y } = toMinimap(n.x, n.y);
      const w = Math.max(n.width  * mmScale, 2);
      const h = Math.max(n.height * mmScale, 2);
      ctx.fillStyle   = n.style.fill;
      ctx.strokeStyle = n.style.stroke;
      ctx.lineWidth   = 0.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    // 現在のビューポート矩形（ドラッグ中は移動後の位置を反映）
    const mainCanvas = mainCanvasRef.current;
    if (mainCanvas) {
      const cw = mainCanvas.clientWidth;
      const ch = mainCanvas.clientHeight;
      const vp = (drag?.mode === 'viewport' && hasMoved)
        ? {
            ...viewport,
            offsetX: drag.initialOffsetX - ((drag.currentX - drag.startX) / mmScale) * viewport.scale,
            offsetY: drag.initialOffsetY - ((drag.currentY - drag.startY) / mmScale) * viewport.scale,
          }
        : viewport;
      const tl = screenToWorld(vp, 0,  0);
      const br = screenToWorld(vp, cw, ch);
      const p1 = toMinimap(tl.x, tl.y);
      const p2 = toMinimap(br.x, br.y);
      const vw = p2.x - p1.x;
      const vh = p2.y - p1.y;
      ctx.fillStyle   = 'rgba(255,255,255,0.12)';
      ctx.strokeStyle = drag?.mode === 'viewport' ? 'rgba(144,202,249,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(p1.x, p1.y, vw, vh);
      ctx.strokeRect(p1.x, p1.y, vw, vh);
    }

    // 選択モードのドラッグ矩形（点線）
    if (drag?.mode === 'select' && hasMoved) {
      const sx = Math.min(drag.startX, drag.currentX);
      const sy = Math.min(drag.startY, drag.currentY);
      const sw = Math.abs(drag.currentX - drag.startX);
      const sh = Math.abs(drag.currentY - drag.startY);
      ctx.fillStyle   = 'rgba(144,202,249,0.15)';
      ctx.strokeStyle = 'rgba(144,202,249,0.9)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 2]);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  }, [nodes, viewport, mainCanvasRef, isDark, width, height, bounds, toMinimap, mmScale, hasMoved, drag]);

  const getRelativePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getRelativePos(e);
    if (!pos) return;
    if (isInsideViewportRect(pos.x, pos.y)) {
      setDrag({
        mode: 'viewport',
        startX: pos.x, startY: pos.y,
        currentX: pos.x, currentY: pos.y,
        initialOffsetX: viewport.offsetX,
        initialOffsetY: viewport.offsetY,
      });
    } else {
      setDrag({ mode: 'select', startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    }
  }, [getRelativePos, isInsideViewportRect, viewport.offsetX, viewport.offsetY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const pos = getRelativePos(e);
    if (!pos) return;

    if (drag.mode === 'viewport') {
      const dmx = pos.x - drag.startX;
      const dmy = pos.y - drag.startY;
      onViewportChange({
        ...viewport,
        offsetX: drag.initialOffsetX - (dmx / mmScale) * viewport.scale,
        offsetY: drag.initialOffsetY - (dmy / mmScale) * viewport.scale,
      });
    }
    setDrag(prev => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null);
  }, [drag, getRelativePos, viewport, mmScale, onViewportChange]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas || !drag) { setDrag(null); return; }
    const cw = mainCanvas.clientWidth;
    const ch = mainCanvas.clientHeight;

    if (drag.mode === 'viewport') {
      // mousemove で既に更新済み
    } else if (hasMoved) {
      const tl = toWorld(Math.min(drag.startX, drag.currentX), Math.min(drag.startY, drag.currentY));
      const br = toWorld(Math.max(drag.startX, drag.currentX), Math.max(drag.startY, drag.currentY));
      if (br.x > tl.x && br.y > tl.y) {
        onViewportChange(fitToContent(cw, ch, { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y }, 20));
      }
    } else {
      const pos = getRelativePos(e);
      if (pos) {
        const worldPos = toWorld(pos.x, pos.y);
        onViewportChange({
          ...viewport,
          offsetX: cw / 2 - worldPos.x * viewport.scale,
          offsetY: ch / 2 - worldPos.y * viewport.scale,
        });
      }
    }
    setDrag(null);
  }, [drag, hasMoved, toWorld, mainCanvasRef, viewport, onViewportChange, getRelativePos]);

  const handleMouseMoveForCursor = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    handleMouseMove(e);
    if (!drag) {
      const pos = getRelativePos(e);
      if (pos && minimapRef.current) {
        minimapRef.current.style.cursor = isInsideViewportRect(pos.x, pos.y) ? 'move' : 'crosshair';
      }
    }
  }, [drag, handleMouseMove, getRelativePos, isInsideViewportRect]);

  const btnStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 2,
    padding: 2,
    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
    backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)',
    borderRadius: 4,
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width,
        height,
        borderRadius: 8,
        border: `1px solid ${colors.panelBorder}`,
        backdropFilter: 'blur(8px)',
        zIndex: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={minimapRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveForCursor}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrag(null)}
        aria-label="Minimap: click to pan, drag viewport rect to pan, drag outside to zoom to selection"
      />
      <IconButton
        size="small"
        onClick={handleZoomOut}
        aria-label="Zoom out"
        style={{ ...btnStyle, right: 26 }}
        sx={{ fontSize: '0.9rem' }}
      >
        <ZoomOutIcon fontSize="inherit" />
      </IconButton>
      <IconButton
        size="small"
        onClick={handleZoomIn}
        aria-label="Zoom in"
        style={{ ...btnStyle, right: 2 }}
        sx={{ fontSize: '0.9rem' }}
      >
        <ZoomInIcon fontSize="inherit" />
      </IconButton>
    </div>
  );
}
