/**
 * HeatmapCanvas vanilla factory.
 *
 * Ports HeatmapCanvas.tsx to native DOM.
 * Single-shot draw: redraws on mount and on each update call.
 * Fixed-size canvas (not 100%): set from cssWidth/cssHeight.
 */

import type { HeatmapAxis, HeatmapMatrix } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { truncate } from '../../../c4/canvasHelpers';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props / exported types
// ---------------------------------------------------------------------------

export type HeatmapColorScale = 'amber' | 'sumi';

export interface HeatmapCanvasProps {
  readonly matrix: HeatmapMatrix;
  readonly colorScale: HeatmapColorScale;
  readonly selectedElementId?: string | null;
  readonly onCellClick?: (column: HeatmapAxis) => void;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL = 24;
const ROW_HEADER = 160;
const COL_HEADER = 80;
const LEGEND_WIDTH = 60;
const FOOTER_HEIGHT = 28;
const COL_LABEL_ROTATION = -Math.PI / 4;

// ---------------------------------------------------------------------------
// Pure color helpers (verbatim from React source)
// ---------------------------------------------------------------------------

interface ColorBase {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly minAlpha: number;
  readonly maxAlpha: number;
}

const AMBER_BASE: ColorBase = { r: 232, g: 160, b: 18, minAlpha: 0.05, maxAlpha: 1.0 };
const SUMI_BASE: ColorBase = { r: 31, g: 30, b: 28, minAlpha: 0.08, maxAlpha: 0.85 };

function pickColorBase(scale: HeatmapColorScale): ColorBase {
  return scale === 'amber' ? AMBER_BASE : SUMI_BASE;
}

function cellColor(value: number, maxValue: number, base: ColorBase): string {
  if (value <= 0 || maxValue <= 0) return 'transparent';
  const t = Math.min(1, value / maxValue);
  const alpha = base.minAlpha + (base.maxAlpha - base.minAlpha) * t;
  return `rgba(${base.r}, ${base.g}, ${base.b}, ${alpha.toFixed(3)})`;
}

function gridColor(isDark: boolean): string {
  return isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
}

function textColor(isDark: boolean): string {
  return isDark ? 'rgba(255, 255, 255, 0.78)' : 'rgba(0, 0, 0, 0.78)';
}

function selectionColor(isDark: boolean): string {
  return isDark ? '#7a8eff' : '#3554d1';
}

// ---------------------------------------------------------------------------
// Pure draw functions (verbatim from React source)
// ---------------------------------------------------------------------------

function drawColumnLabels(
  ctx: CanvasRenderingContext2D,
  columns: readonly HeatmapAxis[],
  isDark: boolean,
): void {
  ctx.save();
  ctx.fillStyle = textColor(isDark);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < columns.length; i++) {
    const x = ROW_HEADER + i * CELL + CELL / 2;
    ctx.save();
    ctx.translate(x, COL_HEADER - 4);
    ctx.rotate(COL_LABEL_ROTATION);
    ctx.textAlign = 'left';
    ctx.fillText(truncate(columns[i].label, 18), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawRowLabels(
  ctx: CanvasRenderingContext2D,
  rows: readonly HeatmapAxis[],
  isDark: boolean,
): void {
  ctx.save();
  ctx.fillStyle = textColor(isDark);
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < rows.length; i++) {
    const y = COL_HEADER + i * CELL + CELL / 2;
    ctx.fillText(truncate(rows[i].label, 22), ROW_HEADER - 6, y);
  }
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  rows: number,
  cols: number,
  isDark: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = gridColor(isDark);
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= rows; i++) {
    const y = COL_HEADER + i * CELL;
    ctx.beginPath();
    ctx.moveTo(ROW_HEADER, y);
    ctx.lineTo(ROW_HEADER + cols * CELL, y);
    ctx.stroke();
  }
  for (let j = 0; j <= cols; j++) {
    const x = ROW_HEADER + j * CELL;
    ctx.beginPath();
    ctx.moveTo(x, COL_HEADER);
    ctx.lineTo(x, COL_HEADER + rows * CELL);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  matrix: HeatmapMatrix,
  base: ColorBase,
): void {
  const maxValue = Math.max(matrix.maxValue, 1);
  for (const cell of matrix.cells) {
    const x = ROW_HEADER + cell.colIndex * CELL;
    const y = COL_HEADER + cell.rowIndex * CELL;
    ctx.fillStyle = cellColor(cell.value, maxValue, base);
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  }
}

function drawSelectionColumn(
  ctx: CanvasRenderingContext2D,
  matrix: HeatmapMatrix,
  selectedElementId: string | null | undefined,
  isDark: boolean,
): void {
  if (!selectedElementId) return;
  const colIndex = matrix.columns.findIndex((c) => c.id === selectedElementId);
  if (colIndex < 0) return;
  ctx.save();
  ctx.strokeStyle = selectionColor(isDark);
  ctx.lineWidth = 2;
  const x = ROW_HEADER + colIndex * CELL;
  const y = COL_HEADER;
  ctx.strokeRect(x, y, CELL, matrix.rows.length * CELL);
  ctx.restore();
}

interface HoverState {
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly value: number;
  readonly clientX: number;
  readonly clientY: number;
}

function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  matrix: HeatmapMatrix,
  hover: HoverState | null,
  isDark: boolean,
): void {
  if (!hover) return;
  ctx.save();
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(ROW_HEADER, COL_HEADER + hover.rowIndex * CELL, matrix.columns.length * CELL, CELL);
  ctx.fillRect(ROW_HEADER + hover.colIndex * CELL, COL_HEADER, CELL, matrix.rows.length * CELL);
  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  base: ColorBase,
  rowsLen: number,
  cols: number,
  isDark: boolean,
): void {
  const x = ROW_HEADER + cols * CELL + 12;
  const y = COL_HEADER;
  const height = Math.max(120, rowsLen * CELL);
  const grad = ctx.createLinearGradient(0, y, 0, y + height);
  grad.addColorStop(0, `rgba(${base.r}, ${base.g}, ${base.b}, ${base.maxAlpha})`);
  grad.addColorStop(1, `rgba(${base.r}, ${base.g}, ${base.b}, ${base.minAlpha})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, 16, height);
  ctx.strokeStyle = gridColor(isDark);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, 16, height);
  ctx.fillStyle = textColor(isDark);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('high', x + 20, y);
  ctx.fillText('low', x + 20, y + height - 10);
  ctx.restore();
}

function hitTest(
  matrix: HeatmapMatrix,
  cssX: number,
  cssY: number,
): { rowIndex: number; colIndex: number } | null {
  if (cssX < ROW_HEADER || cssY < COL_HEADER) return null;
  const colIndex = Math.floor((cssX - ROW_HEADER) / CELL);
  const rowIndex = Math.floor((cssY - COL_HEADER) / CELL);
  if (colIndex < 0 || colIndex >= matrix.columns.length) return null;
  if (rowIndex < 0 || rowIndex >= matrix.rows.length) return null;
  return { rowIndex, colIndex };
}

function findCellValue(matrix: HeatmapMatrix, rowIndex: number, colIndex: number): number {
  for (const cell of matrix.cells) {
    if (cell.rowIndex === rowIndex && cell.colIndex === colIndex) return cell.value;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountHeatmapCanvas(
  container: HTMLElement,
  initialProps: HeatmapCanvasProps,
): VanillaViewHandle<HeatmapCanvasProps> {
  let props = initialProps;
  let destroyed = false;
  let hover: HoverState | null = null;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Activity heatmap');
  wrapper.style.cssText = 'position:relative;overflow:auto;max-width:100%;max-height:100%;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;cursor:default;';
  wrapper.appendChild(canvas);

  const tooltip = document.createElement('div');
  tooltip.setAttribute('role', 'tooltip');
  tooltip.style.cssText =
    'position:fixed;display:none;padding:4px 8px;border-radius:4px;font-size:11px;pointer-events:none;z-index:1000;';
  wrapper.appendChild(tooltip);

  container.appendChild(wrapper);

  // ---------------------------------------------------------------------------
  // Draw (single-shot)
  // ---------------------------------------------------------------------------

  function draw(): void {
    if (destroyed) return;

    const { matrix, colorScale, selectedElementId, isDark = false } = props;
    const base = pickColorBase(colorScale);

    const cssWidth = ROW_HEADER + matrix.columns.length * CELL + LEGEND_WIDTH;
    const cssHeight = COL_HEADER + matrix.rows.length * CELL + FOOTER_HEIGHT;

    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.cursor = hover ? 'pointer' : 'default';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    drawHoverHighlight(ctx, matrix, hover, isDark);
    drawCells(ctx, matrix, base);
    drawGrid(ctx, matrix.rows.length, matrix.columns.length, isDark);
    drawColumnLabels(ctx, matrix.columns, isDark);
    drawRowLabels(ctx, matrix.rows, isDark);
    drawSelectionColumn(ctx, matrix, selectedElementId ?? null, isDark);
    drawLegend(ctx, base, matrix.rows.length, matrix.columns.length, isDark);
  }

  // Initial draw
  draw();

  // ---------------------------------------------------------------------------
  // Tooltip helpers
  // ---------------------------------------------------------------------------

  function showTooltip(h: HoverState): void {
    const { matrix, isDark = false } = props;
    const c4Colors = getC4Colors(isDark);
    tooltip.textContent = `${matrix.rows[h.rowIndex].label} × ${matrix.columns[h.colIndex].label}: ${h.value}`;
    tooltip.style.left = `${h.clientX + 12}px`;
    tooltip.style.top = `${h.clientY + 12}px`;
    tooltip.style.background = c4Colors.heatmapTooltipBg;
    tooltip.style.color = c4Colors.heatmapTooltipText;
    tooltip.style.border = `1px solid ${c4Colors.heatmapTooltipBorder}`;
    tooltip.style.display = '';
  }

  function hideTooltip(): void {
    tooltip.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const hit = hitTest(props.matrix, cssX, cssY);
    if (!hit) {
      hover = null;
      hideTooltip();
      draw();
      return;
    }
    hover = {
      rowIndex: hit.rowIndex,
      colIndex: hit.colIndex,
      value: findCellValue(props.matrix, hit.rowIndex, hit.colIndex),
      clientX: e.clientX,
      clientY: e.clientY,
    };
    showTooltip(hover);
    draw();
  }

  function handleMouseLeave(): void {
    hover = null;
    hideTooltip();
    draw();
  }

  function handleClick(e: MouseEvent): void {
    if (!props.onCellClick) return;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const hit = hitTest(props.matrix, cssX, cssY);
    if (!hit) return;
    props.onCellClick(props.matrix.columns[hit.colIndex]);
  }

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleClick);

  // ---------------------------------------------------------------------------
  // Handle
  // ---------------------------------------------------------------------------

  function update(newProps: HeatmapCanvasProps): void {
    props = newProps;
    // If matrix changed, clear hover state
    hover = null;
    hideTooltip();
    draw();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('click', handleClick);
    wrapper.remove();
  }

  return { update, destroy };
}
