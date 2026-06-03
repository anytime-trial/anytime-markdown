import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import { PanPhysics } from './PanPhysics';
import { groupByCommunity } from './communityGroup';
import {
  axonometricProject,
  computeCityLayout,
  type BlockLayout,
  type BuildingLayout,
} from './codeCityLayout';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

export interface CodeCityCanvasProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly height?: number | string;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const PAN_SENSITIVITY = 0.7;

interface TooltipState {
  readonly building: BuildingLayout;
  readonly blockId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Multiply each RGB channel by `factor` (clamped to 0..255) to lighten or
 * darken a hex color. Used to shade the three visible faces of a building.
 */
function shadeHex(hex: string, factor: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return hex;
  const raw = m[1]!;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const cap = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return `rgb(${cap(r)}, ${cap(g)}, ${cap(b)})`;
}

export const CodeCityCanvas: React.FC<CodeCityCanvasProps> = ({
  entries,
  onFunctionOpen,
  height = 400,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const physicsRef = React.useRef(new PanPhysics());
  const rafRef = React.useRef(0);

  const onClickRef = React.useRef(onFunctionOpen);
  onClickRef.current = onFunctionOpen;

  // City layout (recomputed when entries change)
  const blocks = React.useMemo<readonly BlockLayout[]>(() => {
    return computeCityLayout(groupByCommunity(entries));
  }, [entries]);

  // Building list sorted by Painter's order (back to front). Each entry remembers
  // its parent block ID so the tooltip can show the community.
  const orderedBuildings = React.useMemo<{ b: BuildingLayout; blockId: string }[]>(() => {
    const out: { b: BuildingLayout; blockId: string }[] = [];
    for (const block of blocks) {
      for (const b of block.buildings) out.push({ b, blockId: block.id });
    }
    out.sort((a, b) => a.b.bx + a.b.by - (b.b.bx + b.b.by));
    return out;
  }, [blocks]);

  // Drag state
  const isDraggingRef = React.useRef(false);
  const lastMouseRef = React.useRef({ x: 0, y: 0 });
  const dragVxRef = React.useRef(0);
  const dragVyRef = React.useRef(0);
  const hoveredRef = React.useRef<BuildingLayout | null>(null);

  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);

  const drawRef = React.useRef<(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void>(
    () => {},
  );

  React.useEffect(() => {
    const dark = isDark;
    drawRef.current = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      const dpr = globalThis.devicePixelRatio ?? 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      // canvas.width/height への代入は同値でもバッキングビットマップを破棄し
      // GPU テクスチャを再アップロードさせるため、サイズ変化時のみ再設定する。
      const wPx = w * dpr;
      const hPx = h * dpr;
      if (canvas.width !== wPx || canvas.height !== hPx) {
        canvas.width = wPx;
        canvas.height = hPx;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { viewX, viewY, zoom } = physicsRef.current;
      const hovered = hoveredRef.current;

      // ── Background: sky gradient ────────────────────────────────────
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
      // x,y are data-space ground coords; z is height.
      const cx = w / 2;
      const cy = h * 0.65; // ground line near vertical middle, slightly below
      const project = (x: number, y: number, z: number) => {
        const tx = (x - viewX) * zoom;
        const ty = (y - viewY) * zoom;
        const tz = z * zoom;
        const p = axonometricProject(tx, ty, tz);
        return { sx: cx + p.sx, sy: cy + p.sy };
      };

      // ── Ground plane: aggregate block bounds ────────────────────────
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

      // ── Block tiles (city blocks as rectangles on the ground) ──────
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

      // ── Buildings (Painter's order: back to front) ─────────────────
      for (const { b, blockId } of orderedBuildings) {
        const halfF = b.footprint / 2;
        const base = ROLE_COLORS[b.entry.functionRole];

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
          // Still need to keep ordering, just skip drawing
          continue;
        }

        const isHovered = b === hovered;
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

        // Suppress unused-variable warning for blockId (only used in hover state)
        void blockId;
      }

      // ── HUD ─────────────────────────────────────────────────────────
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        `×${zoom.toFixed(1)}  ${blocks.length} blocks  ${orderedBuildings.length} buildings`,
        8,
        h - 4,
      );
    };
  }, [isDark, blocks, orderedBuildings]);

  // --- rAF helpers ---
  const scheduleLoop = React.useCallback(() => {
    if (rafRef.current !== 0) return;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) drawRef.current(canvas, ctx);
      const moving = physicsRef.current.tick();
      if (moving || isDraggingRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const requestDraw = React.useCallback(() => {
    if (rafRef.current !== 0) return;
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) drawRef.current(canvas, ctx);
      rafRef.current = 0;
    });
  }, []);

  // --- Hit testing (reverse Painter's order: front-most first) ---
  const hitTest = React.useCallback(
    (mx: number, my: number, canvasW: number, canvasH: number): { b: BuildingLayout; blockId: string } | null => {
      const { viewX, viewY, zoom } = physicsRef.current;
      const cx = canvasW / 2;
      const cy = canvasH * 0.65;
      const project = (x: number, y: number, z: number) => {
        const p = axonometricProject((x - viewX) * zoom, (y - viewY) * zoom, z * zoom);
        return { sx: cx + p.sx, sy: cy + p.sy };
      };

      // Iterate from front to back
      for (let i = orderedBuildings.length - 1; i >= 0; i--) {
        const item = orderedBuildings[i]!;
        const b = item.b;
        const halfF = b.footprint / 2;
        // Bounding box of the four top-face vertices in screen space.
        const t0 = project(b.bx - halfF, b.by - halfF, b.height);
        const t1 = project(b.bx + halfF, b.by - halfF, b.height);
        const t2 = project(b.bx + halfF, b.by + halfF, b.height);
        const t3 = project(b.bx - halfF, b.by + halfF, b.height);
        const minX = Math.min(t0.sx, t1.sx, t2.sx, t3.sx);
        const maxX = Math.max(t0.sx, t1.sx, t2.sx, t3.sx);
        const minY = Math.min(t0.sy, t1.sy, t2.sy, t3.sy);
        const maxY = Math.max(t0.sy, t1.sy, t2.sy, t3.sy);
        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
          // Refine with point-in-polygon (top face is a 2D parallelogram).
          if (pointInQuad(mx, my, t0, t1, t2, t3)) return item;
        }
      }
      return null;
    },
    [orderedBuildings],
  );

  // --- One-time setup + initial fit ---
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (blocks.length > 0) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const block of blocks) {
        xs.push(block.blockX);
        xs.push(block.blockX + block.blockSize);
        ys.push(block.blockY);
        ys.push(block.blockY + block.blockSize);
      }
      const w = canvas.clientWidth || 600;
      const ch = canvas.clientHeight || (typeof height === 'number' ? height : 400);
      // Fit relies on data-space bounds; since axonometric inflates the screen
      // footprint, we use a generous padding so the city is centered.
      physicsRef.current.fitToData(
        xs.map((x, i) => ({ x, y: ys[Math.floor(i / 2) * 2 + (i % 2)]! })),
        w,
        ch,
        80,
      );
    }
    requestDraw();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { viewX, viewY, zoom } = physicsRef.current;
      const anchorDataX = mouseX / zoom + viewX;
      const anchorDataY = (canvas.clientHeight - mouseY) / zoom + viewY;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const newZoom = Math.max(0.05, Math.min(500, physicsRef.current.zoom * factor));
      physicsRef.current.zoomAt(newZoom / zoom, anchorDataX, anchorDataY);
      requestDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit when entries change
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (blocks.length > 0) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const block of blocks) {
        xs.push(block.blockX);
        xs.push(block.blockX + block.blockSize);
        ys.push(block.blockY);
        ys.push(block.blockY + block.blockSize);
      }
      const w = canvas.clientWidth || 600;
      const ch = canvas.clientHeight || (typeof height === 'number' ? height : 400);
      physicsRef.current.fitToData(
        xs.map((x, i) => ({ x, y: ys[Math.floor(i / 2) * 2 + (i % 2)]! })),
        w,
        ch,
        80,
      );
    }
    requestDraw();
  }, [blocks, height, requestDraw]);

  React.useEffect(() => {
    requestDraw();
  }, [isDark, requestDraw]);

  // --- Mouse handlers ---
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      dragVxRef.current = 0;
      dragVyRef.current = 0;
      scheduleLoop();
    },
    [scheduleLoop],
  );

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const target = e.target as HTMLElement;
      const rect = target.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cw = target.clientWidth;
      const ch = target.clientHeight;

      if (isDraggingRef.current) {
        const dx = (mx - lastMouseRef.current.x) * PAN_SENSITIVITY;
        const dy = (my - lastMouseRef.current.y) * PAN_SENSITIVITY;
        dragVxRef.current = -dx / physicsRef.current.zoom;
        dragVyRef.current = dy / physicsRef.current.zoom;
        physicsRef.current.pan(dx, dy);
        lastMouseRef.current = { x: mx, y: my };
        return;
      }

      const hit = hitTest(mx, my, cw, ch);
      if (hit?.b !== hoveredRef.current) {
        hoveredRef.current = hit?.b ?? null;
        if (hit) {
          setTooltip({ building: hit.b, blockId: hit.blockId, x: mx, y: my });
        } else {
          setTooltip(null);
        }
        requestDraw();
      } else if (hit) {
        setTooltip((prev) => (prev ? { ...prev, x: mx, y: my } : null));
      }
    },
    [hitTest, requestDraw],
  );

  const handleMouseUp = React.useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    physicsRef.current.applyImpulse(dragVxRef.current, dragVyRef.current);
    scheduleLoop();
  }, [scheduleLoop]);

  const handleMouseLeave = React.useCallback(() => {
    isDraggingRef.current = false;
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setTooltip(null);
      requestDraw();
    }
  }, [requestDraw]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const target = e.target as HTMLElement;
      const rect = target.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my, target.clientWidth, target.clientHeight);
      if (hit && onClickRef.current) {
        onClickRef.current(hit.b.entry.filePath, hit.b.entry.functionName, hit.b.entry.startLine);
      }
    },
    [hitTest],
  );

  return (
    <Box sx={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {tooltip && (
        <Box
          sx={{
            position: 'absolute',
            top: tooltip.y + 12,
            left: tooltip.x + 12,
            bgcolor: isDark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.96)',
            color: isDark ? '#fff' : '#222',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
            borderRadius: 1,
            px: 1,
            py: 0.5,
            fontSize: 11,
            pointerEvents: 'none',
            maxWidth: 320,
            zIndex: 10,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: 12,
              color: ROLE_COLORS[tooltip.building.entry.functionRole],
              display: 'block',
              mb: 0.25,
            }}
          >
            {tooltip.building.entry.functionRole}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, fontSize: 12, display: 'block', mb: 0.25 }}
          >
            {tooltip.building.entry.functionName}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: isDark ? '#888' : '#666', fontSize: 10, display: 'block', mb: 0.5 }}
          >
            {tooltip.building.entry.filePath}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.25, fontSize: 10, color: isDark ? '#aaa' : '#555' }}>
            <span>
              lines <b>{tooltip.building.entry.lineCount}</b>
            </span>
            <span>
              CC <b>{tooltip.building.entry.cognitiveComplexity}</b>
            </span>
            <span>
              block <b>{tooltip.blockId}</b>
            </span>
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * Point-in-quadrilateral test using barycentric / cross-product approach.
 * The quad must be convex; we feed it the projected top face (which is a
 * parallelogram in screen space, always convex).
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
