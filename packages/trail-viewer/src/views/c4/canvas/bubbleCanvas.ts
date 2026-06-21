/**
 * BubbleCanvas vanilla factory — framework-free port of BubbleCanvas.tsx.
 *
 * Renders a zoomable/pannable scatter plot of BubblePoint data on a <canvas>.
 * All React state/ref/effect patterns are replaced with closure variables and
 * imperative DOM operations.
 */

import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import { PanPhysics } from '../../../c4/canvas/PanPhysics';
import type { ComplexityTier } from '../../../c4/components/panels/FunctionScatterPlot';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Public types (moved here from BubbleCanvas.tsx to avoid circular import)
// ---------------------------------------------------------------------------

export interface BubblePoint {
  readonly x: number;          // fanIn
  readonly y: number;          // fanOut
  readonly role: FunctionRole;
  readonly tier: ComplexityTier;
  readonly label: string;      // 関数名
  readonly file: string;       // ファイルパス
  readonly fanIn: number;
  readonly fanOut: number;
  readonly cc: number;
  readonly startLine: number;
}

export interface BubbleCanvasProps {
  readonly points: readonly BubblePoint[];
  readonly onPointClick?: (point: BubblePoint) => void;
  readonly height?: number | string;
  readonly focusPoint?: { readonly file: string; readonly label: string; readonly startLine: number } | null;
}

export interface BubbleCanvasViewProps {
  readonly points: readonly BubblePoint[];
  readonly onPointClick?: (point: BubblePoint) => void;
  readonly height?: number | string;
  readonly focusPoint?: { readonly file: string; readonly label: string; readonly startLine: number } | null;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants (verbatim from BubbleCanvas.tsx)
// ---------------------------------------------------------------------------

const PAN_SENSITIVITY = 0.7;

const ROLE_COLORS: Record<string, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const BASE_RADIUS: Record<string, number> = {
  low: 4,
  mid: 9,
  high: 16,
};

const ZOOM_LABEL_THRESHOLD = 3.0;
const LABEL_RADIUS_THRESHOLD = 12;
const HIT_PADDING = 4;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountBubbleCanvas(
  container: HTMLElement,
  initialProps: BubbleCanvasViewProps,
): VanillaViewHandle<BubbleCanvasViewProps> {
  // ── closure state ──
  let props = initialProps;
  let physics = new PanPhysics();
  let rafId = 0;

  // Hover / drag state
  let hovered: BubblePoint | null = null;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let dragVx = 0;
  let dragVy = 0;

  // Tour focus: resolved BubblePoint matching focusPoint prop
  let focusedPoint: BubblePoint | null = null;

  // ── DOM structure ──
  const heightVal = props.height ?? 400;
  const heightCss = typeof heightVal === 'number' ? `${heightVal}px` : heightVal;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative;width:100%;height:${heightCss}`;
  container.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab';
  wrapper.appendChild(canvas);

  // Tooltip element
  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;display:none;pointer-events:none;z-index:10;min-width:155px;' +
    'border-radius:7px;padding:9px 13px;font-size:11px;box-shadow:0 4px 16px rgba(0,0,0,0.45)';
  wrapper.appendChild(tooltip);

  // Fit button
  const fitBtn = document.createElement('button');
  fitBtn.setAttribute('aria-label', 'fit to data');
  fitBtn.style.cssText =
    'position:absolute;bottom:10px;right:10px;background:rgba(128,128,128,0.18);' +
    'color:rgba(128,128,128,0.8);border:1px solid rgba(128,128,128,0.22);border-radius:5px;' +
    'padding:4px 10px;font-size:11px;cursor:pointer;backdrop-filter:blur(4px);' +
    'user-select:none;line-height:1.4;';
  fitBtn.textContent = '⊙ Fit';
  wrapper.appendChild(fitBtn);

  // ── Tooltip helpers ──
  function updateTooltipColors(): void {
    const dark = props.isDark ?? false;
    tooltip.style.background = dark ? 'rgba(245,245,245,0.97)' : 'rgba(30,30,30,0.97)';
    tooltip.style.color = dark ? '#111' : '#eee';
  }

  function showTooltip(pt: BubblePoint, mx: number, my: number): void {
    const dark = props.isDark ?? false;
    updateTooltipColors();
    const shortFile = pt.file.split('/').slice(-2).join('/');
    const fileColor = dark ? '#666' : '#aaa';
    const statColor = dark ? '#444' : '#ccc';
    const roleColor = ROLE_COLORS[pt.role] ?? '#9e9e9e';
    tooltip.innerHTML =
      `<span style="font-weight:700;font-size:12px;color:${roleColor};display:block;margin-bottom:2px">${pt.role}</span>` +
      `<span style="font-weight:600;font-size:12px;display:block;margin-bottom:2px">${pt.label}</span>` +
      `<span style="color:${fileColor};font-size:10px;display:block;margin-bottom:4px">${shortFile}</span>` +
      `<span style="display:flex;gap:10px;font-size:10px;color:${statColor}">` +
      `<span>fanIn <b>${pt.fanIn}</b></span>` +
      `<span>fanOut <b>${pt.fanOut}</b></span>` +
      `<span>CC <b>${pt.cc}</b></span>` +
      `</span>`;
    tooltip.style.left = `${mx + 12}px`;
    tooltip.style.top = `${my + 12}px`;
    tooltip.style.display = 'block';
  }

  function hideTooltip(): void {
    tooltip.style.display = 'none';
  }

  // ── Draw function (verbatim logic from BubbleCanvas.tsx drawRef.current) ──
  function draw(ctx: CanvasRenderingContext2D): void {
    const dark = props.isDark ?? false;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const wPx = w * dpr;
    const hPx = h * dpr;
    if (canvas.width !== wPx || canvas.height !== hPx) {
      canvas.width = wPx;
      canvas.height = hPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { viewX, viewY, zoom } = physics;
    const pts = props.points;

    // Background
    ctx.fillStyle = dark ? '#0d1117' : '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Grid (subtle lines)
    const step = Math.pow(10, Math.ceil(Math.log10(80 / zoom)));
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.047)' : 'rgba(0,0,0,0.031)';
    ctx.lineWidth = 1;
    const gx0 = Math.floor(viewX / step) * step;
    const gy0 = Math.floor(viewY / step) * step;
    for (let gx = gx0; (gx - viewX) * zoom < w; gx += step) {
      const cx = (gx - viewX) * zoom;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    }
    for (let gy = gy0; (gy - viewY) * zoom < h; gy += step) {
      const cy = h - (gy - viewY) * zoom;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();
    }

    // ── Pass 1: bubble bodies ──
    const focused = focusedPoint;
    for (const pt of pts) {
      const cx = (pt.x - viewX) * zoom;
      const cy = h - (pt.y - viewY) * zoom;
      const r = (BASE_RADIUS[pt.tier] ?? 4) * Math.sqrt(zoom);
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;

      const isFocusTarget = focused != null && pt === focused;
      const alpha = focused == null ? 0.85 : isFocusTarget ? 1.0 : 0.18;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = ROLE_COLORS[pt.role] ?? '#9e9e9e';
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isFocusTarget) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(255,220,120,0.95)' : 'rgba(180,80,0,0.95)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(255,220,120,0.35)' : 'rgba(180,80,0,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (pt === hovered) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.31)' : 'rgba(0,0,0,0.31)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ── Pass 2: labels with greedy collision avoidance + zoom LOD ──
    if (zoom >= ZOOM_LABEL_THRESHOLD) {
      const dynamicRadiusThreshold = Math.max(LABEL_RADIUS_THRESHOLD, 24 / Math.sqrt(zoom));
      const labelCandidates = [...pts]
        .map((pt) => {
          const cx = (pt.x - viewX) * zoom;
          const cy = h - (pt.y - viewY) * zoom;
          const r = (BASE_RADIUS[pt.tier] ?? 4) * Math.sqrt(zoom);
          return { pt, cx, cy, r };
        })
        .filter(
          ({ cx, cy, r }) =>
            !(cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) &&
            r >= dynamicRadiusThreshold,
        )
        .sort((a, b) => b.r - a.r);

      const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];

      for (const { pt, cx, cy, r } of labelCandidates) {
        const fontSize = Math.min(11, r * 0.55);
        const fileSize = Math.min(9, r * 0.42);
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const maxChars = Math.max(3, Math.floor((r * 2) / (fontSize * 0.62)));
        const name = pt.label.length > maxChars ? pt.label.slice(0, maxChars - 1) + '…' : pt.label;
        const fname = pt.file.split('/').at(-1) ?? pt.file;
        const nameWidth = ctx.measureText(name).width;
        ctx.font = `${fileSize}px monospace`;
        const fnameWidth = ctx.measureText(fname).width;
        const labelW = Math.max(nameWidth, fnameWidth);
        const labelH = fontSize + fileSize + 4;
        const box = {
          x: cx - labelW / 2,
          y: cy - fontSize / 2,
          w: labelW,
          h: labelH,
        };
        const overlaps = labelBoxes.some(
          (b) =>
            !(
              box.x + box.w < b.x ||
              box.x > b.x + b.w ||
              box.y + box.h < b.y ||
              box.y > b.y + b.h
            ),
        );
        if (overlaps) continue;
        labelBoxes.push(box);

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillText(name, cx, cy + 1);
        ctx.font = `${fileSize}px monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(fname, cx, cy + fileSize + 3);
      }
    }

    // Axis labels (fixed screen-space)
    const axisColor = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    ctx.fillStyle = axisColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('← fanIn →', w / 2, h - 4);
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('← fanOut →', 0, 0);
    ctx.restore();

    // Zoom indicator
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`×${zoom.toFixed(1)}`, 30, h - 4);
  }

  // ── rAF helpers ──
  function scheduleLoop(): void {
    if (rafId !== 0) return;
    function loop(): void {
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx);
      const moving = physics.tick();
      if (moving || isDragging) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = 0;
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function requestDraw(): void {
    if (rafId !== 0) return;
    rafId = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx);
      rafId = 0;
    });
  }

  // ── Hit test (verbatim from BubbleCanvas.tsx) ──
  function hitTest(mouseX: number, mouseY: number, canvasH: number): BubblePoint | null {
    const { viewX, viewY, zoom } = physics;
    const pts = props.points;
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i];
      if (!pt) continue;
      const cx = (pt.x - viewX) * zoom;
      const cy = canvasH - (pt.y - viewY) * zoom;
      const r = (BASE_RADIUS[pt.tier] ?? 4) * Math.sqrt(zoom) + HIT_PADDING;
      const dx = mouseX - cx;
      const dy = mouseY - cy;
      if (dx * dx + dy * dy <= r * r) return pt;
    }
    return null;
  }

  // ── focusPoint resolver ──
  function resolveFocusPoint(): void {
    const fp = props.focusPoint;
    if (!fp) {
      focusedPoint = null;
      return;
    }
    const match = props.points.find(
      (p) => p.file === fp.file && p.label === fp.label && p.startLine === fp.startLine,
    );
    focusedPoint = match ?? null;
  }

  function applyFocusPoint(): void {
    resolveFocusPoint();
    if (!focusedPoint) {
      requestDraw();
      return;
    }
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof props.height === 'number' ? props.height : 400);
    const targetZoom = Math.max(8, Math.min(60, physics.zoom));
    const zoomRatio = targetZoom / physics.zoom;
    physics.zoomAt(zoomRatio, focusedPoint.x, focusedPoint.y);
    physics.viewX = focusedPoint.x - w / 2 / physics.zoom;
    physics.viewY = focusedPoint.y - h / 2 / physics.zoom;
    requestDraw();
  }

  // ── Initial fit ──
  function doFit(): void {
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof props.height === 'number' ? props.height : 400);
    physics.fitToData(props.points, w, h);
    requestDraw();
  }

  // Initial setup (deferred via rAF so canvas has layout dimensions)
  requestAnimationFrame(() => {
    doFit();
    resolveFocusPoint();
  });

  // ── Mouse event handlers ──
  function handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    isDragging = true;
    lastMouseX = e.clientX - rect.left;
    lastMouseY = e.clientY - rect.top;
    dragVx = 0;
    dragVy = 0;
    canvas.style.cursor = 'grabbing';
    scheduleLoop();
  }

  function handleMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasH = canvas.clientHeight;

    if (isDragging) {
      const dx = (mx - lastMouseX) * PAN_SENSITIVITY;
      const dy = (my - lastMouseY) * PAN_SENSITIVITY;
      dragVx = -dx / physics.zoom;
      dragVy = dy / physics.zoom;
      physics.pan(dx, dy);
      lastMouseX = mx;
      lastMouseY = my;
      return;
    }

    // Hover
    const hit = hitTest(mx, my, canvasH);
    if (hit !== hovered) {
      hovered = hit;
      if (hit) {
        showTooltip(hit, mx, my);
      } else {
        hideTooltip();
      }
      requestDraw();
    } else if (hit) {
      // Update tooltip position while hovering the same point
      tooltip.style.left = `${mx + 12}px`;
      tooltip.style.top = `${my + 12}px`;
    }
  }

  function handleMouseUp(): void {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    physics.applyImpulse(dragVx, dragVy);
    scheduleLoop();
  }

  function handleMouseLeave(): void {
    isDragging = false;
    canvas.style.cursor = 'grab';
    if (hovered !== null) {
      hovered = null;
      hideTooltip();
      requestDraw();
    }
  }

  function handleClick(e: MouseEvent): void {
    if (!props.onPointClick) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const canvasH = canvas.clientHeight;
    const hit = hitTest(mx, my, canvasH);
    if (hit) props.onPointClick(hit);
  }

  function handleFitClick(): void {
    physics.fitToData(props.points, canvas.clientWidth, canvas.clientHeight);
    requestDraw();
  }

  // ── Wheel handler (non-passive) ──
  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { viewX, viewY, zoom } = physics;
    const anchorDataX = mouseX / zoom + viewX;
    const anchorDataY = (canvas.clientHeight - mouseY) / zoom + viewY;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const newZoom = Math.max(0.05, Math.min(500, physics.zoom * factor));
    physics.zoomAt(newZoom / zoom, anchorDataX, anchorDataY);
    requestDraw();
  }

  // ── Register listeners ──
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  fitBtn.addEventListener('click', handleFitClick);

  // ── ResizeObserver (jsdom guard) ──
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      requestDraw();
    });
    resizeObserver.observe(wrapper);
  }

  // ---------------------------------------------------------------------------
  // VanillaViewHandle
  // ---------------------------------------------------------------------------

  function update(newProps: BubbleCanvasViewProps): void {
    const prevPoints = props.points;
    const prevHeight = props.height;
    const prevIsDark = props.isDark;
    const prevFocusPoint = props.focusPoint;
    props = newProps;

    // Update tooltip colors when theme changes
    if (newProps.isDark !== prevIsDark) {
      updateTooltipColors();
    }

    // Update wrapper height when height prop changes
    if (newProps.height !== prevHeight) {
      const hv = newProps.height ?? 400;
      wrapper.style.height = typeof hv === 'number' ? `${hv}px` : hv;
    }

    // Re-fit when points or height changed
    if (newProps.points !== prevPoints || newProps.height !== prevHeight) {
      const w = canvas.clientWidth || 600;
      const h = canvas.clientHeight || (typeof newProps.height === 'number' ? newProps.height : 400);
      physics.fitToData(newProps.points, w, h);
    }

    // Re-focus when focusPoint changed
    const fpChanged =
      newProps.focusPoint !== prevFocusPoint ||
      newProps.focusPoint?.file !== prevFocusPoint?.file ||
      newProps.focusPoint?.label !== prevFocusPoint?.label ||
      newProps.focusPoint?.startLine !== prevFocusPoint?.startLine;
    if (fpChanged) {
      applyFocusPoint();
      return;
    }

    requestDraw();
  }

  function destroy(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
    resizeObserver?.disconnect();
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('wheel', handleWheel);
    fitBtn.removeEventListener('click', handleFitClick);
    wrapper.remove();
  }

  return { update, destroy };
}
