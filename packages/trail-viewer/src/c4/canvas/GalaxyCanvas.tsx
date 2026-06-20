import * as React from 'react';
import { Box, Typography } from '../../ui';
import { useTrailTheme } from '../../components/TrailThemeContext';
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

/** Initial view: galaxy plane tilted so it reads as 3D (60° from horizontal). */
const INITIAL_PITCH = Math.PI / 3;
const INITIAL_YAW = 0;
const PITCH_MIN = 0.05; // almost edge-on
const PITCH_MAX = Math.PI / 2 - 0.05; // not quite top-down
const ROTATE_SENSITIVITY = 0.006;

/**
 * Project a 3D point (x ground, y ground, z height) onto the 2D canvas.
 *
 * Camera yaw rotates around the world Z axis (vertical). Pitch then tilts the
 * scene so that:
 *   pitch = π/2 → top-down (data Y maps fully to screen Y, no height contribution)
 *   pitch = 0   → edge-on (data Y disappears into the screen depth, only Z shows)
 *
 * Orthographic projection (no perspective foreshortening) — orbits stay as
 * ellipses with predictable axes, which is easier to read than a perspective
 * fish-eye.
 */
function project3D(
  x: number,
  y: number,
  z: number,
  pitch: number,
  yaw: number,
): { sx: number; sy: number } {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY - y * sinY;
  const y1 = x * sinY + y * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  // At pitch=π/2 (top-down) sin=1 so y_proj = y1 (data Y fully visible).
  // At pitch=0 (edge-on) sin=0, cos=1 so y_proj = z (only height shows).
  const yProj = y1 * sinP + z * cosP;
  return {
    sx: x1,
    sy: -yProj, // canvas Y grows downward; data Y grows upward
  };
}

/** RGB tuple in 0..255 range. */
type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [128, 128, 128];
  const raw = m[1]!;
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function rgbStr([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function scaleRgb(rgb: Rgb, factor: number): Rgb {
  const cap = (c: number): number => Math.max(0, Math.min(255, Math.round(c * factor)));
  return [cap(rgb[0]), cap(rgb[1]), cap(rgb[2])];
}

/**
 * Draw a pseudo-3D sphere with radial shading + specular highlight.
 * Light source is fixed at the upper-left of the sphere.
 *
 * - body: radial gradient from a bright "lit" patch (offset) to a dark limb
 * - specular: small bright spot near the lit patch
 * - rim: thin dark outline so the silhouette stays crisp on light/dark bg
 */
function drawSphere(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  baseHex: string,
  options: { glow?: boolean; isDark?: boolean } = {},
): void {
  const base = hexToRgb(baseHex);
  const dark = options.isDark ?? true;

  // Light direction (upper-left of the sphere, normalized to radius units)
  const lightDx = -0.35;
  const lightDy = -0.35;
  const lx = cx + r * lightDx;
  const ly = cy + r * lightDy;

  // Optional star-like glow halo (used for hubs / suns)
  if (options.glow) {
    const haloR = r * 3.2;
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, haloR);
    halo.addColorStop(0, 'rgba(255,200,90,0.55)');
    halo.addColorStop(0.35, 'rgba(255,160,60,0.22)');
    halo.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
  }

  // Body gradient: lit patch (offset) → mid → dark limb
  const grad = ctx.createRadialGradient(lx, ly, 0, cx, cy, r);
  grad.addColorStop(0, rgbStr(scaleRgb(base, 1.6)));
  grad.addColorStop(0.35, rgbStr(base));
  grad.addColorStop(1, rgbStr(scaleRgb(base, 0.35)));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight (small bright spot)
  if (r >= 3) {
    const specR = r * 0.35;
    const specCx = cx + r * (lightDx - 0.08);
    const specCy = cy + r * (lightDy - 0.08);
    const spec = ctx.createRadialGradient(specCx, specCy, 0, specCx, specCy, specR);
    spec.addColorStop(0, options.glow ? 'rgba(255,250,220,0.85)' : 'rgba(255,255,255,0.65)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(specCx - specR, specCy - specR, specR * 2, specR * 2);
  }

  // Rim outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = dark ? rgbStr(scaleRgb(base, 0.35), 0.55) : rgbStr(scaleRgb(base, 0.25), 0.4);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

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

/**
 * Per-community center positions after galaxy rotation. Useful for drawing
 * inter-community edges without recomputing rotation per planet.
 */
interface RotatedCenter {
  readonly id: string;
  readonly rcx: number;
  readonly rcy: number;
}

function resolveAnimatedPoints(
  layouts: readonly CommunityLayout[],
  elapsedMs: number,
  hoveredCommunityId: string | null,
): { points: ResolvedPoint[]; centers: RotatedCenter[] } {
  const galaxyTheta = elapsedMs * GALAXY_ROTATION_RATE;
  const galSin = Math.sin(galaxyTheta);
  const galCos = Math.cos(galaxyTheta);

  const points: ResolvedPoint[] = [];
  const centers: RotatedCenter[] = [];
  for (const community of layouts) {
    // Galaxy rotation: rotate community center around the galactic origin.
    const rcx = community.cx * galCos - community.cy * galSin;
    const rcy = community.cx * galSin + community.cy * galCos;
    centers.push({ id: community.id, rcx, rcy });

    if (community.hub) {
      points.push({
        entry: community.hub,
        tier: assignComplexityTier(community.hub.cognitiveComplexity),
        dataX: rcx,
        dataY: rcy,
        isHub: true,
        communityId: community.id,
      });
    }
    // Slow this community's orbits while hovered so the user can read planet labels.
    const orbitSpeedScale = community.id === hoveredCommunityId ? 0.15 : 1;
    for (const planet of community.planets) {
      // Kepler's 3rd law: inner orbits sweep faster than outer ones.
      const angularVelocity = 1 / Math.sqrt(Math.max(1, planet.orbitR));
      const orbitTheta =
        planet.orbitTheta0 + elapsedMs * ORBIT_SPEED * orbitSpeedScale * angularVelocity;
      // Orbit is relative to the (rotated) community center.
      const px = rcx + planet.orbitR * Math.cos(orbitTheta);
      const py = rcy + planet.orbitR * Math.sin(orbitTheta);
      points.push({
        entry: planet.entry,
        tier: assignComplexityTier(planet.entry.cognitiveComplexity),
        dataX: px,
        dataY: py,
        isHub: false,
        communityId: community.id,
      });
    }
  }
  return { points, centers };
}

/**
 * Build edges between communities that share the same parent directory.
 * For "packages/trail-viewer" and "packages/memory-core", the parent
 * "packages" matches → an edge is drawn between their centers.
 *
 * Returns pairs of indices into the centers array.
 */
function computeCommunityEdges(centers: readonly RotatedCenter[]): [number, number][] {
  const byParent = new Map<string, number[]>();
  for (let i = 0; i < centers.length; i++) {
    const idx = centers[i]!.id.lastIndexOf('/');
    if (idx < 0) continue;
    const parent = centers[i]!.id.slice(0, idx);
    let bucket = byParent.get(parent);
    if (!bucket) {
      bucket = [];
      byParent.set(parent, bucket);
    }
    bucket.push(i);
  }
  const edges: [number, number][] = [];
  for (const indices of byParent.values()) {
    if (indices.length < 2) continue;
    // Connect every pair within the same parent (small groups, OK).
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        edges.push([indices[i]!, indices[j]!]);
      }
    }
  }
  return edges;
}

export const GalaxyCanvas: React.FC<GalaxyCanvasProps> = ({
  entries,
  onFunctionOpen,
  height = 400,
}) => {
  const trailTheme = useTrailTheme();
  const isDark = trailTheme.isDark;

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

  // Points + community centers in data-space, recomputed each frame.
  const initial = resolveAnimatedPoints(layouts, 0, null);
  const pointsRef = React.useRef<ResolvedPoint[]>(initial.points);
  const centersRef = React.useRef<RotatedCenter[]>(initial.centers);
  // Community ID currently under the cursor — used to slow that system's orbits.
  const hoveredCommunityIdRef = React.useRef<string | null>(null);

  // Drag / hover state
  const isDraggingRef = React.useRef(false);
  const isRotatingRef = React.useRef(false);
  const lastMouseRef = React.useRef({ x: 0, y: 0 });
  const dragVxRef = React.useRef(0);
  const dragVyRef = React.useRef(0);
  const hoveredRef = React.useRef<ResolvedPoint | null>(null);
  // 3D camera angles (radians).
  const pitchRef = React.useRef(INITIAL_PITCH);
  const yawRef = React.useRef(INITIAL_YAW);

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

      // Helper: data-space (galaxy plane z=0) → screen via 3D projection.
      // Pan/zoom are applied first (in data-space), then the camera yaw+pitch
      // rotate the result, finally we shift to the canvas center.
      const pitch = pitchRef.current;
      const yaw = yawRef.current;
      const cxScreen = w / 2;
      const cyScreen = h / 2;
      const toScreen = (dx: number, dy: number, dz = 0) => {
        const tx = (dx - viewX) * zoom;
        const ty = (dy - viewY) * zoom;
        const tz = dz * zoom;
        const p = project3D(tx, ty, tz, pitch, yaw);
        return { sx: cxScreen + p.sx, sy: cyScreen + p.sy };
      };

      // ── Inter-community edges (parent-directory adjacency) ───────────
      const centers = centersRef.current;
      const edges = computeCommunityEdges(centers);
      ctx.strokeStyle = dark ? 'rgba(120,180,255,0.10)' : 'rgba(40,80,160,0.10)';
      ctx.lineWidth = 1;
      for (const [a, b] of edges) {
        const { sx: ax, sy: ay } = toScreen(centers[a]!.rcx, centers[a]!.rcy);
        const { sx: bx, sy: by } = toScreen(centers[b]!.rcx, centers[b]!.rcy);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // ── Orbit lines (subtle, brighter for the hovered community) ─────
      // Orbits become ellipses under non-top-down pitch — sample the circle
      // in data-space and project each sample so the ellipse is exact.
      const hoveredCommunityId = hoveredCommunityIdRef.current;
      const ORBIT_SAMPLES = 64;
      ctx.lineWidth = 1;
      for (let i = 0; i < centers.length; i++) {
        const c = centers[i]!;
        const isHoveredCommunity = c.id === hoveredCommunityId;
        ctx.strokeStyle = isHoveredCommunity
          ? dark
            ? 'rgba(255,200,120,0.35)'
            : 'rgba(120,80,0,0.30)'
          : dark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.05)';
        for (const orbitR of [
          ORBIT_RADIUS.orchestrator,
          ORBIT_RADIUS.leaf,
          ORBIT_RADIUS.peripheral,
        ]) {
          const screenR = orbitR * zoom;
          if (screenR < 4) continue;
          ctx.beginPath();
          for (let k = 0; k <= ORBIT_SAMPLES; k++) {
            const theta = (k / ORBIT_SAMPLES) * 2 * Math.PI;
            const dx = c.rcx + orbitR * Math.cos(theta);
            const dy = c.rcy + orbitR * Math.sin(theta);
            const p = toScreen(dx, dy);
            if (k === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // ── Galactic core: a large warm glow at the galaxy origin (0,0) ──
      // After galaxy rotation the origin stays at (0,0), so just project (0,0).
      {
        const { sx: coreSx, sy: coreSy } = toScreen(0, 0);
        const coreR = 90 * Math.sqrt(zoom);
        if (
          coreSx + coreR > 0 &&
          coreSx - coreR < w &&
          coreSy + coreR > 0 &&
          coreSy - coreR < h
        ) {
          const coreGrad = ctx.createRadialGradient(coreSx, coreSy, 0, coreSx, coreSy, coreR);
          coreGrad.addColorStop(0, dark ? 'rgba(255,220,180,0.25)' : 'rgba(255,200,120,0.20)');
          coreGrad.addColorStop(0.4, dark ? 'rgba(255,180,120,0.12)' : 'rgba(255,180,80,0.10)');
          coreGrad.addColorStop(1, 'rgba(255,160,60,0)');
          ctx.fillStyle = coreGrad;
          ctx.fillRect(coreSx - coreR, coreSy - coreR, coreR * 2, coreR * 2);
        }
      }

      // ── Pass 1: planets + hubs as 3D spheres (z-order: hubs drawn last)
      const nonHubs = pts.filter((p) => !p.isHub);
      const hubs = pts.filter((p) => p.isHub);
      const drawPoint = (pt: ResolvedPoint) => {
        const { sx, sy } = toScreen(pt.dataX, pt.dataY);
        const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
        const r = baseR * Math.sqrt(zoom);
        if (sx + r * 4 < 0 || sx - r * 4 > w || sy + r * 4 < 0 || sy - r * 4 > h) return;

        // Shadow under the sphere (subtle ground projection)
        if (!pt.isHub && r >= 3) {
          const shadowGrad = ctx.createRadialGradient(sx, sy + r * 1.0, 0, sx, sy + r * 1.0, r);
          shadowGrad.addColorStop(0, 'rgba(0,0,0,0.25)');
          shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(sx, sy + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const baseHex = pt.isHub ? ROLE_COLORS.hub : ROLE_COLORS[pt.entry.functionRole];
        drawSphere(ctx, sx, sy, r, baseHex, { glow: pt.isHub, isDark: dark });

        if (pt === hovered) {
          ctx.beginPath();
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
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
      const pitchDeg = Math.round((pitch * 180) / Math.PI);
      const yawDeg = Math.round((yaw * 180) / Math.PI) % 360;
      ctx.fillText(
        `×${zoom.toFixed(1)}  ${layouts.length} systems  pitch ${pitchDeg}°  yaw ${yawDeg}°  (Shift+drag to rotate)`,
        8,
        h - 4,
      );
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
        const resolved = resolveAnimatedPoints(
          layoutsRef.current,
          elapsedMs,
          hoveredCommunityIdRef.current,
        );
        pointsRef.current = resolved.points;
        centersRef.current = resolved.centers;
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

  // --- Hit testing (matches the 3D projection used in draw) ---
  const hitTest = React.useCallback(
    (mx: number, my: number, canvasW: number, canvasH: number): ResolvedPoint | null => {
      const { viewX, viewY, zoom } = physicsRef.current;
      const pitch = pitchRef.current;
      const yaw = yawRef.current;
      const cxScreen = canvasW / 2;
      const cyScreen = canvasH / 2;
      const pts = pointsRef.current;
      // Reverse so hubs (drawn last) are tested first.
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i]!;
        const p = project3D((pt.dataX - viewX) * zoom, (pt.dataY - viewY) * zoom, 0, pitch, yaw);
        const sx = cxScreen + p.sx;
        const sy = cyScreen + p.sy;
        const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
        const r = baseR * Math.sqrt(zoom) + HIT_PADDING;
        const dx = mx - sx;
        const dy = my - sy;
        if (dx * dx + dy * dy <= r * r) return pt;
      }
      return null;
    },
    [],
  );

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
      // Shift+drag → camera rotation, otherwise plain pan.
      isRotatingRef.current = e.shiftKey;
      isDraggingRef.current = !e.shiftKey;
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

      if (isRotatingRef.current) {
        const dx = mx - lastMouseRef.current.x;
        const dy = my - lastMouseRef.current.y;
        yawRef.current += dx * ROTATE_SENSITIVITY;
        pitchRef.current = Math.max(
          PITCH_MIN,
          Math.min(PITCH_MAX, pitchRef.current - dy * ROTATE_SENSITIVITY),
        );
        lastMouseRef.current = { x: mx, y: my };
        requestDraw();
        return;
      }

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
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        hoveredCommunityIdRef.current = hit ? hit.communityId : null;
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
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      physicsRef.current.applyImpulse(dragVxRef.current, dragVyRef.current);
    }
    isRotatingRef.current = false;
    scheduleLoop();
  }, [scheduleLoop]);

  const handleMouseLeave = React.useCallback(() => {
    isDraggingRef.current = false;
    isRotatingRef.current = false;
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      hoveredCommunityIdRef.current = null;
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
