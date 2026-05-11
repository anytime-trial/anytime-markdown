import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import { PanPhysics } from './PanPhysics';
import { groupByCommunity } from './communityGroup';
import {
  computeGalaxyLayout,
  ORBIT_RADIUS,
  type CommunityLayout,
  type PlanetLayout,
} from './galaxyLayout';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';
import { assignComplexityTier, type ComplexityTier } from '../components/panels/FunctionScatterPlot';

export interface GalaxyCanvasProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly height?: number | string;
}

const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: '#ff6f00',
  orchestrator: '#f9a825',
  leaf: '#2e7d32',
  peripheral: '#9e9e9e',
};

const BASE_RADIUS: Record<ComplexityTier, number> = {
  low: 3,
  mid: 7,
  high: 12,
};

const HUB_BASE_RADIUS = 18;
const PAN_SENSITIVITY = 0.7;
const ZOOM_LABEL_THRESHOLD = 2.5;
const HIT_PADDING = 4;

interface TooltipState {
  readonly point: ResolvedPoint;
  readonly x: number;
  readonly y: number;
}

/** A planet/hub resolved to its current screen position (after orbit math). */
interface ResolvedPoint {
  readonly entry: FunctionAnalysisApiEntry;
  readonly tier: ComplexityTier;
  /** Data-space coordinates after spiral + orbit math. */
  readonly dataX: number;
  readonly dataY: number;
  readonly isHub: boolean;
  readonly communityId: string;
}

/** Galaxy-wide slow rotation rate (radians per millisecond). ~10 min per cycle. */
const GALAXY_ROTATION_RATE = 0.000001;

/**
 * Per-orbit angular velocity multiplier — combined with Kepler's 3rd law
 * (1/sqrt(r)) gives a snappier orbit at innermost rings without being dizzying.
 */
const ORBIT_SPEED = 0.0005;

function resolveAnimatedPoints(
  layouts: readonly CommunityLayout[],
  elapsedMs: number,
): ResolvedPoint[] {
  const galaxyTheta = elapsedMs * GALAXY_ROTATION_RATE;
  const galSin = Math.sin(galaxyTheta);
  const galCos = Math.cos(galaxyTheta);

  const out: ResolvedPoint[] = [];
  for (const community of layouts) {
    // Galaxy rotation: rotate community center around the galactic origin.
    const rcx = community.cx * galCos - community.cy * galSin;
    const rcy = community.cx * galSin + community.cy * galCos;

    if (community.hub) {
      out.push({
        entry: community.hub,
        tier: assignComplexityTier(community.hub.cognitiveComplexity),
        dataX: rcx,
        dataY: rcy,
        isHub: true,
        communityId: community.id,
      });
    }
    for (const planet of community.planets) {
      // Kepler's 3rd law: inner orbits sweep faster than outer ones.
      const angularVelocity = 1 / Math.sqrt(Math.max(1, planet.orbitR));
      const orbitTheta = planet.orbitTheta0 + elapsedMs * ORBIT_SPEED * angularVelocity;
      // Orbit is relative to the (rotated) community center.
      const px = rcx + planet.orbitR * Math.cos(orbitTheta);
      const py = rcy + planet.orbitR * Math.sin(orbitTheta);
      out.push({
        entry: planet.entry,
        tier: assignComplexityTier(planet.entry.cognitiveComplexity),
        dataX: px,
        dataY: py,
        isHub: false,
        communityId: community.id,
      });
    }
  }
  return out;
}

export const GalaxyCanvas: React.FC<GalaxyCanvasProps> = ({
  entries,
  onFunctionOpen,
  height = 400,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const physicsRef = React.useRef(new PanPhysics());
  const rafRef = React.useRef(0);

  const isDarkRef = React.useRef(isDark);
  isDarkRef.current = isDark;
  const onClickRef = React.useRef(onFunctionOpen);
  onClickRef.current = onFunctionOpen;

  // Galaxy layout (recomputed when entries change)
  const layouts = React.useMemo<readonly CommunityLayout[]>(() => {
    return computeGalaxyLayout(groupByCommunity(entries));
  }, [entries]);
  // Layouts ref so the animation loop can pick up changes without re-binding.
  const layoutsRef = React.useRef(layouts);
  layoutsRef.current = layouts;

  // Animation clock — restart when entries change so positions don't jump.
  const animStartRef = React.useRef(performance.now());
  React.useEffect(() => {
    animStartRef.current = performance.now();
  }, [entries]);

  // Points in data-space, recomputed each frame in the animation loop.
  const pointsRef = React.useRef<ResolvedPoint[]>(resolveAnimatedPoints(layouts, 0));

  // Drag / hover state
  const isDraggingRef = React.useRef(false);
  const lastMouseRef = React.useRef({ x: 0, y: 0 });
  const dragVxRef = React.useRef(0);
  const dragVyRef = React.useRef(0);
  const hoveredRef = React.useRef<ResolvedPoint | null>(null);

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
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { viewX, viewY, zoom } = physicsRef.current;
      const pts = pointsRef.current;
      const hovered = hoveredRef.current;

      // ── Background: space (radial dark) ─────────────────────────────
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h));
      if (dark) {
        bgGrad.addColorStop(0, '#0a1428');
        bgGrad.addColorStop(1, '#000000');
      } else {
        bgGrad.addColorStop(0, '#e8eef5');
        bgGrad.addColorStop(1, '#c8d4e0');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Tiny background stars (deterministic seed via canvas dimensions)
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 80; i++) {
        const sx = (Math.sin(i * 12.9898) * 43758.5453 + 1) * 0.5 * w;
        const sy = (Math.sin(i * 78.233) * 43758.5453 + 1) * 0.5 * h;
        ctx.fillRect(((sx % w) + w) % w, ((sy % h) + h) % h, 1, 1);
      }

      // Helper: data-space → screen
      const toScreen = (dx: number, dy: number) => ({
        sx: (dx - viewX) * zoom,
        sy: h - (dy - viewY) * zoom,
      });

      // ── Orbit lines (subtle) ─────────────────────────────────────────
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      for (const community of layouts) {
        const { sx: ccx, sy: ccy } = toScreen(community.cx, community.cy);
        for (const orbitR of [
          ORBIT_RADIUS.orchestrator,
          ORBIT_RADIUS.leaf,
          ORBIT_RADIUS.peripheral,
        ]) {
          const screenR = orbitR * zoom;
          if (screenR < 4) continue;
          if (
            ccx + screenR < 0 ||
            ccx - screenR > w ||
            ccy + screenR < 0 ||
            ccy - screenR > h
          )
            continue;
          ctx.beginPath();
          ctx.arc(ccx, ccy, screenR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ── Pass 1: planets + hubs (z-order: hubs drawn last) ────────────
      const nonHubs = pts.filter((p) => !p.isHub);
      const hubs = pts.filter((p) => p.isHub);
      const drawPoint = (pt: ResolvedPoint) => {
        const { sx, sy } = toScreen(pt.dataX, pt.dataY);
        const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
        const r = baseR * Math.sqrt(zoom);
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) return;

        // Hub glow
        if (pt.isHub) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
          glow.addColorStop(0, 'rgba(255,180,60,0.4)');
          glow.addColorStop(1, 'rgba(255,180,60,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(sx - r * 2.5, sy - r * 2.5, r * 5, r * 5);
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = pt.isHub ? ROLE_COLORS.hub : ROLE_COLORS[pt.entry.functionRole];
        ctx.globalAlpha = pt.isHub ? 1 : 0.88;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (pt === hovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      };
      for (const pt of nonHubs) drawPoint(pt);
      for (const pt of hubs) drawPoint(pt);

      // ── Pass 2: labels with collision avoidance (zoom-in only) ──────
      if (zoom >= ZOOM_LABEL_THRESHOLD) {
        const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
        const labelCandidates = [...pts]
          .map((pt) => {
            const { sx, sy } = toScreen(pt.dataX, pt.dataY);
            const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
            const r = baseR * Math.sqrt(zoom);
            return { pt, sx, sy, r };
          })
          .filter(({ sx, sy, r }) => !(sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h))
          // Hubs first, then largest radii
          .sort((a, b) => {
            if (a.pt.isHub !== b.pt.isHub) return a.pt.isHub ? -1 : 1;
            return b.r - a.r;
          });

        for (const { pt, sx, sy, r } of labelCandidates) {
          const dynamicMinR = pt.isHub ? 8 : Math.max(10, 22 / Math.sqrt(zoom));
          if (r < dynamicMinR) continue;
          const fontSize = pt.isHub ? Math.min(12, r * 0.55) : Math.min(10, r * 0.55);
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const maxChars = Math.max(4, Math.floor((r * 2) / (fontSize * 0.62)));
          const name =
            pt.entry.functionName.length > maxChars
              ? pt.entry.functionName.slice(0, maxChars - 1) + '…'
              : pt.entry.functionName;
          const nameW = ctx.measureText(name).width;
          const box = {
            x: sx - nameW / 2,
            y: sy - fontSize / 2,
            w: nameW,
            h: fontSize + 2,
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
          ctx.fillStyle = pt.isHub
            ? dark
              ? 'rgba(255,230,180,1)'
              : 'rgba(80,40,0,1)'
            : 'rgba(255,255,255,0.92)';
          ctx.fillText(name, sx, sy + 1);
        }
      }

      // ── HUD: zoom indicator ──────────────────────────────────────────
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`×${zoom.toFixed(1)}  ${layouts.length} systems`, 8, h - 4);
    };
  }, [isDark, layouts]);

  // --- rAF helpers ---
  // The galaxy keeps spinning, so the loop runs continuously while the
  // component is mounted. Each frame recomputes planet positions from
  // (elapsedMs, layouts) before drawing and ticking pan inertia.
  const scheduleLoop = React.useCallback(() => {
    if (rafRef.current !== 0) return;
    const loop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const elapsedMs = performance.now() - animStartRef.current;
        pointsRef.current = resolveAnimatedPoints(layoutsRef.current, elapsedMs);
        drawRef.current(canvas, ctx);
      }
      physicsRef.current.tick();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // For one-off draws (e.g. theme change before the loop is running).
  const requestDraw = React.useCallback(() => {
    scheduleLoop();
  }, [scheduleLoop]);

  // --- Hit testing ---
  const hitTest = React.useCallback((mx: number, my: number, h: number): ResolvedPoint | null => {
    const { viewX, viewY, zoom } = physicsRef.current;
    const pts = pointsRef.current;
    // Reverse so hubs (drawn last) are tested first
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i]!;
      const sx = (pt.dataX - viewX) * zoom;
      const sy = h - (pt.dataY - viewY) * zoom;
      const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
      const r = baseR * Math.sqrt(zoom) + HIT_PADDING;
      const dx = mx - sx;
      const dy = my - sy;
      if (dx * dx + dy * dy <= r * r) return pt;
    }
    return null;
  }, []);

  // --- One-time setup: wheel + initial fit + cleanup ---
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof height === 'number' ? height : 400);
    const physics = physicsRef.current;
    const pts = pointsRef.current;
    if (pts.length > 0) {
      physics.fitToData(
        pts.map((p) => ({ x: p.dataX, y: p.dataY })),
        w,
        h,
        60,
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
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || (typeof height === 'number' ? height : 400);
    const pts = pointsRef.current;
    if (pts.length > 0) {
      physicsRef.current.fitToData(
        pts.map((p) => ({ x: p.dataX, y: p.dataY })),
        w,
        h,
        60,
      );
    }
    requestDraw();
  }, [entries, height, requestDraw]);

  // Redraw on theme toggle
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
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ch = (e.target as HTMLElement).clientHeight;

      if (isDraggingRef.current) {
        const dx = (mx - lastMouseRef.current.x) * PAN_SENSITIVITY;
        const dy = (my - lastMouseRef.current.y) * PAN_SENSITIVITY;
        dragVxRef.current = -dx / physicsRef.current.zoom;
        dragVyRef.current = dy / physicsRef.current.zoom;
        physicsRef.current.pan(dx, dy);
        lastMouseRef.current = { x: mx, y: my };
        return;
      }

      const hit = hitTest(mx, my, ch);
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        if (hit) {
          setTooltip({ point: hit, x: mx, y: my });
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
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ch = (e.target as HTMLElement).clientHeight;
      const hit = hitTest(mx, my, ch);
      if (hit && onClickRef.current) {
        onClickRef.current(hit.entry.filePath, hit.entry.functionName, hit.entry.startLine);
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
              color: tooltip.point.isHub
                ? ROLE_COLORS.hub
                : ROLE_COLORS[tooltip.point.entry.functionRole],
              display: 'block',
              mb: 0.25,
            }}
          >
            {tooltip.point.isHub ? 'hub (system center)' : tooltip.point.entry.functionRole}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 12, display: 'block', mb: 0.25 }}>
            {tooltip.point.entry.functionName}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: isDark ? '#888' : '#666', fontSize: 10, display: 'block', mb: 0.5 }}
          >
            {tooltip.point.entry.filePath}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.25, fontSize: 10, color: isDark ? '#aaa' : '#555' }}>
            <span>fanIn <b>{tooltip.point.entry.fanIn}</b></span>
            <span>fanOut <b>{tooltip.point.entry.fanOut}</b></span>
            <span>CC <b>{tooltip.point.entry.cognitiveComplexity}</b></span>
            <span>system <b>{tooltip.point.communityId}</b></span>
          </Box>
        </Box>
      )}
    </Box>
  );
};
