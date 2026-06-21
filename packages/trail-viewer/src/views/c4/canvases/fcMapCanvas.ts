/**
 * FcMapCanvas vanilla factory.
 *
 * Ports FcMapCanvas.tsx rendering + interaction to native DOM.
 * All draw logic is verbatim from the React source.
 */

import type { C4Model, FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import { getC4Colors } from '../../../theme/c4Tokens';
import { COMMUNITY_ROLE_LABELS, getCommunityRoleBgColors } from '../../../c4/communityRoleColors';
import { truncate, clampViewport as clampViewportBase } from '../../../c4/canvasHelpers';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FcMapCanvasProps {
  readonly featureMatrix: FeatureMatrix;
  readonly model: C4Model;
  readonly excludedElementIds?: ReadonlySet<string> | null;
  readonly level?: number;
  readonly isDark?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_W = 32;
const CELL_H = 28;
const ROW_HEADER_W = 180;
const COL_HEADER_H = 120;
const PAN_STEP = 20;

// ---------------------------------------------------------------------------
// Pure helpers (verbatim from React source)
// ---------------------------------------------------------------------------

function clampFcMapViewport(vp: { offsetX: number; offsetY: number; scale: number }) {
  return clampViewportBase(vp, ROW_HEADER_W, COL_HEADER_H);
}

function buildGrid(
  fm: FeatureMatrix,
  model: C4Model,
  excluded?: ReadonlySet<string> | null,
  level?: number,
) {
  const elementMap = new Map(model.elements.map((e) => [e.id, e.name]));
  const typeMap = new Map(model.elements.map((e) => [e.id, e.type]));

  const allowedTypes: ReadonlySet<string> | null =
    level === 2 ? new Set(['container', 'containerDb']) :
    level === 3 ? new Set(['component']) :
    level === 4 ? new Set(['code']) :
    null;

  const colIds = [...new Set(fm.mappings.map((m) => m.elementId))]
    .filter((id) => !excluded?.has(id))
    .filter((id) => !allowedTypes || allowedTypes.has(typeMap.get(id) ?? ''));
  const columns = colIds.map((id) => ({ id, name: elementMap.get(id) ?? id }));

  const catMap = new Map(fm.categories.map((c) => [c.id, c.name]));
  const rows = fm.features.map((f) => ({
    id: f.id,
    name: f.name,
    categoryId: f.categoryId,
    categoryName: catMap.get(f.categoryId) ?? f.categoryId,
  }));

  const groupBorders: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].categoryId !== rows[i - 1].categoryId) {
      groupBorders.push(i);
    }
  }

  const cells = new Map<string, string>();
  for (const m of fm.mappings) {
    cells.set(`${m.featureId}:${m.elementId}`, m.role);
  }

  return { columns, rows, groupBorders, cells };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function mountFcMapCanvas(
  container: HTMLElement,
  initialProps: FcMapCanvasProps,
): VanillaViewHandle<FcMapCanvasProps> {
  let props = initialProps;
  let destroyed = false;
  let rafId = 0;

  // Viewport / interaction state
  let viewport = { offsetX: 0, offsetY: 0, scale: 1 };
  let hovered: { row: number; col: number } | null = null;
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };
  let grid = buildGrid(props.featureMatrix, props.model, props.excludedElementIds, props.level);
  let isFocused = false;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';

  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-roledescription', 'function-component map');
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

  function hitTestCell(mouseX: number, mouseY: number): { row: number; col: number } | null {
    if (mouseX < ROW_HEADER_W || mouseY < COL_HEADER_H) return null;
    const vp = viewport;
    const worldX = (mouseX - vp.offsetX) / vp.scale;
    const worldY = (mouseY - vp.offsetY) / vp.scale;
    const col = Math.floor((worldX - ROW_HEADER_W) / CELL_W);
    const row = Math.floor((worldY - COL_HEADER_H) / CELL_H);
    if (row < 0 || row >= grid.rows.length || col < 0 || col >= grid.columns.length) return null;
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

    const colors = getC4Colors(props.isDark ?? true);
    const roleColors = getCommunityRoleBgColors();
    const dependencyColor = roleColors.dependency;
    const { columns, rows, groupBorders, cells } = grid;
    const nCols = columns.length;
    const nRows = rows.length;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const vp = viewport;
    const s = vp.scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (nRows === 0 || nCols === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = '14px sans-serif';
      ctx.fillText('No F-C Map data available.', 20, 40);
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

    // Cells
    const cellFontSize = Math.max(8, Math.min(12, 10 * s));
    ctx.font = `bold ${cellFontSize / s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const key = `${rows[r].id}:${columns[c].id}`;
        const role = cells.get(key);
        if (!role) continue;

        const x = ROW_HEADER_W + c * CELL_W;
        const y = COL_HEADER_H + r * CELL_H;

        ctx.fillStyle = roleColors[role as keyof typeof roleColors] ?? dependencyColor;
        ctx.fillRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2);

        const label = COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS] ?? '';
        ctx.fillStyle = role === 'dependency' ? colors.textSecondary : colors.bg;
        ctx.fillText(label, x + CELL_W / 2, y + CELL_H / 2);
      }
    }

    // Category group borders
    if (groupBorders.length > 0) {
      ctx.strokeStyle = colors.groupLine;
      ctx.lineWidth = 2;
      for (const bi of groupBorders) {
        const gy = COL_HEADER_H + bi * CELL_H;
        ctx.beginPath();
        ctx.moveTo(ROW_HEADER_W, gy);
        ctx.lineTo(ROW_HEADER_W + nCols * CELL_W, gy);
        ctx.stroke();
      }
      ctx.lineWidth = 0.5;
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

    // Category labels
    let prevCatIdx = 0;
    const catFont = `bold ${Math.max(6, Math.min(11, 9 * s))}px sans-serif`;
    for (let g = 0; g <= groupBorders.length; g++) {
      const endIdx = g < groupBorders.length ? groupBorders[g] : nRows;
      const catName = rows[prevCatIdx].categoryName;
      const midY =
        (COL_HEADER_H + ((prevCatIdx + (endIdx - 1)) / 2) * CELL_H + CELL_H / 2) * s + vp.offsetY;

      ctx.save();
      ctx.font = catFont;
      ctx.fillStyle = colors.textMuted;
      ctx.textAlign = 'center';
      ctx.translate(10, midY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(truncate(catName, 16), 0, 0);
      ctx.restore();

      prevCatIdx = endIdx;
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
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    for (let c = 0; c < nCols; c++) {
      const name = truncate(columns[c].name, 18);
      const colX = (ROW_HEADER_W + c * CELL_W + CELL_W / 2) * s + vp.offsetX;
      ctx.save();
      ctx.translate(colX, COL_HEADER_H - 4);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'left';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    }

    ctx.restore();

    // Corner background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, ROW_HEADER_W, COL_HEADER_H);

    // Legend in corner
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const legendItems = [
      { label: 'P Primary', color: colors.accent },
      { label: 'S Secondary', color: roleColors.secondary },
      { label: 'D Dependency', color: dependencyColor },
    ];
    for (let i = 0; i < legendItems.length; i++) {
      const ly = 20 + i * 18;
      ctx.fillStyle = legendItems[i].color;
      ctx.fillRect(8, ly - 5, 10, 10);
      ctx.fillStyle = colors.text;
      ctx.font = '10px sans-serif';
      ctx.fillText(legendItems[i].label, 22, ly);
    }

    // Title
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = colors.textSecondary;
    ctx.fillText('F-C Map', 8, COL_HEADER_H - 10);

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
      viewport = clampFcMapViewport({
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
      const col = grid.columns[cell.col];
      const key = `${row.id}:${col.id}`;
      const role = grid.cells.get(key);
      const roleLabel = role ? ` [${COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS]}]` : '';
      showTooltip(`${row.name} → ${col.name}${roleLabel}`, e.clientX, e.clientY);
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
    hovered = null;
    hideTooltip();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const vp = viewport;
    switch (e.key) {
      case 'ArrowUp': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, offsetY: vp.offsetY + PAN_STEP }); break; }
      case 'ArrowDown': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, offsetY: vp.offsetY - PAN_STEP }); break; }
      case 'ArrowLeft': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, offsetX: vp.offsetX + PAN_STEP }); break; }
      case 'ArrowRight': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, offsetX: vp.offsetX - PAN_STEP }); break; }
      case '+':
      case '=': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, scale: vp.scale * 1.1 }); break; }
      case '-': { e.preventDefault(); viewport = clampFcMapViewport({ ...vp, scale: vp.scale * 0.9 }); break; }
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
      viewport = clampFcMapViewport({
        scale: vp.scale * factor,
        offsetX: mx - (mx - vp.offsetX) * factor,
        offsetY: my - (my - vp.offsetY) * factor,
      });
    } else {
      e.preventDefault();
      const vp = viewport;
      viewport = clampFcMapViewport({ ...vp, offsetY: vp.offsetY - e.deltaY });
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

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => { /* draw loop picks up new size */ });
    ro.observe(canvas);
  }

  // ---------------------------------------------------------------------------
  // Handle
  // ---------------------------------------------------------------------------

  function update(newProps: FcMapCanvasProps): void {
    const prevMatrix = props.featureMatrix;
    const prevModel = props.model;
    const prevExcluded = props.excludedElementIds;
    const prevLevel = props.level;
    props = newProps;

    if (
      newProps.featureMatrix !== prevMatrix ||
      newProps.model !== prevModel ||
      newProps.excludedElementIds !== prevExcluded ||
      newProps.level !== prevLevel
    ) {
      grid = buildGrid(newProps.featureMatrix, newProps.model, newProps.excludedElementIds, newProps.level);
      viewport = { offsetX: 0, offsetY: 0, scale: 1 };
      hovered = null;
      hideTooltip();
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
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
