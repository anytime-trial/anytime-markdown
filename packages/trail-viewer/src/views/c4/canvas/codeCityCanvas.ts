/**
 * CodeCity canvas vanilla factory.
 *
 * Ports CodeCityCanvas.tsx (React) to framework-free DOM + Canvas code.
 * Follows the VanillaViewHandle<P> contract used by graphCanvas.ts.
 */

import { PanPhysics } from '../../../c4/canvas/PanPhysics';
import { groupByCommunity } from '../../../c4/canvas/communityGroup';
import {
  axonometricProject,
  computeCityLayout,
  type BlockLayout,
  type BuildingLayout,
} from '../../../c4/canvas/codeCityLayout';
import type { FunctionAnalysisApiEntry } from '../../../c4/hooks/fetchFunctionAnalysisApi';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props / handle
// ---------------------------------------------------------------------------

export interface CodeCityCanvasViewProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly height?: number | string;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_COLORS: Readonly<Record<string, string>> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const PAN_SENSITIVITY = 0.7;

// ---------------------------------------------------------------------------
// Pure helpers (ported verbatim from CodeCityCanvas.tsx)
// ---------------------------------------------------------------------------

/**
 * Multiply each RGB channel by `factor` (clamped to 0..255) to lighten or
 * darken a hex color. Used to shade the three visible faces of a building.
 */
function shadeHex(hex: string, factor: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const raw = m[1]!;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const cap = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return `rgb(${cap(r)}, ${cap(g)}, ${cap(b)})`;
}

/**
 * Point-in-quadrilateral test using cross-product approach.
 * The quad must be convex; we feed it the projected top face (always a
 * parallelogram in screen space — convex by construction).
 */
function pointInQuad(
  mx: number,
  my: number,
  q0: { sx: number; sy: number },
  q1: { sx: number; sy: number },
  q2: { sx: number; sy: number },
  q3: { sx: number; sy: number },
): boolean {
  const sign = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    px: number,
    py: number,
  ): number => (px - bx) * (ay - by) - (ax - bx) * (py - by);

  const d1 = sign(q0.sx, q0.sy, q1.sx, q1.sy, mx, my);
  const d2 = sign(q1.sx, q1.sy, q2.sx, q2.sy, mx, my);
  const d3 = sign(q2.sx, q2.sy, q3.sx, q3.sy, mx, my);
  const d4 = sign(q3.sx, q3.sy, q0.sx, q0.sy, mx, my);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0 || d4 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0 || d4 > 0;
  return !(hasNeg && hasPos);
}

// ---------------------------------------------------------------------------
// Tooltip state type
// ---------------------------------------------------------------------------

interface TooltipState {
  readonly building: BuildingLayout;
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Derived data helper
// ---------------------------------------------------------------------------

function computeOrderedBuildings(
  blocks: readonly BlockLayout[],
): { b: BuildingLayout; blockId: string }[] {
  const out: { b: BuildingLayout; blockId: string }[] = [];
  for (const block of blocks) {
    for (const b of block.buildings) out.push({ b, blockId: block.id });
  }
  out.sort((a, b) => a.b.bx + a.b.by - (b.b.bx + b.b.by));
  return out;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountCodeCityCanvas(
  container: HTMLElement,
  initialProps: CodeCityCanvasViewProps,
): VanillaViewHandle<CodeCityCanvasViewProps> {
  // ── Closure state ──────────────────────────────────────────────────────────
  let props = initialProps;
  let blocks: readonly BlockLayout[] = computeCityLayout(groupByCommunity(initialProps.entries));
  let orderedBuildings: { b: BuildingLayout; blockId: string }[] = computeOrderedBuildings(blocks);

  const physics = new PanPhysics();
  let rafId = 0;
  let isDragging = false;
  let lastMouse = { x: 0, y: 0 };
  let dragVx = 0;
  let dragVy = 0;
  let hovered: BuildingLayout | null = null;
  let tooltipState: TooltipState | null = null;
  let destroyed = false;

  // ── DOM ───────────────────────────────────────────────────────────────────
  const heightVal = initialProps.height ?? 400;
  const heightCss = typeof heightVal === 'number' ? `${heightVal}px` : heightVal;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative;width:100%;height:${heightCss}`;
  container.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab';
  wrapper.appendChild(canvas);

  const tooltipEl = document.createElement('div');
  tooltipEl.style.cssText =
    'position:absolute;display:none;pointer-events:none;z-index:10;border-radius:4px;padding:4px 8px;font-size:11px;max-width:320px';
  wrapper.appendChild(tooltipEl);

  // ── Tooltip helpers ────────────────────────────────────────────────────────

  function showTooltip(state: TooltipState): void {
    const dark = props.isDark ?? false;
    tooltipEl.style.display = 'block';
    tooltipEl.style.top = `${state.y + 12}px`;
    tooltipEl.style.left = `${state.x + 12}px`;
    tooltipEl.style.background = dark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.96)';
    tooltipEl.style.color = dark ? '#fff' : '#222';
    tooltipEl.style.border = `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`;

    const roleColor = ROLE_COLORS[state.building.entry.functionRole] ?? '#9e9e9e';
    const detailColor = dark ? '#888' : '#666';
    const metaColor = dark ? '#aaa' : '#555';

    tooltipEl.innerHTML = [
      `<span style="font-weight:700;font-size:12px;color:${roleColor};display:block;margin-bottom:2px">${escapeHtml(state.building.entry.functionRole)}</span>`,
      `<span style="font-weight:600;font-size:12px;display:block;margin-bottom:2px">${escapeHtml(state.building.entry.functionName)}</span>`,
      `<span style="color:${detailColor};font-size:10px;display:block;margin-bottom:4px">${escapeHtml(state.building.entry.filePath)}</span>`,
      `<span style="display:flex;gap:10px;font-size:10px;color:${metaColor}">`,
      `<span>lines <b>${state.building.entry.lineCount}</b></span>`,
      `<span>CC <b>${state.building.entry.cognitiveComplexity}</b></span>`,
      `<span>block <b>${escapeHtml(state.blockId)}</b></span>`,
      `</span>`,
    ].join('');
  }

  function hideTooltip(): void {
    tooltipEl.style.display = 'none';
  }

  function updateTooltipPosition(x: number, y: number): void {
    tooltipEl.style.top = `${y + 12}px`;
    tooltipEl.style.left = `${x + 12}px`;
  }

  function escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  // ── Initial fit ────────────────────────────────────────────────────────────

  function fitToBlocks(currentBlocks: readonly BlockLayout[]): void {
    if (currentBlocks.length === 0) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const block of currentBlocks) {
      xs.push(block.blockX);
      xs.push(block.blockX + block.blockSize);
      ys.push(block.blockY);
      ys.push(block.blockY + block.blockSize);
    }
    const canvasW = canvas.clientWidth || 600;
    const heightProp = props.height ?? 400;
    const canvasH = canvas.clientHeight || (typeof heightProp === 'number' ? heightProp : 400);
    physics.fitToData(
      xs.map((x, i) => ({ x, y: ys[Math.floor(i / 2) * 2 + (i % 2)]! })),
      canvasW,
      canvasH,
      80,
    );
  }

  fitToBlocks(blocks);

  // ── Draw function (ported verbatim from CodeCityCanvas.tsx drawRef.current) ──

  function draw(cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const dark = props.isDark ?? false;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    const w = cvs.clientWidth;
    const h = cvs.clientHeight;
    if (w === 0 || h === 0) return;

    // canvas.width/height への代入は同値でもバッキングビットマップを破棄するため
    // サイズ変化時のみ再設定する。
    const wPx = w * dpr;
    const hPx = h * dpr;
    if (cvs.width !== wPx || cvs.height !== hPx) {
      cvs.width = wPx;
      cvs.height = hPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { viewX, viewY, zoom } = physics;
    const currentHovered = hovered;

    // ── Background: sky gradient ────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (dark) {
      bgGrad.addColorStop(0, '#0d1b2a');
      bgGrad.addColorStop(1, '#000511');
    } else {
      bgGrad.addColorStop(0, '#aac8e4');
      bgGrad.addColorStop(1, '#e8eef5');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Helper: world (x,y,z) → screen (px relative to canvas center)
    const cx = w / 2;
    const cy = h * 0.65; // ground line near vertical middle, slightly below
    const project = (x: number, y: number, z: number) => {
      const tx = (x - viewX) * zoom;
      const ty = (y - viewY) * zoom;
      const tz = z * zoom;
      const p = axonometricProject(tx, ty, tz);
      return { sx: cx + p.sx, sy: cy + p.sy };
    };

    // ── Ground plane: aggregate block bounds ────────────────────────────────
    if (blocks.length > 0) {
      let gMinX = Infinity;
      let gMaxX = -Infinity;
      let gMinY = Infinity;
      let gMaxY = -Infinity;
      for (const block of blocks) {
        gMinX = Math.min(gMinX, block.blockX - 20);
        gMaxX = Math.max(gMaxX, block.blockX + block.blockSize + 20);
        gMinY = Math.min(gMinY, block.blockY - 20);
        gMaxY = Math.max(gMaxY, block.blockY + block.blockSize + 20);
      }
      const g0 = project(gMinX, gMinY, 0);
      const g1 = project(gMaxX, gMinY, 0);
      const g2 = project(gMaxX, gMaxY, 0);
      const g3 = project(gMinX, gMaxY, 0);
      ctx.fillStyle = dark ? 'rgba(40, 50, 60, 0.5)' : 'rgba(220, 220, 220, 0.6)';
      ctx.beginPath();
      ctx.moveTo(g0.sx, g0.sy);
      ctx.lineTo(g1.sx, g1.sy);
      ctx.lineTo(g2.sx, g2.sy);
      ctx.lineTo(g3.sx, g3.sy);
      ctx.closePath();
      ctx.fill();
    }

    // ── Block tiles (city blocks as rectangles on the ground) ──────────────
    for (const block of blocks) {
      const x0 = block.blockX;
      const y0 = block.blockY;
      const x1 = block.blockX + block.blockSize;
      const y1 = block.blockY + block.blockSize;
      const p0 = project(x0, y0, 0);
      const p1 = project(x1, y0, 0);
      const p2 = project(x1, y1, 0);
      const p3 = project(x0, y1, 0);
      ctx.fillStyle = dark ? 'rgba(30, 40, 50, 0.8)' : 'rgba(200, 200, 210, 0.8)';
      ctx.strokeStyle = dark ? 'rgba(80, 100, 120, 0.5)' : 'rgba(120, 130, 140, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p3.sx, p3.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // ── Buildings (Painter's order: back to front) ──────────────────────────
    for (const { b, blockId } of orderedBuildings) {
      const halfF = b.footprint / 2;
      const base = ROLE_COLORS[b.entry.functionRole] ?? '#9e9e9e';

      // 8 vertices: g0..g3 ground (NW,NE,SE,SW), t0..t3 top
      const g0 = project(b.bx - halfF, b.by - halfF, 0);
      const g1 = project(b.bx + halfF, b.by - halfF, 0);
      const g2 = project(b.bx + halfF, b.by + halfF, 0);
      const g3 = project(b.bx - halfF, b.by + halfF, 0);
      const t0 = project(b.bx - halfF, b.by - halfF, b.height);
      const t1 = project(b.bx + halfF, b.by - halfF, b.height);
      const t2 = project(b.bx + halfF, b.by + halfF, b.height);
      const t3 = project(b.bx - halfF, b.by + halfF, b.height);

      // Cull if entirely off-canvas
      const xs = [t0.sx, t1.sx, t2.sx, t3.sx, g2.sx];
      const ys = [t0.sy, t1.sy, t2.sy, t3.sy, g2.sy];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (maxX < 0 || minX > w || maxY < 0 || minY > h) {
        // Keep ordering; skip drawing
        continue;
      }

      const isHovered = b === currentHovered;
      const lighten = isHovered ? 1.3 : 1.0;

      // Front face (south, +y side): g3, g2, t2, t3
      ctx.fillStyle = shadeHex(base, 0.85 * lighten);
      ctx.beginPath();
      ctx.moveTo(g3.sx, g3.sy);
      ctx.lineTo(g2.sx, g2.sy);
      ctx.lineTo(t2.sx, t2.sy);
      ctx.lineTo(t3.sx, t3.sy);
      ctx.closePath();
      ctx.fill();

      // Right face (east, +x side): g1, g2, t2, t1
      ctx.fillStyle = shadeHex(base, 0.65 * lighten);
      ctx.beginPath();
      ctx.moveTo(g1.sx, g1.sy);
      ctx.lineTo(g2.sx, g2.sy);
      ctx.lineTo(t2.sx, t2.sy);
      ctx.lineTo(t1.sx, t1.sy);
      ctx.closePath();
      ctx.fill();

      // Top face: t0, t1, t2, t3
      ctx.fillStyle = shadeHex(base, 1.1 * lighten);
      ctx.beginPath();
      ctx.moveTo(t0.sx, t0.sy);
      ctx.lineTo(t1.sx, t1.sy);
      ctx.lineTo(t2.sx, t2.sy);
      ctx.lineTo(t3.sx, t3.sy);
      ctx.closePath();
      ctx.fill();

      // Outline (subtle)
      ctx.strokeStyle = isHovered
        ? dark
          ? 'rgba(255, 220, 120, 0.9)'
          : 'rgba(80, 40, 0, 0.7)'
        : dark
          ? 'rgba(0, 0, 0, 0.4)'
          : 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = isHovered ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(t0.sx, t0.sy);
      ctx.lineTo(t1.sx, t1.sy);
      ctx.lineTo(t2.sx, t2.sy);
      ctx.lineTo(t3.sx, t3.sy);
      ctx.closePath();
      ctx.stroke();

      // blockId is used in the tooltip; suppress unused-variable lint for this loop
      void blockId;
    }

    // ── HUD ────────────────────────────────────────────────────────────────
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `×${zoom.toFixed(1)}  ${blocks.length} blocks  ${orderedBuildings.length} buildings`,
      8,
      h - 4,
    );
  }

  // ── rAF helpers ───────────────────────────────────────────────────────────

  function scheduleLoop(): void {
    if (rafId !== 0) return;
    const loop = () => {
      if (destroyed) return;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(canvas, ctx);
      const moving = physics.tick();
      if (moving || isDragging) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = 0;
      }
    };
    rafId = requestAnimationFrame(loop);
  }

  function requestDraw(): void {
    if (rafId !== 0) return;
    rafId = requestAnimationFrame(() => {
      if (destroyed) return;
      const ctx = canvas.getContext('2d');
      if (ctx) draw(canvas, ctx);
      rafId = 0;
    });
  }

  // ── Hit test (reverse Painter's order: front-most first) ─────────────────

  function hitTest(
    mx: number,
    my: number,
    canvasW: number,
    canvasH: number,
  ): { b: BuildingLayout; blockId: string } | null {
    const { viewX, viewY, zoom } = physics;
    const cx = canvasW / 2;
    const cy = canvasH * 0.65;
    const project = (x: number, y: number, z: number) => {
      const p = axonometricProject((x - viewX) * zoom, (y - viewY) * zoom, z * zoom);
      return { sx: cx + p.sx, sy: cy + p.sy };
    };

    for (let i = orderedBuildings.length - 1; i >= 0; i--) {
      const item = orderedBuildings[i]!;
      const b = item.b;
      const halfF = b.footprint / 2;
      const t0 = project(b.bx - halfF, b.by - halfF, b.height);
      const t1 = project(b.bx + halfF, b.by - halfF, b.height);
      const t2 = project(b.bx + halfF, b.by + halfF, b.height);
      const t3 = project(b.bx - halfF, b.by + halfF, b.height);
      const minX = Math.min(t0.sx, t1.sx, t2.sx, t3.sx);
      const maxX = Math.max(t0.sx, t1.sx, t2.sx, t3.sx);
      const minY = Math.min(t0.sy, t1.sy, t2.sy, t3.sy);
      const maxY = Math.max(t0.sy, t1.sy, t2.sy, t3.sy);
      if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
        if (pointInQuad(mx, my, t0, t1, t2, t3)) return item;
      }
    }
    return null;
  }

  // ── Mouse handlers (named functions for removeEventListener) ─────────────

  function handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    isDragging = true;
    lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragVx = 0;
    dragVy = 0;
    canvas.style.cursor = 'grabbing';
    scheduleLoop();
  }

  function handleMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    if (isDragging) {
      const dx = (mx - lastMouse.x) * PAN_SENSITIVITY;
      const dy = (my - lastMouse.y) * PAN_SENSITIVITY;
      dragVx = -dx / physics.zoom;
      dragVy = dy / physics.zoom;
      physics.pan(dx, dy);
      lastMouse = { x: mx, y: my };
      return;
    }

    const hit = hitTest(mx, my, cw, ch);
    if (hit?.b !== hovered) {
      hovered = hit?.b ?? null;
      if (hit) {
        tooltipState = { building: hit.b, blockId: hit.blockId, x: mx, y: my };
        showTooltip(tooltipState);
      } else {
        tooltipState = null;
        hideTooltip();
      }
      requestDraw();
    } else if (hit && tooltipState) {
      tooltipState = { ...tooltipState, x: mx, y: my };
      updateTooltipPosition(mx, my);
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
      tooltipState = null;
      hideTooltip();
      requestDraw();
    }
  }

  function handleClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTest(mx, my, canvas.clientWidth, canvas.clientHeight);
    if (hit) {
      props.onFunctionOpen?.(hit.b.entry.filePath, hit.b.entry.functionName, hit.b.entry.startLine);
    }
  }

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

  // ── Register listeners ────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // ── ResizeObserver (jsdom guard) ──────────────────────────────────────────
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      requestDraw();
    });
    ro.observe(wrapper);
  }

  // Initial draw
  requestDraw();

  // ── update / destroy ──────────────────────────────────────────────────────

  function update(newProps: CodeCityCanvasViewProps): void {
    const prevEntries = props.entries;
    const prevHeight = props.height;
    props = newProps;

    if (newProps.entries !== prevEntries) {
      blocks = computeCityLayout(groupByCommunity(newProps.entries));
      orderedBuildings = computeOrderedBuildings(blocks);
      fitToBlocks(blocks);
    }

    if (newProps.height !== prevHeight) {
      const newHeightVal = newProps.height ?? 400;
      const newHeightCss = typeof newHeightVal === 'number' ? `${newHeightVal}px` : newHeightVal;
      wrapper.style.height = newHeightCss;
    }

    requestDraw();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('wheel', handleWheel);
    ro?.disconnect();
    wrapper.remove();
  }

  return { update, destroy };
}
