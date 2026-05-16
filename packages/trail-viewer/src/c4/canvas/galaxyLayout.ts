import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';
import type { CommunityGroup } from './communityGroup';

/** Golden angle ≈ 137.5° — evenly distributes spiral arms. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Base radius for the Archimedean spiral that positions community centers. */
export const SPIRAL_BASE_RADIUS = 150;

/** Orbit radii (data-space units) for each role around the community's hub. */
export const ORBIT_RADIUS: Record<FunctionRole, number> = {
  hub: 0,
  orchestrator: 30,
  leaf: 55,
  peripheral: 80,
};

export interface PlanetLayout {
  readonly entry: FunctionAnalysisApiEntry;
  /** Orbit radius around the community center, in data-space units. */
  readonly orbitR: number;
  /** Initial angle (radians). Animation adds elapsed-time-based rotation. */
  readonly orbitTheta0: number;
}

export interface CommunityLayout {
  readonly id: string;
  /** Community center in galaxy-plane data-space coordinates. */
  readonly cx: number;
  readonly cy: number;
  /** The hub function placed at (cx, cy). null only when the community is empty. */
  readonly hub: FunctionAnalysisApiEntry | null;
  /** Orchestrator / leaf / peripheral functions placed on concentric orbits. */
  readonly planets: readonly PlanetLayout[];
}

/**
 * Place communities on an Archimedean spiral with golden-angle stepping.
 * Larger communities (sorted earlier by groupByCommunity) land closer to the
 * galactic center.
 */
export function computeCommunityCenters(
  communities: readonly CommunityGroup[],
): { id: string; cx: number; cy: number }[] {
  return communities.map((community, i) => {
    const r = SPIRAL_BASE_RADIUS * Math.sqrt(i + 1);
    const theta = i * GOLDEN_ANGLE;
    return {
      id: community.id,
      cx: r * Math.cos(theta),
      cy: r * Math.sin(theta),
    };
  });
}

/**
 * Within a community, pick the hub function (max fanIn among role='hub', or
 * max fanIn overall as fallback) and place remaining functions on concentric
 * orbits by role.
 *
 * Angle within each orbit is determined by descending (fanIn + fanOut), so the
 * "most connected" planet sits at angle 0 and others spread evenly clockwise.
 */
export function computeCommunityLayout(community: CommunityGroup): {
  hub: FunctionAnalysisApiEntry | null;
  planets: PlanetLayout[];
} {
  if (community.entries.length === 0) {
    return { hub: null, planets: [] };
  }

  const sortedByFanIn = [...community.entries].sort((a, b) => b.fanIn - a.fanIn);
  const hubsByRole = sortedByFanIn.filter((e) => e.functionRole === 'hub');
  const hub = hubsByRole[0] ?? sortedByFanIn[0]!;

  const byRole = new Map<FunctionRole, FunctionAnalysisApiEntry[]>();
  for (const e of community.entries) {
    if (e === hub) continue;
    let bucket = byRole.get(e.functionRole);
    if (!bucket) {
      bucket = [];
      byRole.set(e.functionRole, bucket);
    }
    bucket.push(e);
  }

  const planets: PlanetLayout[] = [];
  for (const [role, group] of byRole) {
    if (role === 'hub') {
      // Additional hub-role functions (besides the chosen center) go on the
      // innermost non-zero orbit so they remain visible.
      const innerR = ORBIT_RADIUS.orchestrator * 0.6;
      group.sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));
      group.forEach((entry, i) => {
        const baseAngle = (i / group.length) * 2 * Math.PI;
        planets.push({ entry, orbitR: innerR, orbitTheta0: baseAngle });
      });
      continue;
    }
    const orbitR = ORBIT_RADIUS[role];
    group.sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));
    group.forEach((entry, i) => {
      const baseAngle = (i / group.length) * 2 * Math.PI;
      planets.push({ entry, orbitR, orbitTheta0: baseAngle });
    });
  }
  return { hub, planets };
}

/**
 * Combine spiral community centers + per-community planet layouts.
 * Output is in the same order as the input communities.
 */
export function computeGalaxyLayout(
  communities: readonly CommunityGroup[],
): CommunityLayout[] {
  const centers = computeCommunityCenters(communities);
  return communities.map((community, i) => {
    const { hub, planets } = computeCommunityLayout(community);
    const center = centers[i]!;
    return {
      id: community.id,
      cx: center.cx,
      cy: center.cy,
      hub,
      planets,
    };
  });
}
