/**
 * CoverageCanvas vanilla factory.
 *
 * Ports CoverageCanvas.tsx rendering + interaction to native DOM.
 * All draw logic is verbatim from the React source.
 */

import type { C4Model, C4Element, CoverageDiffMatrix, CoverageMatrix, CoverageEntry } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import {
  COVERAGE_HIGH,
  COVERAGE_LOW,
  COVERAGE_MID,
  COVERAGE_NONE,
  DELTA_NEGATIVE,
  DELTA_POSITIVE,
  getCoverageTextColor,
} from '../../../c4/c4MetricColors';
import { truncate, clampViewport as clampViewportBase } from '../../../c4/canvasHelpers';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CoverageCanvasProps {
  readonly coverageMatrix: CoverageMatrix;
  readonly coverageDiff?: CoverageDiffMatrix | null;
  readonly model: C4Model;
  readonly level?: number;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_W = 80;
const CELL_H = 28;
const ROW_HEADER_W = 180;
const COL_HEADER_H = 40;
const PAN_STEP = 20;

const METRIC_COLUMNS = ['Lines', 'Branches', 'Functions'] as const;

// ---------------------------------------------------------------------------
// Pure helpers (verbatim from React source)
// ---------------------------------------------------------------------------

function clampCoverageViewport(vp: { offsetX: number; offsetY: number; scale: number }) {
  return clampViewportBase(vp, ROW_HEADER_W, COL_HEADER_H);
}

function heatColor(pct: number): string {
  if (pct >= 80) return COVERAGE_HIGH;
  if (pct >= 50) return COVERAGE_MID;
  return COVERAGE_LOW;
}

function collectElements(elements: readonly C4Element[]): C4Element[] {
  const result: C4Element[] = [];
  for (const el of elements) {
    result.push(el);
    if (el.children) {
      result.push(...collectElements(el.children));
    }
  }
  return result;
}

interface GridRow {
  readonly id: string;
  readonly name: string;
  readonly entry: CoverageEntry;
}

function buildGrid(
  matrix: CoverageMatrix,
  model: C4Model,
  level?: number,
): { rows: readonly GridRow[] } {
  const allElements = collectElements(model.elements);
  const elementMap = new Map(allElements.map((e) => [e.id, e]));

  const allowedTypes: ReadonlySet<string> | null =
    level === 2 ? new Set(['container', 'containerDb']) :
    level === 3 ? new Set(['component']) :
    level === 4 ? new Set(['code']) :
    null;

  const rows: GridRow[] = [];
  for (const entry of matrix.entries) {
    if (allowedTypes) {
      const el = elementMap.get(entry.elementId);
      if (!el || !allowedTypes.has(el.type)) continue;
    }
    const el = elementMap.get(entry.elementId);
    const name = el?.name ?? entry.elementId;
    rows.push({ id: entry.elementId, name, entry });
  }

  return { rows };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountCoverageCanvas(
  container: HTMLElement,
  initialProps: CoverageCanvasProps,
): VanillaViewHandle<CoverageCanvasProps> {
  let props = initialProps;
  let destroyed = false;
  let rafId = 0;

  // Viewport / interaction state
  let viewport = { offsetX: 0, offsetY: 0, scale: 1 };
  let hovered: { row: number; col: number } | null = null;
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };
  let grid = buildGrid(props.coverageMatrix, props.model, props.level);
  let isFocused = false;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'coverage matrix');
  canvas.setAttribute('aria-label', `Coverage matrix with ${grid.rows.length} rows`);
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;outline:none;';
  wrapper.appendChild(canvas);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:fixed;display:none;padding:4px 8px;border-radius:4px;font-size:11px;pointer-events:none;z-index:100;';
  wrapper.appendChild(tooltip);

  container.appendChild(wrapper);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getColors() {
    return getC4Colors(props.isDark ?? true);
  }

  function getDiffMap() {
    if (!props.coverageDiff) return null;
    return new Map(props.coverageDiff.entries.map((e) => [e.elementId, e]));
  }

  function showTooltip(text: string, clientX: number, clientY: number): void {
    const colors = getColors();
    tooltip.textContent = text;
    tooltip.style.left = `${clientX + 12}px`;
    tooltip.style.top = `${clientY + 12}px`;
    tooltip.style.background = colors.tooltipBg;
    tooltip.style.color = colors.text;
    tooltip.style.border = `1px solid ${colors.tooltipBorder}`;
    tooltip.style.display = '';
  }

  function hideTooltip(): void {
    tooltip.style.display = 'none';
  }

  function hitTestCell(mouseX: number, mouseY: number): { row: number; col: number } | null {
    if (mouseX < ROW_HEADER_W || mouseY < COL_HEADER_H) return null;
    const worldX = (mouseX - viewport.offsetX) / viewport.scale;
    const worldY = (mouseY - viewport.offsetY) / viewport.scale;
    const col = Math.floor((worldX - ROW_HEADER_W) / CELL_W);
    const row = Math.floor((worldY - COL_HEADER_H) / CELL_H);
    if (row < 0 || row >= grid.rows.length || col < 0 || col >= METRIC_COLUMNS.length) {
      return null;
    }
    return { row, col };
  }

  // ---------------------------------------------------------------------------
  // Draw loop
  // ---------------------------------------------------------------------------

  function draw(): void {
    if (destroyed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafId = requestAnimationFrame(draw);
      return;
    }

    const colors = getColors();
    const diffMap = getDiffMap();
    const { rows } = grid;
    const nRows = rows.length;
    const nCols = METRIC_COLUMNS.length;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const vp = viewport;
    const s = vp.scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (nRows === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText('No coverage data available.', 20, 40);
      rafId = requestAnimationFrame(draw);
      return;
    }

    // Cell area (panned & zoomed, clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ROW_HEADER_W, COL_HEADER_H, w - ROW_HEADER_W, h - COL_HEADER_H);
    ctx.clip();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(s, s);

    // Grid lines
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= nCols; c++) {
      const x = ROW_HEADER_W + c * CELL_W;
      ctx.beginPath();
      ctx.moveTo(x, COL_HEADER_H);
      ctx.lineTo(x, COL_HEADER_H + nRows * CELL_H);
      ctx.stroke();
    }
    for (let r = 0; r <= nRows; r++) {
      const y = COL_HEADER_H + r * CELL_H;
      ctx.beginPath();
      ctx.moveTo(ROW_HEADER_W, y);
      ctx.lineTo(ROW_HEADER_W + nCols * CELL_W, y);
      ctx.stroke();
    }

    // Cells with heatmap
    const cellFontSize = Math.max(8, Math.min(12, 10 * s));
    ctx.font = `bold ${cellFontSize / s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < nRows; r++) {
      const entry = rows[r].entry;
      const metrics = [entry.lines, entry.branches, entry.functions];

      for (let c = 0; c < nCols; c++) {
        const metric = metrics[c];
        const x = ROW_HEADER_W + c * CELL_W;
        const y = COL_HEADER_H + r * CELL_H;

        const hasCoverage = metric.total > 0;
        const pct = hasCoverage ? metric.pct : -1;

        ctx.fillStyle = hasCoverage ? heatColor(pct) : COVERAGE_NONE;
        ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

        const baseLabel = hasCoverage ? `${Math.round(pct)}%` : '-';
        let deltaLabel = '';
        let deltaColor = '';

        if (hasCoverage && diffMap) {
          const diffEntry = diffMap.get(rows[r].entry.elementId);
          if (diffEntry) {
            const metricKeys = ['lines', 'branches', 'functions'] as const;
            const d = diffEntry[metricKeys[c]].pctDelta;
            if (d > 0) {
              deltaLabel = ` +${Math.round(d)}`;
              deltaColor = DELTA_POSITIVE;
            } else if (d < 0) {
              deltaLabel = ` ${Math.round(d)}`;
              deltaColor = DELTA_NEGATIVE;
            }
          }
        }

        ctx.fillStyle = hasCoverage ? getCoverageTextColor(pct) : colors.textSecondary;
        if (deltaLabel) {
          ctx.fillText(baseLabel, x + CELL_W / 2 - 8, y + CELL_H / 2);
          const baseWidth = ctx.measureText(baseLabel).width;
          ctx.fillStyle = deltaColor;
          ctx.textAlign = 'left';
          ctx.fillText(deltaLabel, x + CELL_W / 2 - 8 + baseWidth / 2 + 2, y + CELL_H / 2);
          ctx.textAlign = 'center';
        } else {
          ctx.fillText(baseLabel, x + CELL_W / 2, y + CELL_H / 2);
        }
      }
    }

    // Hover highlight
    if (hovered && hovered.row < nRows && hovered.col < nCols) {
      ctx.fillStyle = colors.hover;
      ctx.fillRect(ROW_HEADER_W, COL_HEADER_H + hovered.row * CELL_H, nCols * CELL_W, CELL_H);
      ctx.fillRect(ROW_HEADER_W + hovered.col * CELL_W, COL_HEADER_H, CELL_W, nRows * CELL_H);
    }

    ctx.restore();

    // Row headers (fixed left)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, COL_HEADER_H, ROW_HEADER_W, h - COL_HEADER_H);
    ctx.clip();

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, COL_HEADER_H, ROW_HEADER_W, h - COL_HEADER_H);

    const fontSize = Math.max(6, Math.min(12, 10 * s));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.text;

    for (let r = 0; r < nRows; r++) {
      const name = truncate(rows[r].name, 22);
      const rowY = (COL_HEADER_H + r * CELL_H + CELL_H / 2) * s + vp.offsetY;
      ctx.fillText(name, ROW_HEADER_W - 4, rowY);
    }

    ctx.restore();

    // Column headers (fixed top)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ROW_HEADER_W, 0, w - ROW_HEADER_W, COL_HEADER_H);
    ctx.clip();

    ctx.fillStyle = colors.bg;
    ctx.fillRect(ROW_HEADER_W, 0, w - ROW_HEADER_W, COL_HEADER_H);

    ctx.fillStyle = colors.text;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';

    for (let c = 0; c < nCols; c++) {
      const colX = (ROW_HEADER_W + c * CELL_W + CELL_W / 2) * s + vp.offsetX;
      ctx.fillText(METRIC_COLUMNS[c], colX, COL_HEADER_H - 4);
    }

    ctx.restore();

    // Corner background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, ROW_HEADER_W, COL_HEADER_H);

    // Legend in corner
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const legendItems = [
      { label: '≥ 80%', color: COVERAGE_HIGH },
      { label: '50-80%', color: COVERAGE_MID },
      { label: '< 50%', color: COVERAGE_LOW },
    ];
    for (let i = 0; i < legendItems.length; i++) {
      const lx = 8 + i * 60;
      ctx.fillStyle = legendItems[i].color;
      ctx.fillRect(lx, 10, 10, 10);
      ctx.fillStyle = colors.text;
      ctx.font = '9px sans-serif';
      ctx.fillText(legendItems[i].label, lx + 13, 15);
    }

    // Title
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = colors.textSecondary;
    ctx.fillText('Coverage', 8, COL_HEADER_H - 8);

    // Focus ring
    canvas.style.boxShadow = isFocused ? `inset 0 0 0 2px ${colors.focusRing}` : 'none';

    rafId = requestAnimationFrame(draw);
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    rafId = requestAnimationFrame(draw);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleMouseMove(e: MouseEvent): void {
    if (isPanning) {
      const dx = e.clientX - lastPan.x;
      const dy = e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      viewport = clampCoverageViewport({
        ...viewport,
        offsetX: viewport.offsetX + dx,
        offsetY: viewport.offsetY + dy,
      });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const cell = hitTestCell(e.clientX - rect.left, e.clientY - rect.top);
    hovered = cell;

    if (cell) {
      const row = grid.rows[cell.row];
      const metricName = METRIC_COLUMNS[cell.col];
      const metrics = [row.entry.lines, row.entry.branches, row.entry.functions];
      const metric = metrics[cell.col];
      const pctText = metric.total > 0 ? `${Math.round(metric.pct)}%` : 'N/A';
      const detail = metric.total > 0 ? ` (${metric.covered}/${metric.total})` : '';
      showTooltip(`${row.name} — ${metricName}: ${pctText}${detail}`, e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  }

  function handleMouseDown(e: MouseEvent): void {
    if (e.button === 0 || e.button === 1) {
      isPanning = true;
      lastPan = { x: e.clientX, y: e.clientY };
    }
  }

  function handleMouseUp(): void {
    isPanning = false;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const vp = viewport;
    switch (e.key) {
      case 'ArrowUp': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, offsetY: vp.offsetY + PAN_STEP }); break; }
      case 'ArrowDown': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, offsetY: vp.offsetY - PAN_STEP }); break; }
      case 'ArrowLeft': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, offsetX: vp.offsetX + PAN_STEP }); break; }
      case 'ArrowRight': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, offsetX: vp.offsetX - PAN_STEP }); break; }
      case '+':
      case '=': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, scale: vp.scale * 1.1 }); break; }
      case '-': { e.preventDefault(); viewport = clampCoverageViewport({ ...vp, scale: vp.scale * 0.9 }); break; }
    }
  }

  function handleWheel(e: WheelEvent): void {
    if (e.shiftKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vp = viewport;
      viewport = clampCoverageViewport({
        scale: vp.scale * factor,
        offsetX: mx - (mx - vp.offsetX) * factor,
        offsetY: my - (my - vp.offsetY) * factor,
      });
    } else {
      e.preventDefault();
      const vp = viewport;
      viewport = clampCoverageViewport({ ...vp, offsetY: vp.offsetY - e.deltaY });
    }
  }

  function handleFocus(): void {
    isFocused = true;
  }

  function handleBlur(): void {
    isFocused = false;
    canvas.style.boxShadow = 'none';
  }

  function handleMouseLeave(): void {
    isPanning = false;
    hovered = null;
    hideTooltip();
  }

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('focus', handleFocus);
  canvas.addEventListener('blur', handleBlur);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { /* draw loop picks up new size */ });
    resizeObserver.observe(canvas);
  }

  // ---------------------------------------------------------------------------
  // Handle
  // ---------------------------------------------------------------------------

  function update(newProps: CoverageCanvasProps): void {
    const prevMatrix = props.coverageMatrix;
    const prevModel = props.model;
    const prevLevel = props.level;
    props = newProps;

    if (
      newProps.coverageMatrix !== prevMatrix ||
      newProps.model !== prevModel ||
      newProps.level !== prevLevel
    ) {
      grid = buildGrid(newProps.coverageMatrix, newProps.model, newProps.level);
      viewport = { offsetX: 0, offsetY: 0, scale: 1 };
      hovered = null;
      hideTooltip();
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
    resizeObserver?.disconnect();
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('keydown', handleKeyDown);
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('focus', handleFocus);
    canvas.removeEventListener('blur', handleBlur);
    wrapper.remove();
  }

  return { update, destroy };
}
