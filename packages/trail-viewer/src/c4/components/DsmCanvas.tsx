import type { C4Model, DsmMatrix } from '@anytime-markdown/trail-core/c4';
import { clusterMatrix, detectCycles } from '@anytime-markdown/trail-core/c4';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getC4Colors } from '../c4Theme';

interface DsmCanvasProps {
  readonly matrix: DsmMatrix | null;
  readonly fullModel?: C4Model;
  readonly clustered: boolean;
  readonly focusedNodeId?: string | null;
  /** 選択スコープに含まれるノードID。太枠で囲む */
  readonly scopeIds?: ReadonlySet<string> | null;
  /** 削除フラグ付き要素のIDセット */
  readonly deletedIds?: ReadonlySet<string>;
  readonly isDark?: boolean;
}

// --- Constants ---

const CELL_SIZE = 32;
const HEADER_WIDTH = 120;
const HEADER_HEIGHT = 120;

const PAN_STEP = 20;
const DELETED_TEXT_ALPHA = 0.4;

import { truncate, clampViewport } from '../canvasHelpers';

/** 削除済みノードのインデックスセットを構築する */
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

/** スコープインデックスを連続範囲にまとめる */
function buildScopeRanges(
  scopeIndices: number[],
): { start: number; end: number }[] {
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

type C4Colors = ReturnType<typeof import('../c4Theme').getC4Colors>;

interface DrawCellAreaParams {
  ctx: CanvasRenderingContext2D;
  matrix: DsmMatrix;
  vp: { offsetX: number; offsetY: number; scale: number };
  hovered: { row: number; col: number } | null;
  cyclicSet: Set<string>;
  groupBorders: number[];
  focusedNodeId: string | null | undefined;
  scopeIds: ReadonlySet<string> | null | undefined;
  deletedIds: ReadonlySet<string> | undefined;
  colors: C4Colors;
  w: number;
  h: number;
}

/** グリッド線を描画する */
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

/** セル（対角・依存関係・サイクル）を描画する */
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

/** グループ境界線を描画する */
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

/** フォーカスハイライトを描画する */
function drawFocusHighlight(
  ctx: CanvasRenderingContext2D,
  matrix: DsmMatrix,
  focusedNodeId: string | null | undefined,
  colors: C4Colors,
): void {
  if (!focusedNodeId) return;
  const n = matrix.nodes.length;
  const focusIdx = matrix.nodes.findIndex(nd => nd.id === focusedNodeId || nd.name === focusedNodeId);
  if (focusIdx < 0) return;
  ctx.fillStyle = colors.focus;
  ctx.fillRect(HEADER_WIDTH, HEADER_HEIGHT + focusIdx * CELL_SIZE, n * CELL_SIZE, CELL_SIZE);
  ctx.fillRect(HEADER_WIDTH + focusIdx * CELL_SIZE, HEADER_HEIGHT, CELL_SIZE, n * CELL_SIZE);
}

/** スコープハイライト（太枠）を描画する */
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

/** ホバーハイライトを描画する */
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

/** 行ヘッダーを描画する */
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

/** 列ヘッダーを描画する */
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
  // Headers are fixed; cells start at HEADER_WIDTH/HEADER_HEIGHT in screen space
  if (mouseX < HEADER_WIDTH || mouseY < HEADER_HEIGHT) return null;
  const worldX = (mouseX - viewport.offsetX) / viewport.scale;
  const worldY = (mouseY - viewport.offsetY) / viewport.scale;
  const col = Math.floor((worldX - HEADER_WIDTH) / CELL_SIZE);
  const row = Math.floor((worldY - HEADER_HEIGHT) / CELL_SIZE);
  if (row < 0 || row >= nodeCount || col < 0 || col >= nodeCount) return null;
  return { row, col };
}

/** ビューポートを制限し、セル左上角がヘッダー領域を超えないようにする */
function clampDsmViewport(vp: { offsetX: number; offsetY: number; scale: number }) {
  return clampViewport(vp, HEADER_WIDTH, HEADER_HEIGHT);
}

// --- Component ---

const SCOPE_BORDER_WIDTH = 3;

export function DsmCanvas({ matrix: inputMatrix, fullModel, clustered, focusedNodeId, scopeIds, deletedIds, isDark }: Readonly<DsmCanvasProps>) {
  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const viewportRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const hoveredCellRef = useRef<{ row: number; col: number } | null>(null);
  const matrixRef = useRef<DsmMatrix | null>(null);
  const cyclicSetRef = useRef(new Set<string>());
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const groupBordersRef = useRef<number[]>([]);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Build matrix when inputs change
  useEffect(() => {
    if (!inputMatrix) {
      matrixRef.current = null;
      cyclicSetRef.current = new Set();
      groupBordersRef.current = [];
      return;
    }
    const matrix = clustered ? clusterMatrix(inputMatrix) : inputMatrix;
    matrixRef.current = matrix;

    // Detect cycles
    const sccs = detectCycles(matrix.adjacency, matrix.nodes.map(n => n.id));
    const set = new Set<string>();
    for (const scc of sccs) {
      for (let i = 0; i < scc.length; i++) {
        for (let j = i + 1; j < scc.length; j++) {
          set.add(`${scc[i]}:${scc[j]}`);
          set.add(`${scc[j]}:${scc[i]}`);
        }
      }
    }
    cyclicSetRef.current = set;

    // Compute group borders (boundaries between different parent components)
    if (clustered || !fullModel) {
      groupBordersRef.current = [];
    } else {
      const elementById = new Map(fullModel.elements.map(e => [e.id, e]));
      const borders: number[] = [];
      for (let i = 1; i < matrix.nodes.length; i++) {
        const prevEl = elementById.get(matrix.nodes[i - 1].id);
        const currEl = elementById.get(matrix.nodes[i].id);
        if (prevEl?.boundaryId !== currEl?.boundaryId) {
          borders.push(i);
        }
      }
      groupBordersRef.current = borders;
    }

    // Reset viewport
    viewportRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
    hoveredCellRef.current = null;
    setTooltip(null);
  }, [inputMatrix, fullModel, clustered]);

  // Scroll to focused node
  useEffect(() => {
    const matrix = matrixRef.current;
    const canvas = canvasRef.current;
    if (!focusedNodeId || !matrix || !canvas) return;
    const idx = matrix.nodes.findIndex(nd => nd.id === focusedNodeId || nd.name === focusedNodeId);
    if (idx < 0) return;

    const vp = viewportRef.current;
    const s = vp.scale;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Target: center the focused row's cell area in the visible region
    const cellCenterX = HEADER_WIDTH + (idx + 0.5) * CELL_SIZE;
    const cellCenterY = HEADER_HEIGHT + (idx + 0.5) * CELL_SIZE;
    const visibleCenterX = HEADER_WIDTH + (w - HEADER_WIDTH) / 2;
    const visibleCenterY = HEADER_HEIGHT + (h - HEADER_HEIGHT) / 2;

    viewportRef.current = clampDsmViewport({
      scale: s,
      offsetX: visibleCenterX - cellCenterX * s,
      offsetY: visibleCenterY - cellCenterY * s,
    });
  }, [focusedNodeId]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      const cvs = canvas!;
      const matrix = matrixRef.current;
      if (!matrix) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      cvs.width = w * dpr;
      cvs.height = h * dpr;

      const vp = viewportRef.current;
      const hovered = hoveredCellRef.current;
      const n = matrix.nodes.length;
      const cyclicSet = cyclicSetRef.current;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      if (n === 0) {
        ctx!.fillStyle = colors.text;
        ctx!.font = '14px sans-serif';
        ctx!.fillText('No data. Import a C4 model first.', 20, 40);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const s = vp.scale;
      const fontSize = Math.max(6, Math.min(14, 10 * s));
      const labelFont = `${fontSize}px sans-serif`;
      const focusIdx = focusedNodeId
        ? matrix.nodes.findIndex(nd => nd.id === focusedNodeId || nd.name === focusedNodeId)
        : -1;
      const deletedIndices = buildDeletedIndices(matrix.nodes, deletedIds);

      // --- Cell area (panned & zoomed, clipped to content region) ---
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(HEADER_WIDTH, HEADER_HEIGHT, w - HEADER_WIDTH, h - HEADER_HEIGHT);
      ctx!.clip();
      ctx!.translate(vp.offsetX, vp.offsetY);
      ctx!.scale(s, s);

      drawGridLines(ctx!, n, colors);
      drawCells(ctx!, matrix, deletedIndices, cyclicSet, colors);
      drawGroupBorders(ctx!, groupBordersRef.current, n, colors);
      drawFocusHighlight(ctx!, matrix, focusedNodeId, colors);
      drawScopeHighlight(ctx!, matrix, scopeIds, colors);
      drawHoverHighlight(ctx!, hovered, n, colors);

      ctx!.restore();

      drawRowHeaders(ctx!, matrix, vp, focusIdx, deletedIds, colors, h);
      drawColHeaders(ctx!, matrix, vp, deletedIds, colors, w, fontSize, labelFont);

      // --- Corner background (top-left, covers overlap) ---
      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [inputMatrix, clustered, focusedNodeId, scopeIds, deletedIds, colors]);

  // Mouse move (hover + pan)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - lastPanRef.current.x;
      const dy = e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      viewportRef.current = clampDsmViewport({
        ...viewportRef.current,
        offsetX: viewportRef.current.offsetX + dx,
        offsetY: viewportRef.current.offsetY + dy,
      });
      return;
    }

    const matrix = matrixRef.current;
    if (!matrix) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cell = hitTestCell(mx, my, viewportRef.current, matrix.nodes.length);
    hoveredCellRef.current = cell;

    if (cell) {
      const rowName = matrix.nodes[cell.row].name;
      const colName = matrix.nodes[cell.col].name;
      setTooltip({ text: `${rowName} → ${colName}`, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const vp = viewportRef.current;
    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, offsetY: vp.offsetY + PAN_STEP });
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, offsetY: vp.offsetY - PAN_STEP });
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, offsetX: vp.offsetX + PAN_STEP });
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, offsetX: vp.offsetX - PAN_STEP });
        break;
      }
      case '+':
      case '=': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, scale: vp.scale * 1.1 });
        break;
      }
      case '-': {
        e.preventDefault();
        viewportRef.current = clampDsmViewport({ ...vp, scale: vp.scale * 0.9 });
        break;
      }
    }
  }, []);

  // Zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const vp = viewportRef.current;
        viewportRef.current = clampDsmViewport({
          scale: vp.scale * factor,
          offsetX: mx - (mx - vp.offsetX) * factor,
          offsetY: my - (my - vp.offsetY) * factor,
        });
      } else {
        e.preventDefault();
        const vp = viewportRef.current;
        viewportRef.current = clampDsmViewport({
          ...vp,
          offsetY: vp.offsetY - e.deltaY,
        });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-roledescription="dependency structure matrix"
        aria-label={`DSM with ${matrixRef.current?.nodes.length ?? 0} nodes`}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
          outline: 'none',
          boxShadow: isFocused ? `inset 0 0 0 2px ${colors.focusRing}` : 'none',
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: colors.tooltipBg,
            color: colors.text,
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 100,
            border: `1px solid ${colors.tooltipBorder}`,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
