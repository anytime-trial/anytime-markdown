/**
 * DsmCanvas vanilla factory.
 *
 * Ports DsmCanvas.tsx rendering + interaction to native DOM.
 * All draw functions are verbatim from the React source.
 */

import type { C4Model, DsmMatrix } from '@anytime-markdown/trail-core/c4';
import { clusterMatrix, detectCycles } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { truncate, clampViewport } from '../../../c4/canvasHelpers';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DsmCanvasProps {
  readonly matrix: DsmMatrix | null;
  readonly fullModel?: C4Model;
  readonly clustered: boolean;
  readonly focusedNodeId?: string | null;
  readonly scopeIds?: ReadonlySet<string> | null;
  readonly deletedIds?: ReadonlySet<string>;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 32;
const HEADER_WIDTH = 120;
const HEADER_HEIGHT = 120;
const PAN_STEP = 20;
const DELETED_TEXT_ALPHA = 0.4;
const SCOPE_BORDER_WIDTH = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type C4Colors = ReturnType<typeof getC4Colors>;

// ---------------------------------------------------------------------------
// Pure draw helpers (verbatim from React source)
// ---------------------------------------------------------------------------

function buildDeletedIndices(
  nodes: DsmMatrix['nodes'],
  deletedIds: ReadonlySet<string> | undefined,
): Set<number> {
  const set = new Set<number>();
  if (!deletedIds) return set;
  for (let i = 0; i < nodes.length; i++) {
    if (deletedIds.has(nodes[i].id)) {
      set.add(i);
    }
  }
  return set;
}

function buildScopeRanges(scopeIndices: number[]): { start: number; end: number }[] {
  const sorted = [...scopeIndices].sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  if (sorted.length === 0) return ranges;

  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push({ start: rangeStart, end: rangeEnd });
  return ranges;
}

function drawGridLines(ctx: CanvasRenderingContext2D, n: number, colors: C4Colors): void {
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= n; i++) {
    const x = HEADER_WIDTH + i * CELL_SIZE;
    const y = HEADER_HEIGHT + i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, HEADER_HEIGHT);
    ctx.lineTo(x, HEADER_HEIGHT + n * CELL_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(HEADER_WIDTH, y);
    ctx.lineTo(HEADER_WIDTH + n * CELL_SIZE, y);
    ctx.stroke();
  }
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  deletedIndices: Set<number>,
  cyclicSet: Set<string>,
  colors: C4Colors,
): void {
  const n = matrix.nodes.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = HEADER_WIDTH + j * CELL_SIZE;
      const y = HEADER_HEIGHT + i * CELL_SIZE;
      const isDeletedCell = deletedIndices.has(i) || deletedIndices.has(j);

      if (isDeletedCell) ctx.globalAlpha = colors.deletedAlpha;

      if (i === j) {
        ctx.fillStyle = colors.diagonal;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        if (isDeletedCell) ctx.globalAlpha = 1;
        continue;
      }

      if (matrix.adjacency[i][j] === 1) {
        ctx.fillStyle = colors.dependency;
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }

      const key = `${matrix.nodes[i].id}:${matrix.nodes[j].id}`;
      if (cyclicSet.has(key) && matrix.adjacency[i][j] === 1) {
        ctx.strokeStyle = colors.cycleBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.lineWidth = 0.5;
      }

      if (isDeletedCell) ctx.globalAlpha = 1;
    }
  }
}

function drawGroupBorders(
  ctx: CanvasRenderingContext2D,
  groupBorders: number[],
  n: number,
  colors: C4Colors,
): void {
  if (groupBorders.length === 0) return;
  ctx.strokeStyle = colors.groupLine;
  ctx.lineWidth = 2;
  for (const bi of groupBorders) {
    const gx = HEADER_WIDTH + bi * CELL_SIZE;
    const gy = HEADER_HEIGHT + bi * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(gx, HEADER_HEIGHT);
    ctx.lineTo(gx, HEADER_HEIGHT + n * CELL_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(HEADER_WIDTH, gy);
    ctx.lineTo(HEADER_WIDTH + n * CELL_SIZE, gy);
    ctx.stroke();
  }
  ctx.lineWidth = 0.5;
}

function drawFocusHighlight(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  focusedNodeId: string | null | undefined,
  colors: C4Colors,
): void {
  if (!focusedNodeId) return;
  const n = matrix.nodes.length;
  const focusIdx = matrix.nodes.findIndex((nd) => nd.id === focusedNodeId || nd.name === focusedNodeId);
  if (focusIdx < 0) return;
  ctx.fillStyle = colors.focus;
  ctx.fillRect(HEADER_WIDTH, HEADER_HEIGHT + focusIdx * CELL_SIZE, n * CELL_SIZE, CELL_SIZE);
  ctx.fillRect(HEADER_WIDTH + focusIdx * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, n * CELL_SIZE);
}

function drawScopeHighlight(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  scopeIds: ReadonlySet<string> | null | undefined,
  colors: C4Colors,
): void {
  if (!scopeIds || scopeIds.size === 0) return;
  const n = matrix.nodes.length;
  const scopeIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (scopeIds.has(matrix.nodes[i].id)) {
      scopeIndices.push(i);
    }
  }
  if (scopeIndices.length === 0) return;

  const ranges = buildScopeRanges(scopeIndices);
  ctx.strokeStyle = colors.scopeBorder;
  ctx.lineWidth = SCOPE_BORDER_WIDTH;
  for (const range of ranges) {
    const sx = HEADER_WIDTH + range.start * CELL_SIZE;
    const sy = HEADER_HEIGHT + range.start * CELL_SIZE;
    const sw = (range.end - range.start + 1) * CELL_SIZE;
    ctx.strokeRect(sx, sy, sw, sw);
  }
  ctx.lineWidth = 0.5;
}

function drawHoverHighlight(
  ctx: CanvasRenderingContext2D,
  hovered: { row: number; col: number } | null,
  n: number,
  colors: C4Colors,
): void {
  if (!hovered) return;
  ctx.fillStyle = colors.hover;
  ctx.fillRect(HEADER_WIDTH, HEADER_HEIGHT + hovered.row * CELL_SIZE, n * CELL_SIZE, CELL_SIZE);
  ctx.fillRect(HEADER_WIDTH + hovered.col * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, n * CELL_SIZE);
}

function drawRowHeaders(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  vp: { offsetX: number; offsetY: number; scale: number },
  focusIdx: number,
  deletedIds: ReadonlySet<string> | undefined,
  colors: C4Colors,
  h: number,
): void {
  const n = matrix.nodes.length;
  const s = vp.scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HEADER_HEIGHT, HEADER_WIDTH, h - HEADER_HEIGHT);
  ctx.clip();

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, HEADER_HEIGHT, HEADER_WIDTH, h - HEADER_HEIGHT);

  const fontSize = Math.max(6, Math.min(14, 10 * s));
  const labelFont = `${fontSize}px sans-serif`;

  ctx.font = labelFont;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (let i = 0; i < n; i++) {
    const name = truncate(matrix.nodes[i].name, 14);
    const rowY = (HEADER_HEIGHT + i * CELL_SIZE + CELL_SIZE / 2) * s + vp.offsetY;
    const isDeleted = deletedIds?.has(matrix.nodes[i].id);

    if (isDeleted) ctx.globalAlpha = DELETED_TEXT_ALPHA;
    ctx.fillStyle = i === focusIdx ? colors.accent : colors.text;
    if (i === focusIdx) ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(name, HEADER_WIDTH - 4, rowY);

    if (isDeleted) {
      const textWidth = ctx.measureText(name).width;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(HEADER_WIDTH - 4 - textWidth, rowY);
      ctx.lineTo(HEADER_WIDTH - 4, rowY);
      ctx.stroke();
    }

    if (i === focusIdx) ctx.font = labelFont;
    if (isDeleted) ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawColHeaders(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  vp: { offsetX: number; offsetY: number; scale: number },
  deletedIds: ReadonlySet<string> | undefined,
  colors: C4Colors,
  w: number,
  fontSize: number,
  labelFont: string,
): void {
  const n = matrix.nodes.length;
  const s = vp.scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(HEADER_WIDTH, 0, w - HEADER_WIDTH, HEADER_HEIGHT);
  ctx.clip();

  ctx.fillStyle = colors.bg;
  ctx.fillRect(HEADER_WIDTH, 0, w - HEADER_WIDTH, HEADER_HEIGHT);

  ctx.fillStyle = colors.text;
  ctx.font = labelFont;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const name = truncate(matrix.nodes[i].name, 14);
    const colX = (HEADER_WIDTH + i * CELL_SIZE + CELL_SIZE / 2) * s + vp.offsetX;
    const isDeleted = deletedIds?.has(matrix.nodes[i].id);

    if (isDeleted) ctx.globalAlpha = DELETED_TEXT_ALPHA;

    ctx.save();
    ctx.translate(colX, HEADER_HEIGHT - 4);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'left';
    ctx.fillText(name, 0, 0);

    if (isDeleted) {
      const textWidth = ctx.measureText(name).width;
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(textWidth, 0);
      ctx.stroke();
    }

    ctx.restore();
    if (isDeleted) ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function hitTestCell(
  mouseX: number,
  mouseY: number,
  viewport: { offsetX: number; offsetY: number; scale: number },
  nodeCount: number,
): { row: number; col: number } | null {
  if (mouseX < HEADER_WIDTH || mouseY < HEADER_HEIGHT) return null;
  const worldX = (mouseX - viewport.offsetX) / viewport.scale;
  const worldY = (mouseY - viewport.offsetY) / viewport.scale;
  const col = Math.floor((worldX - HEADER_WIDTH) / CELL_SIZE);
  const row = Math.floor((worldY - HEADER_HEIGHT) / CELL_SIZE);
  if (row < 0 || row >= nodeCount || col < 0 || col >= nodeCount) return null;
  return { row, col };
}

function clampDsmViewport(vp: { offsetX: number; offsetY: number; scale: number }) {
  return clampViewport(vp, HEADER_WIDTH, HEADER_HEIGHT);
}

// ---------------------------------------------------------------------------
// Matrix build helper
// ---------------------------------------------------------------------------

interface BuiltMatrix {
  matrix: DsmMatrix;
  cyclicSet: Set<string>;
  groupBorders: number[];
}

function buildMatrix(inputMatrix: DsmMatrix, fullModel: C4Model | undefined, clustered: boolean): BuiltMatrix {
  const matrix = clustered ? clusterMatrix(inputMatrix) : inputMatrix;

  const sccs = detectCycles(matrix.adjacency, matrix.nodes.map((n) => n.id));
  const cyclicSet = new Set<string>();
  for (const scc of sccs) {
    for (let i = 0; i < scc.length; i++) {
      for (let j = i + 1; j < scc.length; j++) {
        cyclicSet.add(`${scc[i]}:${scc[j]}`);
        cyclicSet.add(`${scc[j]}:${scc[i]}`);
      }
    }
  }

  let groupBorders: number[] = [];
  if (!clustered && fullModel) {
    const elementById = new Map(fullModel.elements.map((e) => [e.id, e]));
    const borders: number[] = [];
    for (let i = 1; i < matrix.nodes.length; i++) {
      const prevEl = elementById.get(matrix.nodes[i - 1].id);
      const currEl = elementById.get(matrix.nodes[i].id);
      if (prevEl?.boundaryId !== currEl?.boundaryId) {
        borders.push(i);
      }
    }
    groupBorders = borders;
  }

  return { matrix, cyclicSet, groupBorders };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountDsmCanvas(
  container: HTMLElement,
  initialProps: DsmCanvasProps,
): VanillaViewHandle<DsmCanvasProps> {
  let props = initialProps;
  let destroyed = false;
  let rafId = 0;

  // Viewport / interaction state
  let viewport = { offsetX: 0, offsetY: 0, scale: 1 };
  let hoveredCell: { row: number; col: number } | null = null;
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };
  let isFocused = false;

  // Built matrix state
  let built: BuiltMatrix | null =
    props.matrix ? buildMatrix(props.matrix, props.fullModel, props.clustered) : null;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'dependency structure matrix');
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

  function showTooltip(text: string, clientX: number, clientY: number): void {
    const colors = getC4Colors(props.isDark ?? true);
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

  function scrollToFocusedNode(): void {
    if (!props.focusedNodeId || !built) return;
    const matrix = built.matrix;
    const idx = matrix.nodes.findIndex(
      (nd) => nd.id === props.focusedNodeId || nd.name === props.focusedNodeId,
    );
    if (idx < 0) return;

    const vp = viewport;
    const s = vp.scale;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const cellCenterX = HEADER_WIDTH + (idx + 0.5) * CELL_SIZE;
    const cellCenterY = HEADER_HEIGHT + (idx + 0.5) * CELL_SIZE;
    const visibleCenterX = HEADER_WIDTH + (w - HEADER_WIDTH) / 2;
    const visibleCenterY = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;

    viewport = clampDsmViewport({
      scale: s,
      offsetX: visibleCenterX - cellCenterX * s,
      offsetY: visibleCenterY - cellCenterY * s,
    });
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

    const colors = getC4Colors(props.isDark ?? true);

    if (!built) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText('No data. Import a C4 model first.', 20, 40);
      rafId = requestAnimationFrame(draw);
      return;
    }

    const { matrix, cyclicSet, groupBorders } = built;
    const n = matrix.nodes.length;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const vp = viewport;
    const s = vp.scale;
    const fontSize = Math.max(6, Math.min(14, 10 * s));
    const labelFont = `${fontSize}px sans-serif`;
    const focusIdx = props.focusedNodeId
      ? matrix.nodes.findIndex(
          (nd) => nd.id === props.focusedNodeId || nd.name === props.focusedNodeId,
        )
      : -1;
    const deletedIndices = buildDeletedIndices(matrix.nodes, props.deletedIds);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (n === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText('No data. Import a C4 model first.', 20, 40);
      rafId = requestAnimationFrame(draw);
      return;
    }

    // Cell area (panned & zoomed, clipped)
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEADER_WIDTH, HEADER_HEIGHT, w - HEADER_WIDTH, h - HEADER_HEIGHT);
    ctx.clip();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(s, s);

    drawGridLines(ctx, n, colors);
    drawCells(ctx, matrix, deletedIndices, cyclicSet, colors);
    drawGroupBorders(ctx, groupBorders, n, colors);
    drawFocusHighlight(ctx, matrix, props.focusedNodeId, colors);
    drawScopeHighlight(ctx, matrix, props.scopeIds, colors);
    drawHoverHighlight(ctx, hoveredCell, n, colors);

    ctx.restore();

    drawRowHeaders(ctx, matrix, vp, focusIdx, props.deletedIds, colors, h);
    drawColHeaders(ctx, matrix, vp, props.deletedIds, colors, w, fontSize, labelFont);

    // Corner background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);

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
      viewport = clampDsmViewport({
        ...viewport,
        offsetX: viewport.offsetX + dx,
        offsetY: viewport.offsetY + dy,
      });
      return;
    }

    if (!built) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cell = hitTestCell(mx, my, viewport, built.matrix.nodes.length);
    hoveredCell = cell;

    if (cell) {
      const rowName = built.matrix.nodes[cell.row].name;
      const colName = built.matrix.nodes[cell.col].name;
      showTooltip(`${rowName} → ${colName}`, e.clientX, e.clientY);
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

  function handleMouseLeave(): void {
    isPanning = false;
    hoveredCell = null;
    hideTooltip();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const vp = viewport;
    switch (e.key) {
      case 'ArrowUp': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, offsetY: vp.offsetY + PAN_STEP }); break; }
      case 'ArrowDown': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, offsetY: vp.offsetY - PAN_STEP }); break; }
      case 'ArrowLeft': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, offsetX: vp.offsetX + PAN_STEP }); break; }
      case 'ArrowRight': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, offsetX: vp.offsetX - PAN_STEP }); break; }
      case '+':
      case '=': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, scale: vp.scale * 1.1 }); break; }
      case '-': { e.preventDefault(); viewport = clampDsmViewport({ ...vp, scale: vp.scale * 0.9 }); break; }
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
      viewport = clampDsmViewport({
        scale: vp.scale * factor,
        offsetX: mx - (mx - vp.offsetX) * factor,
        offsetY: my - (my - vp.offsetY) * factor,
      });
    } else {
      e.preventDefault();
      const vp = viewport;
      viewport = clampDsmViewport({ ...vp, offsetY: vp.offsetY - e.deltaY });
    }
  }

  function handleFocus(): void {
    isFocused = true;
  }

  function handleBlur(): void {
    isFocused = false;
    canvas.style.boxShadow = 'none';
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

  function update(newProps: DsmCanvasProps): void {
    const prevMatrix = props.matrix;
    const prevFullModel = props.fullModel;
    const prevClustered = props.clustered;
    const prevFocusedNodeId = props.focusedNodeId;
    props = newProps;

    // Rebuild matrix if inputs changed
    if (
      newProps.matrix !== prevMatrix ||
      newProps.fullModel !== prevFullModel ||
      newProps.clustered !== prevClustered
    ) {
      if (newProps.matrix) {
        built = buildMatrix(newProps.matrix, newProps.fullModel, newProps.clustered);
      } else {
        built = null;
      }
      viewport = { offsetX: 0, offsetY: 0, scale: 1 };
      hoveredCell = null;
      hideTooltip();
    }

    // Scroll to focused node if it changed
    if (newProps.focusedNodeId !== prevFocusedNodeId) {
      scrollToFocusedNode();
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
