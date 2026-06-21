/**
 * GalaxyCanvas vanilla factory.
 *
 * Ports the full React GalaxyCanvas to framework-free DOM code.
 * All animation, hit-testing, pan/zoom, and tooltip logic runs in a closure
 * with no React or MUI dependencies.
 */

import { PanPhysics } from '../../../c4/canvas/PanPhysics';
import { groupByCommunity } from '../../../c4/canvas/communityGroup';
import { computeGalaxyLayout, ORBIT_RADIUS } from '../../../c4/canvas/galaxyLayout';
import type { CommunityLayout } from '../../../c4/canvas/galaxyLayout';
import type { FunctionAnalysisApiEntry } from '../../../c4/hooks/fetchFunctionAnalysisApi';
import { assignComplexityTier } from '../../../c4/components/panels/FunctionScatterPlot';
import type { ComplexityTier } from '../../../c4/components/panels/FunctionScatterPlot';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GalaxyCanvasViewProps {
  readonly entries: readonly FunctionAnalysisApiEntry[];
  readonly onFunctionOpen?: (filePath: string, functionName: string, startLine: number) => void;
  readonly height?: number | string;
  readonly isDark?: boolean;
}

export function mountGalaxyCanvas(
  container: HTMLElement,
  initialProps: GalaxyCanvasViewProps,
): VanillaViewHandle<GalaxyCanvasViewProps> {
  // ── Constants (verbatim from GalaxyCanvas.tsx) ────────────────────────────
  const ROLE_COLORS: Record<string, string> = {
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

  const INITIAL_PITCH = Math.PI / 3;
  const INITIAL_YAW = 0;
  const PITCH_MIN = 0.05;
  const PITCH_MAX = Math.PI / 2 - 0.05;
  const ROTATE_SENSITIVITY = 0.006;

  const GALAXY_ROTATION_RATE = 0.000001;
  const ORBIT_SPEED = 0.0005;

  // ---------------------------------------------------------------------------
  // Module-level pure functions (verbatim from GalaxyCanvas.tsx)
  // ---------------------------------------------------------------------------

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
    const yProj = y1 * sinP + z * cosP;
    return {
      sx: x1,
      sy: -yProj,
    };
  }

  type Rgb = readonly [number, number, number];

  function hexToRgb(hex: string): Rgb {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return [128, 128, 128];
    const raw = m[1]!;
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
    ];
  }

  function rgbStr([r, g, b]: Rgb, alpha = 1): string {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function scaleRgb(rgb: Rgb, factor: number): Rgb {
    const cap = (c: number): number => Math.max(0, Math.min(255, Math.round(c * factor)));
    return [cap(rgb[0]), cap(rgb[1]), cap(rgb[2])];
  }

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

    const lightDx = -0.35;
    const lightDy = -0.35;
    const lx = cx + r * lightDx;
    const ly = cy + r * lightDy;

    if (options.glow) {
      const haloR = r * 3.2;
      const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, haloR);
      halo.addColorStop(0, 'rgba(255,200,90,0.55)');
      halo.addColorStop(0.35, 'rgba(255,160,60,0.22)');
      halo.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2);
    }

    const grad = ctx.createRadialGradient(lx, ly, 0, cx, cy, r);
    grad.addColorStop(0, rgbStr(scaleRgb(base, 1.6)));
    grad.addColorStop(0.35, rgbStr(base));
    grad.addColorStop(1, rgbStr(scaleRgb(base, 0.35)));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = dark
      ? rgbStr(scaleRgb(base, 0.35), 0.55)
      : rgbStr(scaleRgb(base, 0.25), 0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  interface ResolvedPoint {
    readonly entry: FunctionAnalysisApiEntry;
    readonly tier: ComplexityTier;
    readonly dataX: number;
    readonly dataY: number;
    readonly isHub: boolean;
    readonly communityId: string;
  }

  interface RotatedCenter {
    readonly id: string;
    readonly rcx: number;
    readonly rcy: number;
  }

  function resolveAnimatedPoints(
    ls: readonly CommunityLayout[],
    elapsedMs: number,
    hoveredCommunityId: string | null,
  ): { points: ResolvedPoint[]; centers: RotatedCenter[] } {
    const galaxyTheta = elapsedMs * GALAXY_ROTATION_RATE;
    const galSin = Math.sin(galaxyTheta);
    const galCos = Math.cos(galaxyTheta);

    const points: ResolvedPoint[] = [];
    const centers: RotatedCenter[] = [];
    for (const community of ls) {
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
      const orbitSpeedScale = community.id === hoveredCommunityId ? 0.15 : 1;
      for (const planet of community.planets) {
        const angularVelocity = 1 / Math.sqrt(Math.max(1, planet.orbitR));
        const orbitTheta =
          planet.orbitTheta0 + elapsedMs * ORBIT_SPEED * orbitSpeedScale * angularVelocity;
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
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          edges.push([indices[i]!, indices[j]!]);
        }
      }
    }
    return edges;
  }

  // ---------------------------------------------------------------------------
  // Closure state
  // ---------------------------------------------------------------------------

  let props = initialProps;
  let layouts: readonly CommunityLayout[] = computeGalaxyLayout(
    groupByCommunity(initialProps.entries),
  );
  const nowMs = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  let animStart = nowMs();
  const initial = resolveAnimatedPoints(layouts, 0, null);
  let points: ResolvedPoint[] = initial.points;
  let centers: RotatedCenter[] = initial.centers;

  const physics = new PanPhysics();

  let rafId = 0;
  let destroyed = false;

  // Camera / drag state
  let pitch = INITIAL_PITCH;
  let yaw = INITIAL_YAW;
  let isDragging = false;
  let isRotating = false;
  let lastMouse = { x: 0, y: 0 };
  let dragVx = 0;
  let dragVy = 0;
  let hovered: ResolvedPoint | null = null;
  let hoveredCommunityId: string | null = null;

  interface TooltipState {
    readonly point: ResolvedPoint;
    readonly x: number;
    readonly y: number;
  }
  let tooltipState: TooltipState | null = null;

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  const heightStyle =
    typeof props.height === 'number' ? `${props.height}px` : (props.height ?? '400px');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative;width:100%;height:${heightStyle}`;
  container.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab';
  wrapper.appendChild(canvas);

  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;display:none;pointer-events:none;z-index:10;border-radius:4px;padding:4px 8px;font-size:11px;max-width:320px';
  wrapper.appendChild(tooltip);

  // ---------------------------------------------------------------------------
  // Tooltip imperative update
  // ---------------------------------------------------------------------------

  function updateTooltipContent(state: TooltipState): void {
    const { point: pt, x, y } = state;
    const dark = props.isDark ?? true;

    tooltip.style.top = `${y + 12}px`;
    tooltip.style.left = `${x + 12}px`;
    tooltip.style.backgroundColor = dark ? 'rgba(20,20,24,0.95)' : 'rgba(255,255,255,0.96)';
    tooltip.style.color = dark ? '#fff' : '#222';
    tooltip.style.border = `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`;

    const roleColor = pt.isHub ? ROLE_COLORS['hub']! : (ROLE_COLORS[pt.entry.functionRole] ?? '#9e9e9e');
    const roleLine = pt.isHub ? 'hub (system center)' : pt.entry.functionRole;
    const metaColor = dark ? '#888' : '#666';
    const statsColor = dark ? '#aaa' : '#555';

    tooltip.innerHTML = [
      `<span style="font-weight:700;font-size:12px;color:${roleColor};display:block;margin-bottom:2px">${roleLine}</span>`,
      `<span style="font-weight:600;font-size:12px;display:block;margin-bottom:2px">${pt.entry.functionName}</span>`,
      `<span style="color:${metaColor};font-size:10px;display:block;margin-bottom:4px">${pt.entry.filePath}</span>`,
      `<span style="display:flex;gap:10px;font-size:10px;color:${statsColor}">`,
      `<span>fanIn <b>${pt.entry.fanIn}</b></span>`,
      `<span>fanOut <b>${pt.entry.fanOut}</b></span>`,
      `<span>CC <b>${pt.entry.cognitiveComplexity}</b></span>`,
      `<span>system <b>${pt.communityId}</b></span>`,
      '</span>',
    ].join('');
    tooltip.style.display = 'block';
  }

  function hideTooltip(): void {
    tooltip.style.display = 'none';
    tooltipState = null;
  }

  function showTooltip(state: TooltipState): void {
    tooltipState = state;
    updateTooltipContent(state);
  }

  // ---------------------------------------------------------------------------
  // Draw function (verbatim logic from GalaxyCanvas.tsx drawRef.current)
  // ---------------------------------------------------------------------------

  function draw(ctx: CanvasRenderingContext2D): void {
    const dark = props.isDark ?? true;
    const dpr = (typeof globalThis !== 'undefined' ? globalThis.devicePixelRatio : null) ?? 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    const wPx = w * dpr;
    const hPx = h * dpr;
    if (canvas.width !== wPx || canvas.height !== hPx) {
      canvas.width = wPx;
      canvas.height = hPx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { viewX, viewY, zoom } = physics;
    const pts = points;

    // Background: space (radial dark)
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

    const cxScreen = w / 2;
    const cyScreen = h / 2;
    const toScreen = (dx: number, dy: number, dz = 0): { sx: number; sy: number } => {
      const tx = (dx - viewX) * zoom;
      const ty = (dy - viewY) * zoom;
      const tz = dz * zoom;
      const p = project3D(tx, ty, tz, pitch, yaw);
      return { sx: cxScreen + p.sx, sy: cyScreen + p.sy };
    };

    // Inter-community edges (parent-directory adjacency)
    const edgeCenters = centers;
    const edges = computeCommunityEdges(edgeCenters);
    ctx.strokeStyle = dark ? 'rgba(120,180,255,0.10)' : 'rgba(40,80,160,0.10)';
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      const { sx: ax, sy: ay } = toScreen(edgeCenters[a]!.rcx, edgeCenters[a]!.rcy);
      const { sx: bx, sy: by } = toScreen(edgeCenters[b]!.rcx, edgeCenters[b]!.rcy);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Orbit lines (subtle, brighter for the hovered community)
    const ORBIT_SAMPLES = 64;
    ctx.lineWidth = 1;
    for (let i = 0; i < edgeCenters.length; i++) {
      const c = edgeCenters[i]!;
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

    // Galactic core: a large warm glow at the galaxy origin (0,0)
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

    // Pass 1: planets + hubs as 3D spheres (z-order: hubs drawn last)
    const nonHubs = pts.filter((p) => !p.isHub);
    const hubs = pts.filter((p) => p.isHub);
    const drawPoint = (pt: ResolvedPoint): void => {
      const { sx, sy } = toScreen(pt.dataX, pt.dataY);
      const baseR = pt.isHub ? HUB_BASE_RADIUS : BASE_RADIUS[pt.tier];
      const r = baseR * Math.sqrt(zoom);
      if (sx + r * 4 < 0 || sx - r * 4 > w || sy + r * 4 < 0 || sy - r * 4 > h) return;

      // Shadow under the sphere
      if (!pt.isHub && r >= 3) {
        const shadowGrad = ctx.createRadialGradient(sx, sy + r * 1.0, 0, sx, sy + r * 1.0, r);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.25)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy + r * 0.9, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const baseHex = pt.isHub
        ? ROLE_COLORS['hub']!
        : (ROLE_COLORS[pt.entry.functionRole] ?? '#9e9e9e');
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

    // Pass 2: labels with collision avoidance (zoom-in only)
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

    // HUD: zoom indicator
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
  }

  // ---------------------------------------------------------------------------
  // Animation loop — runs continuously
  // ---------------------------------------------------------------------------

  function scheduleLoop(): void {
    if (rafId !== 0) return;

    function loop(): void {
      if (destroyed) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const elapsedMs = nowMs() - animStart;
        const resolved = resolveAnimatedPoints(layouts, elapsedMs, hoveredCommunityId);
        points = resolved.points;
        centers = resolved.centers;
        draw(ctx);
      }
      physics.tick();
      rafId = typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(loop)
        : 0;
    }

    rafId = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(loop)
      : 0;
  }

  function requestDraw(): void {
    scheduleLoop();
  }

  // ---------------------------------------------------------------------------
  // Hit test (verbatim from GalaxyCanvas.tsx)
  // ---------------------------------------------------------------------------

  function hitTest(mx: number, my: number, canvasW: number, canvasH: number): ResolvedPoint | null {
    const { viewX, viewY, zoom } = physics;
    const cxScreen = canvasW / 2;
    const cyScreen = canvasH / 2;
    const pts = points;
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
  }

  // ---------------------------------------------------------------------------
  // Mouse handlers (named functions for removeEventListener)
  // ---------------------------------------------------------------------------

  function handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    isRotating = e.shiftKey;
    isDragging = !e.shiftKey;
    lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragVx = 0;
    dragVy = 0;
    canvas.style.cursor = 'grabbing';
    scheduleLoop();
  }

  function handleMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    if (isRotating) {
      const dx = mx - lastMouse.x;
      const dy = my - lastMouse.y;
      yaw += dx * ROTATE_SENSITIVITY;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - dy * ROTATE_SENSITIVITY));
      lastMouse = { x: mx, y: my };
      requestDraw();
      return;
    }

    if (isDragging) {
      const dx = (mx - lastMouse.x) * PAN_SENSITIVITY;
      const dy = (my - lastMouse.y) * PAN_SENSITIVITY;
      dragVx = -dx / physics.zoom;
      dragVy = dy / physics.zoom;
      physics.pan(dx, dy);
      lastMouse = { x: mx, y: my };
      return;
    }

    const hit = hitTest(mx, my, cw, ch);
    if (hit !== hovered) {
      hovered = hit;
      hoveredCommunityId = hit ? hit.communityId : null;
      if (hit) {
        showTooltip({ point: hit, x: mx, y: my });
      } else {
        hideTooltip();
      }
      requestDraw();
    } else if (hit && tooltipState) {
      showTooltip({ point: hit, x: mx, y: my });
    }
  }

  function handleMouseUp(): void {
    if (isDragging) {
      isDragging = false;
      physics.applyImpulse(dragVx, dragVy);
    }
    isRotating = false;
    canvas.style.cursor = 'grab';
    scheduleLoop();
  }

  function handleMouseLeave(): void {
    isDragging = false;
    isRotating = false;
    canvas.style.cursor = 'grab';
    if (hovered !== null) {
      hovered = null;
      hoveredCommunityId = null;
      hideTooltip();
      requestDraw();
    }
  }

  function handleClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTest(mx, my, canvas.clientWidth, canvas.clientHeight);
    if (hit && props.onFunctionOpen) {
      props.onFunctionOpen(hit.entry.filePath, hit.entry.functionName, hit.entry.startLine);
    }
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { viewX, viewY } = physics;
    const anchorDataX = mouseX / physics.zoom + viewX;
    const anchorDataY = (canvas.clientHeight - mouseY) / physics.zoom + viewY;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const newZoom = Math.max(0.05, Math.min(500, physics.zoom * factor));
    physics.zoomAt(newZoom / physics.zoom, anchorDataX, anchorDataY);
    requestDraw();
  }

  // ---------------------------------------------------------------------------
  // Register listeners
  // ---------------------------------------------------------------------------

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // ---------------------------------------------------------------------------
  // ResizeObserver (jsdom guard)
  // ---------------------------------------------------------------------------

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      requestDraw();
    });
    ro.observe(canvas);
  }

  // ---------------------------------------------------------------------------
  // Initial fit + start loop
  // ---------------------------------------------------------------------------

  const initW = canvas.clientWidth || 600;
  const rawH = props.height;
  const initH = canvas.clientHeight || (typeof rawH === 'number' ? rawH : 400);
  if (points.length > 0) {
    physics.fitToData(
      points.map((p) => ({ x: p.dataX, y: p.dataY })),
      initW,
      initH,
      60,
    );
  }
  scheduleLoop();

  // ---------------------------------------------------------------------------
  // VanillaViewHandle
  // ---------------------------------------------------------------------------

  function update(newProps: GalaxyCanvasViewProps): void {
    const entriesChanged = newProps.entries !== props.entries;
    props = newProps;

    if (entriesChanged) {
      layouts = computeGalaxyLayout(groupByCommunity(newProps.entries));
      animStart = nowMs();
      const resolved = resolveAnimatedPoints(layouts, 0, hoveredCommunityId);
      points = resolved.points;
      centers = resolved.centers;

      // Re-fit to new data
      const w = canvas.clientWidth || 600;
      const rh = newProps.height;
      const h = canvas.clientHeight || (typeof rh === 'number' ? rh : 400);
      if (points.length > 0) {
        physics.fitToData(
          points.map((p) => ({ x: p.dataX, y: p.dataY })),
          w,
          h,
          60,
        );
      }
    }

    // Update wrapper height if changed
    const newHeightStyle =
      typeof newProps.height === 'number' ? `${newProps.height}px` : (newProps.height ?? '400px');
    if (wrapper.style.height !== newHeightStyle) {
      wrapper.style.height = newHeightStyle;
    }

    // Refresh tooltip colors on theme change
    if (tooltipState) {
      updateTooltipContent(tooltipState);
    }

    requestDraw();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafId);
    }
    rafId = 0;
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('click', handleClick);
    ro?.disconnect();
    wrapper.remove();
  }

  return { update, destroy };
}
