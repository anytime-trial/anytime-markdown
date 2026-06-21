/**
 * MinimapCanvas vanilla factory for the C4 architecture graph minimap.
 *
 * Ports MinimapCanvas.tsx (graph-react-islands) to a self-contained vanilla
 * DOM factory with no React dependency.
 *
 * @example
 *   const handle = mountMinimapCanvas(containerEl, props);
 *   handle.update(newProps);
 *   handle.destroy();
 */

import { fitToContent, screenToWorld, zoom } from '@anytime-markdown/graph-core/engine';
import { getCanvasColors } from '@anytime-markdown/graph-core';
import type { GraphNode, Viewport } from '@anytime-markdown/graph-core/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MinimapCanvasViewProps {
  readonly nodes: readonly GraphNode[];
  readonly viewport: Viewport;
  /** Reference to the main canvas element (for display area size). */
  readonly mainCanvasRef: { current: HTMLCanvasElement | null };
  readonly onViewportChange: (vp: Viewport) => void;
  readonly isDark?: boolean;
  readonly onFit?: () => void;
  /** Minimap width in px (default 200). */
  readonly width?: number;
  /** Minimap height in px (default 130). */
  readonly height?: number;
}

export interface MinimapCanvasHandle {
  update(props: MinimapCanvasViewProps): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Constants (ported verbatim from MinimapCanvas.tsx)
// ---------------------------------------------------------------------------

const PAD = 10;
const ZOOM_DELTA = 300;

const ZOOM_OUT_PATH =
  'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z';
const ZOOM_IN_PATH =
  'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14m.5-7H9v2H7v1h2v2h1v-2h2V9h-2z';
const FIT_SCREEN_PATH =
  'M17 4h3c1.1 0 2 .9 2 2v2h-2V6h-3zM4 8V6h3V4H4c-1.1 0-2 .9-2 2v2zm16 8v2h-3v2h3c1.1 0 2-.9 2-2v-2zM7 18H4v-2H2v2c0 1.1.9 2 2 2h3zM18 8H6v8h12z';

const MINI_BTN_BASE_CSS =
  'display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:0.9rem;line-height:0;';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type DragMode = 'select' | 'viewport';

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  initialOffsetX: number;
  initialOffsetY: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (ported verbatim from MinimapCanvas.tsx)
// ---------------------------------------------------------------------------

function computeBounds(nodes: readonly GraphNode[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} | null {
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

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function createSvgIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function createMiniButton(ariaLabel: string, iconPath: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.style.cssText = MINI_BTN_BASE_CSS;
  btn.appendChild(createSvgIcon(iconPath));
  return btn;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountMinimapCanvas(
  container: HTMLElement,
  initialProps: MinimapCanvasViewProps,
): MinimapCanvasHandle {
  // ── closure state ──
  let props: MinimapCanvasViewProps = initialProps;
  let drag: DragState | null = null;
  let rafId = 0;
  let destroyed = false;

  const width = (): number => props.width ?? 200;
  const height = (): number => props.height ?? 130;

  // ── DOM: wrapper ──
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:absolute',
    'top:8px',
    'right:8px',
    'border-radius:8px',
    'backdrop-filter:blur(8px)',
    'z-index:10',
    'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
    'overflow:hidden',
  ].join(';');
  container.appendChild(wrapper);

  // ── DOM: canvas ──
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair;';
  canvas.setAttribute(
    'aria-label',
    'Minimap: click to pan, drag viewport rect to pan, drag outside to zoom to selection',
  );
  wrapper.appendChild(canvas);

  // ── DOM: buttons ──
  const btnZoomOut = createMiniButton('Zoom out', ZOOM_OUT_PATH);
  const btnZoomIn = createMiniButton('Zoom in', ZOOM_IN_PATH);
  const btnFit = createMiniButton('Fit', FIT_SCREEN_PATH);
  wrapper.appendChild(btnZoomOut);
  wrapper.appendChild(btnZoomIn);
  wrapper.appendChild(btnFit);

  // ── Cleanup registry ──
  const cleanupFns: (() => void)[] = [];

  function addListener<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type as string, handler as EventListener, options);
    cleanupFns.push(() =>
      target.removeEventListener(type as string, handler as EventListener, options),
    );
  }

  // ── Derived minimap transform (recomputed each draw / interaction) ──
  function computeTransform(): {
    bounds: ReturnType<typeof computeBounds>;
    mmScale: number;
    mmOffX: number;
    mmOffY: number;
  } {
    const w = width();
    const h = height();
    const bounds = computeBounds(props.nodes);
    const bw = bounds ? bounds.maxX - bounds.minX : 1;
    const bh = bounds ? bounds.maxY - bounds.minY : 1;
    const mmScale = Math.min(w / bw, h / bh);
    const mmOffX = (w - bw * mmScale) / 2 - (bounds?.minX ?? 0) * mmScale;
    const mmOffY = (h - bh * mmScale) / 2 - (bounds?.minY ?? 0) * mmScale;
    return { bounds, mmScale, mmOffX, mmOffY };
  }

  function toMinimap(wx: number, wy: number, mmScale: number, mmOffX: number, mmOffY: number): { x: number; y: number } {
    return { x: wx * mmScale + mmOffX, y: wy * mmScale + mmOffY };
  }

  function toWorld(mx: number, my: number, mmScale: number, mmOffX: number, mmOffY: number): { x: number; y: number } {
    return { x: (mx - mmOffX) / mmScale, y: (my - mmOffY) / mmScale };
  }

  // ── Viewport rect hit test ──
  function isInsideViewportRect(mx: number, my: number): boolean {
    const mainCanvas = props.mainCanvasRef.current;
    if (!mainCanvas) return false;
    const { mmScale, mmOffX, mmOffY } = computeTransform();
    const cw = mainCanvas.clientWidth;
    const ch = mainCanvas.clientHeight;
    const tl = screenToWorld(props.viewport, 0, 0);
    const br = screenToWorld(props.viewport, cw, ch);
    const p1 = toMinimap(tl.x, tl.y, mmScale, mmOffX, mmOffY);
    const p2 = toMinimap(br.x, br.y, mmScale, mmOffX, mmOffY);
    return mx >= p1.x && mx <= p2.x && my >= p1.y && my <= p2.y;
  }

  // ── hasMoved helper ──
  function hasMoved(d: DragState): boolean {
    return Math.abs(d.currentX - d.startX) > 3 || Math.abs(d.currentY - d.startY) > 3;
  }

  // ── Button styling ──
  function updateButtonStyles(): void {
    const isDark = props.isDark ?? true;
    const btnCss = [
      'position:absolute',
      'bottom:2px',
      'padding:2px',
      `color:${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'}`,
      `background-color:${isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'}`,
      'border-radius:4px',
    ].join(';');

    const hasFit = !!props.onFit;
    btnZoomOut.style.cssText = MINI_BTN_BASE_CSS + btnCss + `;right:${hasFit ? 50 : 26}px;`;
    btnZoomIn.style.cssText = MINI_BTN_BASE_CSS + btnCss + `;right:${hasFit ? 26 : 2}px;`;
    btnFit.style.cssText = MINI_BTN_BASE_CSS + btnCss + ';right:2px;';
    btnFit.style.display = hasFit ? '' : 'none';
  }

  // ── Wrapper sizing ──
  function updateWrapperSize(): void {
    const colors = getCanvasColors(props.isDark ?? true);
    wrapper.style.width = `${width()}px`;
    wrapper.style.height = `${height()}px`;
    wrapper.style.border = `1px solid ${colors.panelBorder}`;
  }

  // ── Draw ──
  function draw(): void {
    if (destroyed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (typeof requestAnimationFrame !== 'undefined') {
        rafId = requestAnimationFrame(draw);
      }
      return;
    }

    const w = width();
    const h = height();
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const isDark = props.isDark ?? true;
    const { bounds, mmScale, mmOffX, mmOffY } = computeTransform();

    // Background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(242,239,232,0.85)';
    ctx.fillRect(0, 0, w, h);

    if (!bounds) {
      rafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(draw) : 0;
      return;
    }

    // Nodes
    for (const n of props.nodes) {
      const { x, y } = toMinimap(n.x, n.y, mmScale, mmOffX, mmOffY);
      const nw = Math.max(n.width * mmScale, 2);
      const nh = Math.max(n.height * mmScale, 2);
      ctx.fillStyle = n.style.fill;
      ctx.strokeStyle = n.style.stroke;
      ctx.lineWidth = 0.5;
      ctx.fillRect(x, y, nw, nh);
      ctx.strokeRect(x, y, nw, nh);
    }

    // Viewport rect
    const mainCanvas = props.mainCanvasRef.current;
    if (mainCanvas) {
      const cw = mainCanvas.clientWidth;
      const ch = mainCanvas.clientHeight;
      const d = drag;
      const vp =
        d?.mode === 'viewport' && hasMoved(d)
          ? {
              ...props.viewport,
              offsetX: d.initialOffsetX - ((d.currentX - d.startX) / mmScale) * props.viewport.scale,
              offsetY: d.initialOffsetY - ((d.currentY - d.startY) / mmScale) * props.viewport.scale,
            }
          : props.viewport;
      const tl = screenToWorld(vp, 0, 0);
      const br = screenToWorld(vp, cw, ch);
      const p1 = toMinimap(tl.x, tl.y, mmScale, mmOffX, mmOffY);
      const p2 = toMinimap(br.x, br.y, mmScale, mmOffX, mmOffY);
      const vw = p2.x - p1.x;
      const vh = p2.y - p1.y;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeStyle =
        d?.mode === 'viewport' ? 'rgba(144,202,249,0.9)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p1.x, p1.y, vw, vh);
      ctx.strokeRect(p1.x, p1.y, vw, vh);
    }

    // Select drag rect (dashed)
    const d = drag;
    if (d?.mode === 'select' && hasMoved(d)) {
      const sx = Math.min(d.startX, d.currentX);
      const sy = Math.min(d.startY, d.currentY);
      const sw = Math.abs(d.currentX - d.startX);
      const sh = Math.abs(d.currentY - d.startY);
      ctx.fillStyle = 'rgba(144,202,249,0.15)';
      ctx.strokeStyle = 'rgba(144,202,249,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }

    rafId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(draw) : 0;
  }

  // ── Interaction helpers ──
  function getRelativePos(e: MouseEvent): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── Mouse handlers ──
  function handleMouseDown(e: MouseEvent): void {
    const pos = getRelativePos(e);
    if (!pos) return;
    if (isInsideViewportRect(pos.x, pos.y)) {
      drag = {
        mode: 'viewport',
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
        initialOffsetX: props.viewport.offsetX,
        initialOffsetY: props.viewport.offsetY,
      };
    } else {
      drag = {
        mode: 'select',
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
        initialOffsetX: 0,
        initialOffsetY: 0,
      };
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!drag) {
      // Update cursor based on hover position
      const pos = getRelativePos(e);
      if (pos) {
        canvas.style.cursor = isInsideViewportRect(pos.x, pos.y) ? 'move' : 'crosshair';
      }
      return;
    }
    const pos = getRelativePos(e);
    if (!pos) return;

    const d = drag;
    if (d.mode === 'viewport') {
      const { mmScale } = computeTransform();
      const dmx = pos.x - d.startX;
      const dmy = pos.y - d.startY;
      props.onViewportChange({
        ...props.viewport,
        offsetX: d.initialOffsetX - (dmx / mmScale) * props.viewport.scale,
        offsetY: d.initialOffsetY - (dmy / mmScale) * props.viewport.scale,
      });
    }
    drag = { ...d, currentX: pos.x, currentY: pos.y };
  }

  function handleMouseUp(e: MouseEvent): void {
    const mainCanvas = props.mainCanvasRef.current;
    if (!mainCanvas || !drag) {
      drag = null;
      return;
    }
    const cw = mainCanvas.clientWidth;
    const ch = mainCanvas.clientHeight;
    const d = drag;
    const { mmScale, mmOffX, mmOffY } = computeTransform();

    if (d.mode === 'viewport') {
      // mousemove already updated viewport
    } else if (hasMoved(d)) {
      const tl = toWorld(Math.min(d.startX, d.currentX), Math.min(d.startY, d.currentY), mmScale, mmOffX, mmOffY);
      const br = toWorld(Math.max(d.startX, d.currentX), Math.max(d.startY, d.currentY), mmScale, mmOffX, mmOffY);
      if (br.x > tl.x && br.y > tl.y) {
        props.onViewportChange(fitToContent(cw, ch, { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y }, 20));
      }
    } else {
      const pos = getRelativePos(e);
      if (pos) {
        const worldPos = toWorld(pos.x, pos.y, mmScale, mmOffX, mmOffY);
        props.onViewportChange({
          ...props.viewport,
          offsetX: cw / 2 - worldPos.x * props.viewport.scale,
          offsetY: ch / 2 - worldPos.y * props.viewport.scale,
        });
      }
    }
    drag = null;
  }

  function handleMouseLeave(): void {
    drag = null;
  }

  // ── Zoom button handlers ──
  function handleZoomIn(): void {
    const mainCanvas = props.mainCanvasRef.current;
    if (!mainCanvas) return;
    props.onViewportChange(
      zoom(props.viewport, mainCanvas.clientWidth / 2, mainCanvas.clientHeight / 2, -ZOOM_DELTA),
    );
  }

  function handleZoomOut(): void {
    const mainCanvas = props.mainCanvasRef.current;
    if (!mainCanvas) return;
    props.onViewportChange(
      zoom(props.viewport, mainCanvas.clientWidth / 2, mainCanvas.clientHeight / 2, ZOOM_DELTA),
    );
  }

  function handleFit(): void {
    props.onFit?.();
  }

  // ── Register listeners ──
  addListener(canvas, 'mousedown', handleMouseDown);
  addListener(canvas, 'mousemove', handleMouseMove);
  addListener(canvas, 'mouseup', handleMouseUp);
  addListener(canvas, 'mouseleave', handleMouseLeave);
  addListener(btnZoomIn, 'click', handleZoomIn);
  addListener(btnZoomOut, 'click', handleZoomOut);
  addListener(btnFit, 'click', handleFit);

  // ── Initial setup ──
  updateWrapperSize();
  updateButtonStyles();

  // ── Start render loop ──
  if (typeof requestAnimationFrame !== 'undefined') {
    rafId = requestAnimationFrame(draw);
  }

  // ── update / destroy ──
  function update(newProps: MinimapCanvasViewProps): void {
    props = newProps;
    updateWrapperSize();
    updateButtonStyles();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof cancelAnimationFrame !== 'undefined' && rafId !== 0) {
      cancelAnimationFrame(rafId);
    }
    for (const fn of cleanupFns) fn();
    wrapper.remove();
  }

  return { update, destroy };
}
