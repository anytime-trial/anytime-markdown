import type { DsmDiff, DsmMatrix, DsmCellState, CyclicPair } from '@anytime-markdown/c4-kernel';

export interface DsmViewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface DsmRenderOptions {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly viewport: DsmViewport;
  readonly data: DsmRenderData;
  readonly hoveredCell: { row: number; col: number } | null;
}

export type DsmRenderData =
  | { readonly type: 'single'; readonly matrix: DsmMatrix }
  | { readonly type: 'diff'; readonly diff: DsmDiff; readonly cyclicPairs: readonly CyclicPair[] };

const CELL_SIZE = 32;
const HEADER_WIDTH = 120;
const HEADER_HEIGHT = 120;

const COLORS: Record<DsmCellState, string> = {
  match: '#4CAF50',
  design_only: '#FFC107',
  impl_only: '#F44336',
  none: 'transparent',
};
const DIAGONAL_COLOR = '#333333';
const GRID_COLOR = '#3c3c3c';
const TEXT_COLOR = '#cccccc';
const HOVER_COLOR = 'rgba(255,255,255,0.08)';
const CYCLE_BORDER_COLOR = '#F44336';

function getNodeNames(data: DsmRenderData): readonly string[] {
  if (data.type === 'single') return data.matrix.nodes.map(n => n.name);
  return data.diff.nodes.map(n => n.name);
}

function getNodeCount(data: DsmRenderData): number {
  if (data.type === 'single') return data.matrix.nodes.length;
  return data.diff.nodes.length;
}

function getCellState(data: DsmRenderData, row: number, col: number): DsmCellState {
  if (data.type === 'single') {
    return data.matrix.adjacency[row][col] === 1 ? 'match' : 'none';
  }
  return data.diff.cells[row][col].state;
}

function getCyclicPairSet(data: DsmRenderData): Set<string> {
  const set = new Set<string>();
  if (data.type !== 'diff') return set;
  const nodes = data.diff.nodes;
  for (const pair of data.cyclicPairs) {
    const iA = nodes.findIndex(n => n.id === pair.nodeA);
    const iB = nodes.findIndex(n => n.id === pair.nodeB);
    if (iA >= 0 && iB >= 0) {
      set.add(`${iA},${iB}`);
      set.add(`${iB},${iA}`);
    }
  }
  return set;
}

/** Truncate label to fit within maxWidth */
function truncateLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}...`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
}

export function renderDsm(options: DsmRenderOptions): void {
  const { ctx, width, height, viewport, data, hoveredCell } = options;
  const n = getNodeCount(data);
  if (n === 0) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No DSM data available', width / 2, height / 2);
    return;
  }

  const names = getNodeNames(data);
  const cyclicSet = getCyclicPairSet(data);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(viewport.offsetX, viewport.offsetY);
  ctx.scale(viewport.scale, viewport.scale);

  const gridStartX = HEADER_WIDTH;
  const gridStartY = HEADER_HEIGHT;
  const gridW = n * CELL_SIZE;
  const gridH = n * CELL_SIZE;

  // --- Hovered row/col highlight ---
  if (hoveredCell) {
    ctx.fillStyle = HOVER_COLOR;
    // Highlight row
    ctx.fillRect(gridStartX, gridStartY + hoveredCell.row * CELL_SIZE, gridW, CELL_SIZE);
    // Highlight column
    ctx.fillRect(gridStartX + hoveredCell.col * CELL_SIZE, gridStartY, CELL_SIZE, gridH);
  }

  // --- Fill cells ---
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = gridStartX + col * CELL_SIZE;
      const y = gridStartY + row * CELL_SIZE;

      if (row === col) {
        ctx.fillStyle = DIAGONAL_COLOR;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        continue;
      }

      const state = getCellState(data, row, col);
      if (state !== 'none') {
        ctx.fillStyle = COLORS[state];
        ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }

      // Cyclic dependency border
      if (cyclicSet.has(`${row},${col}`)) {
        ctx.strokeStyle = CYCLE_BORDER_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
  }

  // --- Grid lines ---
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= n; i++) {
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(gridStartX, gridStartY + i * CELL_SIZE);
    ctx.lineTo(gridStartX + gridW, gridStartY + i * CELL_SIZE);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(gridStartX + i * CELL_SIZE, gridStartY);
    ctx.lineTo(gridStartX + i * CELL_SIZE, gridStartY + gridH);
    ctx.stroke();
  }

  // --- Row headers (left) ---
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const label = truncateLabel(ctx, names[i], HEADER_WIDTH - 8);
    ctx.fillText(label, HEADER_WIDTH - 4, gridStartY + i * CELL_SIZE + CELL_SIZE / 2);
  }

  // --- Column headers (top, rotated -45deg) ---
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const label = truncateLabel(ctx, names[i], HEADER_HEIGHT - 8);
    const cx = gridStartX + i * CELL_SIZE + CELL_SIZE / 2;
    const cy = HEADER_HEIGHT - 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/** Convert mouse coordinates to grid cell. Returns null if outside grid. */
export function hitTestCell(
  mouseX: number,
  mouseY: number,
  viewport: DsmViewport,
  nodeCount: number,
): { row: number; col: number } | null {
  // Convert screen coords to world coords
  const worldX = (mouseX - viewport.offsetX) / viewport.scale;
  const worldY = (mouseY - viewport.offsetY) / viewport.scale;

  const col = Math.floor((worldX - HEADER_WIDTH) / CELL_SIZE);
  const row = Math.floor((worldY - HEADER_HEIGHT) / CELL_SIZE);

  if (row < 0 || row >= nodeCount || col < 0 || col >= nodeCount) {
    return null;
  }

  return { row, col };
}
