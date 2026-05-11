import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import { PanPhysics } from './PanPhysics';
import type { ComplexityTier } from '../components/panels/FunctionScatterPlot';

export interface BubblePoint {
  readonly x: number;          // fanIn
  readonly y: number;          // fanOut
  readonly role: FunctionRole;
  readonly tier: ComplexityTier;
  readonly label: string;      // 関数名
  readonly file: string;       // ファイルパス
  readonly fanIn: number;
  readonly fanOut: number;
  readonly cc: number;
  readonly startLine: number;
}

export interface BubbleCanvasProps {
  readonly points: readonly BubblePoint[];
  readonly onPointClick?: (point: BubblePoint) => void;
  readonly height?: number;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#c62828',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const BASE_RADIUS: Record<ComplexityTier, number> = {
  low: 4,
  mid: 9,
  high: 16,
};

const ZOOM_LABEL_THRESHOLD = 3.0;
const LABEL_RADIUS_THRESHOLD = 12;
const HIT_PADDING = 4;

interface TooltipState {
  readonly point: BubblePoint;
  readonly x: number;
  readonly y: number;
}

export const BubbleCanvas: React.FC<BubbleCanvasProps> = ({
  points,
  onPointClick,
  height = 400,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const physicsRef = React.useRef(new PanPhysics());
  const rafRef = React.useRef(0);

  // Refs to always-current values (avoid stale closures in draw/loop)
  const isDarkRef = React.useRef(isDark);
  isDarkRef.current = isDark;
  const pointsRef = React.useRef(points);
  pointsRef.current = points;
  const hoveredRef = React.useRef<BubblePoint | null>(null);
  const onClickRef = React.useRef(onPointClick);
  onClickRef.current = onPointClick;

  // Drag state
  const isDraggingRef = React.useRef(false);
  const lastMouseRef = React.useRef({ x: 0, y: 0 });
  const dragVxRef = React.useRef(0);
  const dragVyRef = React.useRef(0);

  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);

  // --- Draw function ref (recreated when isDark changes) ---
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
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { viewX, viewY, zoom } = physicsRef.current;
      const pts = pointsRef.current;
      const hovered = hoveredRef.current;

      // Background
      ctx.fillStyle = dark ? '#0d1117' : '#fafafa';
      ctx.fillRect(0, 0, w, h);

      // Grid (subtle lines)
      const step = Math.pow(10, Math.ceil(Math.log10(80 / zoom)));
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.047)' : 'rgba(0,0,0,0.031)';
      ctx.lineWidth = 1;
      const gx0 = Math.floor(viewX / step) * step;
      const gy0 = Math.floor(viewY / step) * step;
      for (let gx = gx0; (gx - viewX) * zoom < w; gx += step) {
        const cx = (gx - viewX) * zoom;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.stroke();
      }
      for (let gy = gy0; (gy - viewY) * zoom < h; gy += step) {
        const cy = h - (gy - viewY) * zoom;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
      }

      // Bubbles
      for (const pt of pts) {
        const cx = (pt.x - viewX) * zoom;
        const cy = h - (pt.y - viewY) * zoom;
        const r = BASE_RADIUS[pt.tier] * Math.sqrt(zoom);
        if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = ROLE_COLORS[pt.role];
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Hover ring
        if (pt === hovered) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,255,255,0.31)' : 'rgba(0,0,0,0.31)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Labels (zoom-in only)
        if (zoom >= ZOOM_LABEL_THRESHOLD && r >= LABEL_RADIUS_THRESHOLD) {
          const fontSize = Math.min(11, r * 0.55);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const maxChars = Math.max(3, Math.floor((r * 2) / (fontSize * 0.62)));
          const name =
            pt.label.length > maxChars ? pt.label.slice(0, maxChars - 1) + '…' : pt.label;
          ctx.fillText(name, cx, cy + 1);
          const fileSize = Math.min(9, r * 0.42);
          ctx.font = `${fileSize}px monospace`;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          const fname = pt.file.split('/').at(-1) ?? pt.file;
          ctx.fillText(fname, cx, cy + fileSize + 3);
        }
      }

      // Axis labels (fixed screen-space)
      const axisColor = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
      ctx.fillStyle = axisColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('← fanIn →', w / 2, h - 4);
      ctx.save();
      ctx.translate(14, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText('← fanOut →', 0, 0);
      ctx.restore();

      // Zoom indicator
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`×${zoom.toFixed(1)}`, 30, h - 4);
    };
  }, [isDark]);

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

  // --- Hit test ---
  const hitTest = React.useCallback(
    (mouseX: number, mouseY: number, h: number): BubblePoint | null => {
      const { viewX, viewY, zoom } = physicsRef.current;
      const pts = pointsRef.current;
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i]!;
        const cx = (pt.x - viewX) * zoom;
        const cy = h - (pt.y - viewY) * zoom;
        const r = BASE_RADIUS[pt.tier] * Math.sqrt(zoom) + HIT_PADDING;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        if (dx * dx + dy * dy <= r * r) return pt;
      }
      return null;
    },
    [],
  );

  // --- One-time setup: wheel + cleanup ---
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial fit
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || height;
    const physics = physicsRef.current;
    physics.fitToData(pointsRef.current, w, h);
    const pts = pointsRef.current;
    if (pts.length > 0) {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      physics.setBounds({
        minX: Math.min(...xs) - 2,
        maxX: Math.max(...xs) + 2,
        minY: Math.min(...ys) - 2,
        maxY: Math.max(...ys) + 2,
      });
    }
    requestDraw();

    // Wheel (needs non-passive for preventDefault)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const { viewX, viewY, zoom } = physicsRef.current;
      const anchorDataX = mouseX / zoom + viewX;
      const anchorDataY = (canvas.clientHeight - mouseY) / zoom + viewY;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.1, Math.min(50, physicsRef.current.zoom * factor));
      physicsRef.current.zoomAt(newZoom / zoom, anchorDataX, anchorDataY);
      requestDraw();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when points change
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || height;
    physicsRef.current.fitToData(points, w, h);
    if (points.length > 0) {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      physicsRef.current.setBounds({
        minX: Math.min(...xs) - 2,
        maxX: Math.max(...xs) + 2,
        minY: Math.min(...ys) - 2,
        maxY: Math.max(...ys) + 2,
      });
    }
    requestDraw();
  }, [points, height, requestDraw]);

  // Redraw when theme changes
  React.useEffect(() => {
    requestDraw();
  }, [isDark, requestDraw]);

  // --- Mouse event handlers ---
  const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragVxRef.current = 0;
    dragVyRef.current = 0;
    scheduleLoop();
  }, [scheduleLoop]);

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const h = (e.target as HTMLElement).clientHeight;

      if (isDraggingRef.current) {
        const dx = mx - lastMouseRef.current.x;
        const dy = my - lastMouseRef.current.y;
        dragVxRef.current = -dx / physicsRef.current.zoom;
        dragVyRef.current = dy / physicsRef.current.zoom;
        physicsRef.current.pan(dx, dy);
        lastMouseRef.current = { x: mx, y: my };
        return;
      }

      // Hover
      const hit = hitTest(mx, my, h);
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        if (hit) {
          setTooltip({ point: hit, x: mx, y: my });
        } else {
          setTooltip(null);
        }
        requestDraw();
      } else if (hit) {
        // Update tooltip position while hovering same point
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
      if (!onClickRef.current) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const h = (e.target as HTMLElement).clientHeight;
      const hit = hitTest(mx, my, h);
      if (hit) onClickRef.current(hit);
    },
    [hitTest],
  );

  const handleFit = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    physicsRef.current.fitToData(pointsRef.current, canvas.clientWidth, canvas.clientHeight);
    requestDraw();
  }, [requestDraw]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* Tooltip */}
      {tooltip && (
        <Box
          sx={{
            position: 'absolute',
            top: tooltip.y + 12,
            left: tooltip.x + 12,
            bgcolor: isDark ? 'rgba(245,245,245,0.97)' : 'rgba(30,30,30,0.97)',
            color: isDark ? '#111' : '#eee',
            borderRadius: '7px',
            p: '9px 13px',
            fontSize: 11,
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: 155,
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, fontSize: 12, color: ROLE_COLORS[tooltip.point.role], display: 'block', mb: 0.25 }}
          >
            {tooltip.point.role}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 12, display: 'block', mb: 0.25 }}>
            {tooltip.point.label}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: isDark ? '#666' : '#aaa', fontSize: 10, display: 'block', mb: 0.5 }}
          >
            {tooltip.point.file.split('/').slice(-2).join('/')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.25, fontSize: 10, color: isDark ? '#444' : '#ccc' }}>
            <span>fanIn <b>{tooltip.point.fanIn}</b></span>
            <span>fanOut <b>{tooltip.point.fanOut}</b></span>
            <span>CC <b>{tooltip.point.cc}</b></span>
          </Box>
        </Box>
      )}

      {/* Fit button */}
      <Box
        onClick={handleFit}
        role="button"
        aria-label="fit to data"
        sx={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          bgcolor: 'rgba(128,128,128,0.18)',
          color: 'rgba(128,128,128,0.8)',
          border: '1px solid rgba(128,128,128,0.22)',
          borderRadius: '5px',
          px: 1.25,
          py: 0.5,
          fontSize: 11,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          userSelect: 'none',
          '&:hover': { bgcolor: 'rgba(128,128,128,0.28)' },
        }}
      >
        ⊙ Fit
      </Box>
    </Box>
  );
};
