import {
  ORBIT_RADIUS,
  SPIRAL_BASE_RADIUS,
  computeCommunityCenters,
  computeCommunityLayout,
  computeGalaxyLayout,
} from '../canvas/galaxyLayout';
import type { CommunityGroup } from '../canvas/communityGroup';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

function entry(
  filePath: string,
  functionName: string,
  extras: Partial<FunctionAnalysisApiEntry> = {},
): FunctionAnalysisApiEntry {
  return {
    filePath,
    functionName,
    startLine: 1,
    endLine: 10,
    language: 'ts',
    fanIn: 0,
    fanOut: 0,
    distinctCallees: 0,
    cognitiveComplexity: 0,
    dataMutationScore: 0,
    sideEffectScore: 0,
    lineCount: 10,
    importanceScore: 0,
    functionRole: 'leaf',
    signals: { fanInZero: false },
    ...extras,
  };
}

describe('computeCommunityCenters', () => {
  test('places first community at radius = SPIRAL_BASE_RADIUS', () => {
    const communities: CommunityGroup[] = [{ id: 'a/x', entries: [] }];
    const centers = computeCommunityCenters(communities);
    expect(centers).toHaveLength(1);
    // r = SPIRAL_BASE_RADIUS * sqrt(1), theta = 0
    expect(centers[0]?.cx).toBeCloseTo(SPIRAL_BASE_RADIUS);
    expect(centers[0]?.cy).toBeCloseTo(0);
  });

  test('places subsequent communities at increasing radius', () => {
    const communities: CommunityGroup[] = [
      { id: 'a', entries: [] },
      { id: 'b', entries: [] },
      { id: 'c', entries: [] },
      { id: 'd', entries: [] },
    ];
    const centers = computeCommunityCenters(communities);
    const radii = centers.map((c) => Math.hypot(c.cx, c.cy));
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]!);
    }
  });

  test('preserves community order in output', () => {
    const communities: CommunityGroup[] = [
      { id: 'a', entries: [] },
      { id: 'b', entries: [] },
      { id: 'c', entries: [] },
    ];
    const centers = computeCommunityCenters(communities);
    expect(centers.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('computeCommunityLayout', () => {
  test('selects max-fanIn function among role=hub as hub', () => {
    const group: CommunityGroup = {
      id: 'a/x',
      entries: [
        entry('a/x/1.ts', 'lowHub', { functionRole: 'hub', fanIn: 3 }),
        entry('a/x/2.ts', 'highHub', { functionRole: 'hub', fanIn: 10 }),
        entry('a/x/3.ts', 'orch', { functionRole: 'orchestrator', fanIn: 5 }),
      ],
    };
    const { hub, planets } = computeCommunityLayout(group);
    expect(hub?.functionName).toBe('highHub');
    // lowHub goes on the inner hub orbit, orch on orchestrator orbit
    expect(planets).toHaveLength(2);
    expect(planets.find((p) => p.entry.functionName === 'lowHub')).toBeDefined();
    expect(planets.find((p) => p.entry.functionName === 'orch')?.orbitR).toBe(
      ORBIT_RADIUS.orchestrator,
    );
  });

  test('falls back to max-fanIn entry when no role=hub exists', () => {
    const group: CommunityGroup = {
      id: 'a/x',
      entries: [
        entry('a/x/1.ts', 'a', { functionRole: 'orchestrator', fanIn: 3 }),
        entry('a/x/2.ts', 'b', { functionRole: 'leaf', fanIn: 10 }),
      ],
    };
    const { hub, planets } = computeCommunityLayout(group);
    expect(hub?.functionName).toBe('b');
    expect(planets).toHaveLength(1);
    expect(planets[0]?.entry.functionName).toBe('a');
    expect(planets[0]?.orbitR).toBe(ORBIT_RADIUS.orchestrator);
  });

  test('assigns orbit radius by role', () => {
    const group: CommunityGroup = {
      id: 'a/x',
      entries: [
        entry('a/x/1.ts', 'hub', { functionRole: 'hub', fanIn: 10 }),
        entry('a/x/2.ts', 'orch', { functionRole: 'orchestrator' }),
        entry('a/x/3.ts', 'leaf', { functionRole: 'leaf' }),
        entry('a/x/4.ts', 'peri', { functionRole: 'peripheral' }),
      ],
    };
    const { planets } = computeCommunityLayout(group);
    expect(planets.find((p) => p.entry.functionName === 'orch')?.orbitR).toBe(
      ORBIT_RADIUS.orchestrator,
    );
    expect(planets.find((p) => p.entry.functionName === 'leaf')?.orbitR).toBe(ORBIT_RADIUS.leaf);
    expect(planets.find((p) => p.entry.functionName === 'peri')?.orbitR).toBe(
      ORBIT_RADIUS.peripheral,
    );
  });

  test('distributes angles evenly within each orbit', () => {
    const group: CommunityGroup = {
      id: 'a/x',
      entries: [
        entry('a/x/1.ts', 'hub', { functionRole: 'hub', fanIn: 10 }),
        entry('a/x/2.ts', 'leaf1', { functionRole: 'leaf', fanIn: 3 }),
        entry('a/x/3.ts', 'leaf2', { functionRole: 'leaf', fanIn: 2 }),
        entry('a/x/4.ts', 'leaf3', { functionRole: 'leaf', fanIn: 1 }),
      ],
    };
    const { planets } = computeCommunityLayout(group);
    const leafThetas = planets
      .filter((p) => p.entry.functionRole === 'leaf')
      .map((p) => p.orbitTheta0)
      .sort((a, b) => a - b);
    expect(leafThetas).toHaveLength(3);
    // Evenly distributed: 0, 2π/3, 4π/3
    expect(leafThetas[1]! - leafThetas[0]!).toBeCloseTo((2 * Math.PI) / 3);
    expect(leafThetas[2]! - leafThetas[1]!).toBeCloseTo((2 * Math.PI) / 3);
  });

  test('handles empty community', () => {
    const group: CommunityGroup = { id: 'a/x', entries: [] };
    const { hub, planets } = computeCommunityLayout(group);
    expect(hub).toBeNull();
    expect(planets).toEqual([]);
  });
});

describe('computeGalaxyLayout', () => {
  test('combines spiral centers with per-community layouts', () => {
    const communities: CommunityGroup[] = [
      {
        id: 'a/x',
        entries: [
          entry('a/x/1.ts', 'hub', { functionRole: 'hub', fanIn: 10 }),
          entry('a/x/2.ts', 'leaf', { functionRole: 'leaf' }),
        ],
      },
      {
        id: 'b/y',
        entries: [entry('b/y/1.ts', 'orch', { functionRole: 'orchestrator' })],
      },
    ];
    const layout = computeGalaxyLayout(communities);
    expect(layout).toHaveLength(2);
    expect(layout[0]?.id).toBe('a/x');
    expect(layout[0]?.hub?.functionName).toBe('hub');
    expect(layout[0]?.planets).toHaveLength(1);
    // 'orch' becomes the hub of b/y as the only entry → planets empty
    expect(layout[1]?.id).toBe('b/y');
    expect(layout[1]?.hub?.functionName).toBe('orch');
    expect(layout[1]?.planets).toHaveLength(0);
  });

  test('handles empty input', () => {
    expect(computeGalaxyLayout([])).toEqual([]);
  });
});
