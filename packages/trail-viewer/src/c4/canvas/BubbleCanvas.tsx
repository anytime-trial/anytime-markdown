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
  /**
   * Outer container height. number → px, string → CSS unit ('100%' fills the
   * flex parent's remaining height — useful inside a flex column popup).
   */
  readonly height?: number | string;
  /**
   * When set, pans/zooms the camera onto this point and dims all other bubbles
   * to ~30% opacity so the focused one stands out. Used by Tour Mode.
   * Matching is done by (file, label, startLine) to be robust against
   * `points` reference changes.
   */
  readonly focusPoint?: { readonly file: string; readonly label: string; readonly startLine: number } | null;
}

// Multiplier applied to mouse drag delta before passing to PanPhysics.pan.
// 1.0 = 1:1 (default), <1.0 dampens drag sensitivity so a small mouse motion
// translates to a smaller view shift. 0.7 = "feels controlled" on high-DPI
// trackpads / fast mice without losing responsiveness.
const PAN_SENSITIVITY = 0.7;

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
  focusPoint = null,
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
  // Tour focus: resolved to the matching BubblePoint so draw can highlight it.
  const focusedPointRef = React.useRef<BubblePoint | null>(null);
  React.useMemo(() => {
    if (!focusPoint) {
      focusedPointRef.current = null;
      return;
    }
    const match = points.find(
      (p) =>
        p.file === focusPoint.file &&
        p.label === focusPoint.label &&
        p.startLine === focusPoint.startLine,
    );
    focusedPointRef.current = match ?? null;
  }, [focusPoint, points]);

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

      // ── Pass 1: bubble bodies (z-order preserved per input order) ─────
      const focused = focusedPointRef.current;
      for (const pt of pts) {
        const cx = (pt.x - viewX) * zoom;
        const cy = h - (pt.y - viewY) * zoom;
        const r = BASE_RADIUS[pt.tier] * Math.sqrt(zoom);
        if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;

        const isFocusTarget = focused != null && pt === focused;
        // Dim all non-focus bubbles when a tour focus is active.
        const alpha = focused == null ? 0.85 : isFocusTarget ? 1.0 : 0.18;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = ROLE_COLORS[pt.role];
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Tour focus ring: pulsing-like double ring around the target
        if (isFocusTarget) {
          ctx.beginPath();
          ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,220,120,0.95)' : 'rgba(180,80,0,0.95)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,220,120,0.35)' : 'rgba(180,80,0,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (pt === hovered) {
          // Standard hover ring (suppressed while focused on a tour target).
          ctx.beginPath();
          ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,255,255,0.31)' : 'rgba(0,0,0,0.31)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // ── Pass 2: labels with greedy collision avoidance + zoom LOD ─────
      // Larger bubbles win label priority. Smaller bubbles whose labels would
      // overlap an already-drawn label are skipped — keeping the chart legible
      // even in dense regions. The dynamic radius threshold shrinks as zoom
      // grows, so more labels appear when zoomed in.
      if (zoom >= ZOOM_LABEL_THRESHOLD) {
        const dynamicRadiusThreshold = Math.max(
          LABEL_RADIUS_THRESHOLD,
          24 / Math.sqrt(zoom),
        );
        const labelCandidates = [...pts]
          .map((pt) => {
            const cx = (pt.x - viewX) * zoom;
            const cy = h - (pt.y - viewY) * zoom;
            const r = BASE_RADIUS[pt.tier] * Math.sqrt(zoom);
            return { pt, cx, cy, r };
          })
          .filter(
            ({ cx, cy, r }) =>
              !(cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) &&
              r >= dynamicRadiusThreshold,
          )
          .sort((a, b) => b.r - a.r);

        const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];

        for (const { pt, cx, cy, r } of labelCandidates) {
          const fontSize = Math.min(11, r * 0.55);
          const fileSize = Math.min(9, r * 0.42);
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const maxChars = Math.max(3, Math.floor((r * 2) / (fontSize * 0.62)));
          const name =
            pt.label.length > maxChars ? pt.label.slice(0, maxChars - 1) + '…' : pt.label;
          const fname = pt.file.split('/').at(-1) ?? pt.file;
          const nameWidth = ctx.measureText(name).width;
          ctx.font = `${fileSize}px monospace`;
          const fnameWidth = ctx.measureText(fname).width;
          const labelW = Math.max(nameWidth, fnameWidth);
          const labelH = fontSize + fileSize + 4;
          const box = {
            x: cx - labelW / 2,
            y: cy - fontSize / 2,
            w: labelW,
            h: labelH,
          };
          const overlaps = labelBoxes.some(
            (b) =>
              !(
                box.x + box.w < b.x ||
                box.x > b.x + b.w ||
                box.y + box.h < b.y ||
                box.y > b.y + b.h
              ),
          );
          if (overlaps) continue;
          labelBoxes.push(box);

          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.fillText(name, cx, cy + 1);
          ctx.font = `${fileSize}px monospace`;
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
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
    const h = canvas.clientHeight || (typeof height === 'number' ? height : 400);
    const physics = physicsRef.current;
    physics.fitToData(pointsRef.current, w, h);
    // Pan bounds are intentionally unbounded (-Infinity .. +Infinity) so users
    // can freely scroll past the data range — data-range bounds with spring
    // back made the left side hard to inspect.
    requestDraw();

    // Wheel (needs non-passive for preventDefault)
    // - factor 1.2 / 1/1.2: ~20% per wheel tick (より素早い拡大)
    // - clamp 0.05 .. 500: 大きく拡大 (× 500) して密集領域を解読可能に
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when points change
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof height === 'number' ? height : 400);
    physicsRef.current.fitToData(points, w, h);
    // Pan bounds are intentionally unbounded — see comment in the initial
    // setup effect above.
    requestDraw();
  }, [points, height, requestDraw]);

  // Redraw when theme changes
  React.useEffect(() => {
    requestDraw();
  }, [isDark, requestDraw]);

  // Tour focus: pan/zoom the camera onto the focus point.
  React.useEffect(() => {
    if (!focusPoint) {
      requestDraw();
      return;
    }
    const match = pointsRef.current.find(
      (p) =>
        p.file === focusPoint.file &&
        p.label === focusPoint.label &&
        p.startLine === focusPoint.startLine,
    );
    if (!match) {
      requestDraw();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof height === 'number' ? height : 400);
    const physics = physicsRef.current;
    // Target zoom: pick a level that comfortably shows the focus + labels.
    const targetZoom = Math.max(8, Math.min(60, physics.zoom));
    const zoomRatio = targetZoom / physics.zoom;
    physics.zoomAt(zoomRatio, match.x, match.y);
    // Center the focus point in the canvas.
    physics.viewX = match.x - w / 2 / physics.zoom;
    physics.viewY = match.y - h / 2 / physics.zoom;
    requestDraw();
  }, [focusPoint, height, requestDraw]);

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
        const dx = (mx - lastMouseRef.current.x) * PAN_SENSITIVITY;
        const dy = (my - lastMouseRef.current.y) * PAN_SENSITIVITY;
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
