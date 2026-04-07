import type { C4Model, C4Element, CoverageDiffMatrix, CoverageMatrix, CoverageEntry } from '@anytime-markdown/c4-kernel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getC4Colors } from '../c4Theme';

interface CoverageCanvasProps {
  readonly coverageMatrix: CoverageMatrix;
  readonly coverageDiff?: CoverageDiffMatrix | null;
  readonly model: C4Model;
  readonly level?: number; // 2=container, 3=component, 4=code
  readonly isDark?: boolean;
}

// --- Constants ---

const CELL_W = 80;
const CELL_H = 28;
const ROW_HEADER_W = 180;
const COL_HEADER_H = 40;
const PAN_STEP = 20;

const METRIC_COLUMNS = ['Lines', 'Branches', 'Functions'] as const;

const COLOR_HIGH = '#2e7d32';
const COLOR_MID = '#f9a825';
const COLOR_LOW = '#c62828';
const COLOR_NONE = '#616161';

// --- Helpers ---

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

function clampViewport(vp: { offsetX: number; offsetY: number; scale: number }): {
  offsetX: number;
  offsetY: number;
  scale: number;
} {
  const maxOffsetX = ROW_HEADER_W * (1 - vp.scale);
  const maxOffsetY = COL_HEADER_H * (1 - vp.scale);
  return {
    scale: vp.scale,
    offsetX: Math.min(vp.offsetX, maxOffsetX),
    offsetY: Math.min(vp.offsetY, maxOffsetY),
  };
}

function heatColor(pct: number): string {
  if (pct >= 80) return COLOR_HIGH;
  if (pct >= 50) return COLOR_MID;
  return COLOR_LOW;
}

function textColorForBg(pct: number): string {
  // Yellow background needs dark text for contrast
  if (pct >= 50 && pct < 80) return '#1a1a1a';
  return '#ffffff';
}

/** Collect element IDs from model, flattening children recursively */
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
  const elementMap = new Map(allElements.map(e => [e.id, e]));

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

// --- Component ---

export function CoverageCanvas({
  coverageMatrix,
  coverageDiff,
  model,
  level,
  isDark,
}: Readonly<CoverageCanvasProps>): React.JSX.Element {
  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);

  const diffMap = useMemo(() => {
    if (!coverageDiff) return null;
    return new Map(coverageDiff.entries.map(e => [e.elementId, e]));
  }, [coverageDiff]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const viewportRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const hoveredRef = useRef<{ row: number; col: number } | null>(null);
  const isPanningRef = useRef(false);
  const lastPanRef = useRef({ x: 0, y: 0 });
  const gridRef = useRef<ReturnType<typeof buildGrid> | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Build grid when data changes
  useEffect(() => {
    gridRef.current = buildGrid(coverageMatrix, model, level);
    viewportRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
    hoveredRef.current = null;
    setTooltip(null);
  }, [coverageMatrix, model, level]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw(): void {
      const cvs = canvas!;
      const grid = gridRef.current;
      if (!grid) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const w = cvs.clientWidth;
      const h = cvs.clientHeight;
      const dpr = globalThis.devicePixelRatio ?? 1;
      cvs.width = w * dpr;
      cvs.height = h * dpr;

      const vp = viewportRef.current;
      const hovered = hoveredRef.current;
      const { rows } = grid;
      const nRows = rows.length;
      const nCols = METRIC_COLUMNS.length;
      const s = vp.scale;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      if (nRows === 0) {
        ctx!.fillStyle = colors.text;
        ctx!.font = '14px sans-serif';
        ctx!.fillText('No coverage data available.', 20, 40);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // --- Cell area (panned & zoomed, clipped) ---
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(ROW_HEADER_W, COL_HEADER_H, w - ROW_HEADER_W, h - COL_HEADER_H);
      ctx!.clip();
      ctx!.translate(vp.offsetX, vp.offsetY);
      ctx!.scale(s, s);

      // Grid lines
      ctx!.strokeStyle = colors.grid;
      ctx!.lineWidth = 0.5;
      for (let c = 0; c <= nCols; c++) {
        const x = ROW_HEADER_W + c * CELL_W;
        ctx!.beginPath();
        ctx!.moveTo(x, COL_HEADER_H);
        ctx!.lineTo(x, COL_HEADER_H + nRows * CELL_H);
        ctx!.stroke();
      }
      for (let r = 0; r <= nRows; r++) {
        const y = COL_HEADER_H + r * CELL_H;
        ctx!.beginPath();
        ctx!.moveTo(ROW_HEADER_W, y);
        ctx!.lineTo(ROW_HEADER_W + nCols * CELL_W, y);
        ctx!.stroke();
      }

      // Cells with heatmap
      const cellFontSize = Math.max(8, Math.min(12, 10 * s));
      ctx!.font = `bold ${cellFontSize / s}px sans-serif`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';

      for (let r = 0; r < nRows; r++) {
        const entry = rows[r].entry;
        const metrics = [entry.lines, entry.branches, entry.functions];

        for (let c = 0; c < nCols; c++) {
          const metric = metrics[c];
          const x = ROW_HEADER_W + c * CELL_W;
          const y = COL_HEADER_H + r * CELL_H;

          const hasCoverage = metric.total > 0;
          const pct = hasCoverage ? metric.pct : -1;

          // Cell background
          ctx!.fillStyle = hasCoverage ? heatColor(pct) : COLOR_NONE;
          ctx!.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

          // Base percentage label
          const baseLabel = hasCoverage ? `${Math.round(pct)}%` : '-';

          // Check for diff data
          let deltaLabel = '';
          let deltaColor = '';
          if (hasCoverage && diffMap) {
            const diffEntry = diffMap.get(rows[r].entry.elementId);
            if (diffEntry) {
              const metricKeys = ['lines', 'branches', 'functions'] as const;
              const d = diffEntry[metricKeys[c]].pctDelta;
              if (d > 0) {
                deltaLabel = ` +${Math.round(d)}`;
                deltaColor = '#4caf50';
              } else if (d < 0) {
                deltaLabel = ` ${Math.round(d)}`;
                deltaColor = '#ef5350';
              }
            }
          }

          // Draw base label
          ctx!.fillStyle = hasCoverage ? textColorForBg(pct) : colors.textSecondary;
          if (deltaLabel) {
            // Shift base label left to make room for delta
            ctx!.fillText(baseLabel, x + CELL_W / 2 - 8, y + CELL_H / 2);
            // Draw delta with color
            const baseWidth = ctx!.measureText(baseLabel).width;
            ctx!.fillStyle = deltaColor;
            ctx!.textAlign = 'left';
            ctx!.fillText(deltaLabel, x + CELL_W / 2 - 8 + baseWidth / 2 + 2, y + CELL_H / 2);
            ctx!.textAlign = 'center';
          } else {
            ctx!.fillText(baseLabel, x + CELL_W / 2, y + CELL_H / 2);
          }
        }
      }

      // Hover highlight
      if (hovered && hovered.row < nRows && hovered.col < nCols) {
        ctx!.fillStyle = colors.hover;
        ctx!.fillRect(ROW_HEADER_W, COL_HEADER_H + hovered.row * CELL_H, nCols * CELL_W, CELL_H);
        ctx!.fillRect(ROW_HEADER_W + hovered.col * CELL_W, COL_HEADER_H, CELL_W, nRows * CELL_H);
      }

      ctx!.restore();

      // --- Row headers (fixed left) ---
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(0, COL_HEADER_H, ROW_HEADER_W, h - COL_HEADER_H);
      ctx!.clip();

      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, COL_HEADER_H, ROW_HEADER_W, h - COL_HEADER_H);

      const fontSize = Math.max(6, Math.min(12, 10 * s));
      ctx!.font = `${fontSize}px sans-serif`;
      ctx!.textBaseline = 'middle';
      ctx!.textAlign = 'right';
      ctx!.fillStyle = colors.text;

      for (let r = 0; r < nRows; r++) {
        const name = truncate(rows[r].name, 22);
        const rowY = (COL_HEADER_H + r * CELL_H + CELL_H / 2) * s + vp.offsetY;
        ctx!.fillText(name, ROW_HEADER_W - 4, rowY);
      }

      ctx!.restore();

      // --- Column headers (fixed top) ---
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(ROW_HEADER_W, 0, w - ROW_HEADER_W, COL_HEADER_H);
      ctx!.clip();

      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(ROW_HEADER_W, 0, w - ROW_HEADER_W, COL_HEADER_H);

      ctx!.fillStyle = colors.text;
      ctx!.font = `bold ${fontSize}px sans-serif`;
      ctx!.textBaseline = 'bottom';
      ctx!.textAlign = 'center';

      for (let c = 0; c < nCols; c++) {
        const colX = (ROW_HEADER_W + c * CELL_W + CELL_W / 2) * s + vp.offsetX;
        ctx!.fillText(METRIC_COLUMNS[c], colX, COL_HEADER_H - 4);
      }

      ctx!.restore();

      // --- Corner background ---
      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, 0, ROW_HEADER_W, COL_HEADER_H);

      // Legend in corner
      ctx!.font = 'bold 10px sans-serif';
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'middle';
      const legendItems = [
        { label: '\u2265 80%', color: COLOR_HIGH },
        { label: '50-80%', color: COLOR_MID },
        { label: '< 50%', color: COLOR_LOW },
      ];
      for (let i = 0; i < legendItems.length; i++) {
        const lx = 8 + i * 60;
        ctx!.fillStyle = legendItems[i].color;
        ctx!.fillRect(lx, 10, 10, 10);
        ctx!.fillStyle = colors.text;
        ctx!.font = '9px sans-serif';
        ctx!.fillText(legendItems[i].label, lx + 13, 15);
      }

      // Title
      ctx!.font = 'bold 11px sans-serif';
      ctx!.fillStyle = colors.textSecondary;
      ctx!.fillText('Coverage', 8, COL_HEADER_H - 8);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [coverageMatrix, model, level, colors]);

  // Hit test for cell hover
  const hitTestCell = useCallback(
    (mouseX: number, mouseY: number): { row: number; col: number } | null => {
      if (mouseX < ROW_HEADER_W || mouseY < COL_HEADER_H) return null;
      const grid = gridRef.current;
      if (!grid) return null;
      const vp = viewportRef.current;
      const worldX = (mouseX - vp.offsetX) / vp.scale;
      const worldY = (mouseY - vp.offsetY) / vp.scale;
      const col = Math.floor((worldX - ROW_HEADER_W) / CELL_W);
      const row = Math.floor((worldY - COL_HEADER_H) / CELL_H);
      if (row < 0 || row >= grid.rows.length || col < 0 || col >= METRIC_COLUMNS.length) {
        return null;
      }
      return { row, col };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - lastPanRef.current.x;
        const dy = e.clientY - lastPanRef.current.y;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        viewportRef.current = clampViewport({
          ...viewportRef.current,
          offsetX: viewportRef.current.offsetX + dx,
          offsetY: viewportRef.current.offsetY + dy,
        });
        return;
      }

      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const cell = hitTestCell(e.clientX - rect.left, e.clientY - rect.top);
      hoveredRef.current = cell;

      const grid = gridRef.current;
      if (cell && grid) {
        const row = grid.rows[cell.row];
        const metricName = METRIC_COLUMNS[cell.col];
        const metrics = [row.entry.lines, row.entry.branches, row.entry.functions];
        const metric = metrics[cell.col];
        const pctText = metric.total > 0 ? `${Math.round(metric.pct)}%` : 'N/A';
        const detail = metric.total > 0 ? ` (${metric.covered}/${metric.total})` : '';
        setTooltip({
          text: `${row.name} \u2014 ${metricName}: ${pctText}${detail}`,
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setTooltip(null);
      }
    },
    [hitTestCell],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      isPanningRef.current = true;
      lastPanRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const vp = viewportRef.current;
    switch (e.key) {
      case 'ArrowUp': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, offsetY: vp.offsetY + PAN_STEP }); break; }
      case 'ArrowDown': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, offsetY: vp.offsetY - PAN_STEP }); break; }
      case 'ArrowLeft': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, offsetX: vp.offsetX + PAN_STEP }); break; }
      case 'ArrowRight': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, offsetX: vp.offsetX - PAN_STEP }); break; }
      case '+': case '=': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, scale: vp.scale * 1.1 }); break; }
      case '-': { e.preventDefault(); viewportRef.current = clampViewport({ ...vp, scale: vp.scale * 0.9 }); break; }
    }
  }, []);

  // Zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.shiftKey) {
        // Shift+ホイール: ズーム
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const vp = viewportRef.current;
        viewportRef.current = clampViewport({
          scale: vp.scale * factor,
          offsetX: mx - (mx - vp.offsetX) * factor,
          offsetY: my - (my - vp.offsetY) * factor,
        });
      } else {
        // ホイール: 上下スクロール
        e.preventDefault();
        const vp = viewportRef.current;
        viewportRef.current = clampViewport({
          ...vp,
          offsetY: vp.offsetY - e.deltaY,
        });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      // Re-render will pick up new dimensions in the draw loop
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-roledescription="coverage matrix"
        aria-label={`Coverage Matrix: ${gridRef.current?.rows.length ?? 0} elements \u00d7 3 metrics`}
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
