import type { C4Model, FeatureMatrix } from '@anytime-markdown/c4-kernel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getC4Colors } from '../c4Theme';

interface FcMapCanvasProps {
  readonly featureMatrix: FeatureMatrix;
  readonly model: C4Model;
  /** チェックOFFで除外する要素ID */
  readonly excludedElementIds?: ReadonlySet<string> | null;
  /** C4 レベル (2=container のみ, 3=component のみ, 4=すべて) */
  readonly level?: number;
  /** ダークテーマかどうか（デフォルト: true） */
  readonly isDark?: boolean;
}

// --- Constants ---

const CELL_W = 32;
const CELL_H = 28;
const ROW_HEADER_W = 180;
const COL_HEADER_H = 120;
const PAN_STEP = 20;

const SECONDARY_COLOR = '#66BB6A';

const ROLE_LABELS: Record<string, string> = {
  primary: 'P',
  secondary: 'S',
  dependency: 'D',
};

// --- Helpers ---

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

function clampViewport(vp: { offsetX: number; offsetY: number; scale: number }): { offsetX: number; offsetY: number; scale: number } {
  const maxOffsetX = ROW_HEADER_W * (1 - vp.scale);
  const maxOffsetY = COL_HEADER_H * (1 - vp.scale);
  return {
    scale: vp.scale,
    offsetX: Math.min(vp.offsetX, maxOffsetX),
    offsetY: Math.min(vp.offsetY, maxOffsetY),
  };
}

/** Build the grid data from FeatureMatrix + C4Model */
function buildGrid(fm: FeatureMatrix, model: C4Model, excluded?: ReadonlySet<string> | null, level?: number) {
  // Columns: unique elementIds referenced by mappings, resolved to names
  const elementMap = new Map(model.elements.map(e => [e.id, e.name]));
  const typeMap = new Map(model.elements.map(e => [e.id, e.type]));

  // レベルに応じた要素タイプフィルタ
  const allowedTypes: ReadonlySet<string> | null =
    level === 2 ? new Set(['container', 'containerDb']) :
    level === 3 ? new Set(['component']) :
    level === 4 ? new Set(['code']) :
    null; // undefined → すべて表示

  const colIds = [...new Set(fm.mappings.map(m => m.elementId))]
    .filter(id => !excluded?.has(id))
    .filter(id => !allowedTypes || allowedTypes.has(typeMap.get(id) ?? ''));
  const columns = colIds.map(id => ({ id, name: elementMap.get(id) ?? id }));

  // Rows: features grouped by category
  const catMap = new Map(fm.categories.map(c => [c.id, c.name]));
  const rows = fm.features.map(f => ({
    id: f.id,
    name: f.name,
    categoryId: f.categoryId,
    categoryName: catMap.get(f.categoryId) ?? f.categoryId,
  }));

  // Category group borders (indices where category changes)
  const groupBorders: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].categoryId !== rows[i - 1].categoryId) {
      groupBorders.push(i);
    }
  }

  // Cell lookup: featureId:elementId -> role
  const cells = new Map<string, string>();
  for (const m of fm.mappings) {
    cells.set(`${m.featureId}:${m.elementId}`, m.role);
  }

  return { columns, rows, groupBorders, cells };
}

// --- Component ---

export function FcMapCanvas({ featureMatrix, model, excludedElementIds, level, isDark }: Readonly<FcMapCanvasProps>) {
  const colors = useMemo(() => getC4Colors(isDark ?? true), [isDark]);
  const dependencyColor = (isDark ?? true) ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';
  const roleColors: Record<string, string> = useMemo(() => ({
    primary: colors.accent,
    secondary: SECONDARY_COLOR,
    dependency: dependencyColor,
  }), [colors.accent, dependencyColor]);

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
    gridRef.current = buildGrid(featureMatrix, model, excludedElementIds, level);
    viewportRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
    hoveredRef.current = null;
    setTooltip(null);
  }, [featureMatrix, model, excludedElementIds, level]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
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
      const { columns, rows, groupBorders, cells } = grid;
      const nCols = columns.length;
      const nRows = rows.length;
      const s = vp.scale;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      if (nRows === 0 || nCols === 0) {
        ctx!.fillStyle = colors.text;
        ctx!.font = '14px sans-serif';
        ctx!.fillText('No F-C Map data available.', 20, 40);
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

      // Cells
      const cellFontSize = Math.max(8, Math.min(12, 10 * s));
      ctx!.font = `bold ${cellFontSize / s}px sans-serif`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';

      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
          const key = `${rows[r].id}:${columns[c].id}`;
          const role = cells.get(key);
          if (!role) continue;

          const x = ROW_HEADER_W + c * CELL_W;
          const y = COL_HEADER_H + r * CELL_H;

          ctx!.fillStyle = roleColors[role] ?? dependencyColor;
          ctx!.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

          // Label (P/S/D)
          const label = ROLE_LABELS[role] ?? '';
          ctx!.fillStyle = role === 'dependency' ? colors.textSecondary : colors.bg;
          ctx!.fillText(label, x + CELL_W / 2, y + CELL_H / 2);
        }
      }

      // Category group borders
      if (groupBorders.length > 0) {
        ctx!.strokeStyle = colors.groupLine;
        ctx!.lineWidth = 2;
        for (const bi of groupBorders) {
          const gy = COL_HEADER_H + bi * CELL_H;
          ctx!.beginPath();
          ctx!.moveTo(ROW_HEADER_W, gy);
          ctx!.lineTo(ROW_HEADER_W + nCols * CELL_W, gy);
          ctx!.stroke();
        }
        ctx!.lineWidth = 0.5;
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

      // Category labels (left margin, rotated or in group header)
      let prevCatIdx = 0;
      const catFont = `bold ${Math.max(6, Math.min(11, 9 * s))}px sans-serif`;
      for (let g = 0; g <= groupBorders.length; g++) {
        const endIdx = g < groupBorders.length ? groupBorders[g] : nRows;
        const catName = rows[prevCatIdx].categoryName;
        const midY = ((COL_HEADER_H + (prevCatIdx + (endIdx - 1)) / 2 * CELL_H + CELL_H / 2)) * s + vp.offsetY;

        ctx!.save();
        ctx!.font = catFont;
        ctx!.fillStyle = colors.textMuted;
        ctx!.textAlign = 'center';
        ctx!.translate(10, midY);
        ctx!.rotate(-Math.PI / 2);
        ctx!.fillText(truncate(catName, 16), 0, 0);
        ctx!.restore();

        prevCatIdx = endIdx;
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
      ctx!.font = `${fontSize}px sans-serif`;
      ctx!.textBaseline = 'middle';

      for (let c = 0; c < nCols; c++) {
        const name = truncate(columns[c].name, 18);
        const colX = (ROW_HEADER_W + c * CELL_W + CELL_W / 2) * s + vp.offsetX;
        ctx!.save();
        ctx!.translate(colX, COL_HEADER_H - 4);
        ctx!.rotate(-Math.PI / 4);
        ctx!.textAlign = 'left';
        ctx!.fillText(name, 0, 0);
        ctx!.restore();
      }

      ctx!.restore();

      // --- Corner background ---
      ctx!.fillStyle = colors.bg;
      ctx!.fillRect(0, 0, ROW_HEADER_W, COL_HEADER_H);

      // Legend in corner
      ctx!.font = 'bold 11px sans-serif';
      ctx!.textAlign = 'left';
      ctx!.textBaseline = 'middle';
      const legendItems = [
        { label: 'P Primary', color: colors.accent },
        { label: 'S Secondary', color: SECONDARY_COLOR },
        { label: 'D Dependency', color: dependencyColor },
      ];
      for (let i = 0; i < legendItems.length; i++) {
        const ly = 20 + i * 18;
        ctx!.fillStyle = legendItems[i].color;
        ctx!.fillRect(8, ly - 5, 10, 10);
        ctx!.fillStyle = colors.text;
        ctx!.font = '10px sans-serif';
        ctx!.fillText(legendItems[i].label, 22, ly);
      }

      // Title
      ctx!.font = 'bold 12px sans-serif';
      ctx!.fillStyle = colors.textSecondary;
      ctx!.fillText('F-C Map', 8, COL_HEADER_H - 10);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [featureMatrix, model, excludedElementIds, level, colors, roleColors, dependencyColor]);

  // Hit test for cell hover
  const hitTestCell = useCallback((mouseX: number, mouseY: number): { row: number; col: number } | null => {
    if (mouseX < ROW_HEADER_W || mouseY < COL_HEADER_H) return null;
    const grid = gridRef.current;
    if (!grid) return null;
    const vp = viewportRef.current;
    const worldX = (mouseX - vp.offsetX) / vp.scale;
    const worldY = (mouseY - vp.offsetY) / vp.scale;
    const col = Math.floor((worldX - ROW_HEADER_W) / CELL_W);
    const row = Math.floor((worldY - COL_HEADER_H) / CELL_H);
    if (row < 0 || row >= grid.rows.length || col < 0 || col >= grid.columns.length) return null;
    return { row, col };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
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
      const col = grid.columns[cell.col];
      const key = `${row.id}:${col.id}`;
      const role = grid.cells.get(key);
      const roleLabel = role ? ` [${ROLE_LABELS[role]}]` : '';
      setTooltip({ text: `${row.name} \u2192 ${col.name}${roleLabel}`, x: e.clientX, y: e.clientY });
    } else {
      setTooltip(null);
    }
  }, [hitTestCell]);

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
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-roledescription="function-component map"
        aria-label={`F-C Map: ${gridRef.current?.rows.length ?? 0} features \u00d7 ${gridRef.current?.columns.length ?? 0} components`}
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
