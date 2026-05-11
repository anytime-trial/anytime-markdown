import {
  BLOCK_GAP,
  BUILDING_FOOTPRINT,
  BUILDING_GAP,
  axonometricProject,
  computeCityLayout,
  footprintFromCC,
  heightFromLineCount,
} from '../canvas/codeCityLayout';
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

describe('axonometricProject', () => {
  test('origin maps to (0, 0)', () => {
    const { sx, sy } = axonometricProject(0, 0, 0);
    expect(sx).toBeCloseTo(0);
    expect(sy).toBeCloseTo(0);
  });

  test('positive height moves screen y up (negative sy)', () => {
    const { sy: groundY } = axonometricProject(0, 0, 0);
    const { sy: highY } = axonometricProject(0, 0, 10);
    expect(highY).toBeLessThan(groundY);
  });

  test('moving along ground x rotates screen 30°', () => {
    const { sx, sy } = axonometricProject(10, 0, 0);
    expect(sx).toBeCloseTo(10 * Math.cos(Math.PI / 6));
    expect(sy).toBeCloseTo(10 * Math.sin(Math.PI / 6));
  });

  test('symmetric: swapping x and y mirrors sx', () => {
    const a = axonometricProject(10, 5, 0);
    const b = axonometricProject(5, 10, 0);
    expect(a.sx).toBeCloseTo(-b.sx);
    expect(a.sy).toBeCloseTo(b.sy);
  });
});

describe('footprintFromCC', () => {
  test('cc=0 returns minimum footprint (clamped at 6)', () => {
    expect(footprintFromCC(0)).toBe(6);
  });

  test('cc grows footprint up to the cap', () => {
    const small = footprintFromCC(1);
    const mid = footprintFromCC(16);
    const big = footprintFromCC(64);
    const huge = footprintFromCC(1000);
    expect(mid).toBeGreaterThan(small);
    expect(big).toBeGreaterThanOrEqual(mid);
    expect(huge).toBe(20);
  });

  test('negative cc clamps to minimum', () => {
    expect(footprintFromCC(-5)).toBe(6);
  });
});

describe('heightFromLineCount', () => {
  test('lineCount=0 returns minimum height', () => {
    expect(heightFromLineCount(0)).toBe(4);
  });

  test('lineCount scales linearly within the cap', () => {
    expect(heightFromLineCount(100)).toBeCloseTo(30);
  });

  test('large lineCount caps at 80', () => {
    expect(heightFromLineCount(1000)).toBe(80);
  });

  test('negative lineCount clamps to minimum', () => {
    expect(heightFromLineCount(-10)).toBe(4);
  });
});

describe('computeCityLayout', () => {
  test('empty input returns empty array', () => {
    expect(computeCityLayout([])).toEqual([]);
  });

  test('single community puts buildings in one block', () => {
    const groups: CommunityGroup[] = [
      {
        id: 'pkg/a',
        entries: [
          entry('pkg/a/A.ts', 'fA', { lineCount: 20, cognitiveComplexity: 4 }),
          entry('pkg/a/B.ts', 'fB', { lineCount: 50, cognitiveComplexity: 16 }),
        ],
      },
    ];
    const blocks = computeCityLayout(groups);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe('pkg/a');
    expect(blocks[0]?.buildings).toHaveLength(2);
    expect(blocks[0]?.buildings[0]?.entry.functionName).toBe('fA');
    expect(blocks[0]?.buildings[1]?.entry.functionName).toBe('fB');
  });

  test('block stride is uniform regardless of inner block size', () => {
    const groups: CommunityGroup[] = [
      // 4 buildings: side 2, blockSize = 2*(8+4) = 24
      { id: 'small', entries: Array.from({ length: 4 }, (_, i) => entry(`s/x/${i}.ts`, `s${i}`)) },
      // 16 buildings: side 4, blockSize = 4*(8+4) = 48 (this is max)
      { id: 'big', entries: Array.from({ length: 16 }, (_, i) => entry(`b/y/${i}.ts`, `b${i}`)) },
    ];
    const blocks = computeCityLayout(groups);
    const cellSize = BUILDING_FOOTPRINT + BUILDING_GAP;
    const expectedStride = 4 * cellSize + BLOCK_GAP;
    // Two blocks on a 2-col grid: small=(0,0), big=(1,0)
    expect(blocks[0]?.blockX).toBe(0);
    expect(blocks[1]?.blockX).toBe(expectedStride);
    // Both blocks at row 0 → same blockY
    expect(blocks[0]?.blockY).toBe(0);
    expect(blocks[1]?.blockY).toBe(0);
  });

  test('multi-row grid when community count exceeds square root', () => {
    const groups: CommunityGroup[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      entries: [entry(`c${i}/a/x.ts`, `f${i}`)],
    }));
    const blocks = computeCityLayout(groups);
    expect(blocks).toHaveLength(5);
    // cols = ceil(sqrt(5)) = 3 → first 3 on row 0, last 2 on row 1
    const ys = blocks.map((b) => b.blockY);
    expect(ys[0]).toBe(0);
    expect(ys[2]).toBe(0);
    expect(ys[3]).toBeGreaterThan(0);
  });

  test('buildings within a block are arranged on an inner grid', () => {
    const groups: CommunityGroup[] = [
      {
        id: 'pkg/a',
        entries: [
          entry('pkg/a/1.ts', 'f1'),
          entry('pkg/a/2.ts', 'f2'),
          entry('pkg/a/3.ts', 'f3'),
          entry('pkg/a/4.ts', 'f4'),
        ],
      },
    ];
    const blocks = computeCityLayout(groups);
    const cellSize = BUILDING_FOOTPRINT + BUILDING_GAP;
    const half = cellSize / 2;
    const buildings = blocks[0]!.buildings;
    // 4 buildings → sideCount = 2 → positions: (0,0), (1,0), (0,1), (1,1)
    expect(buildings[0]?.bx).toBeCloseTo(half);
    expect(buildings[0]?.by).toBeCloseTo(half);
    expect(buildings[1]?.bx).toBeCloseTo(cellSize + half);
    expect(buildings[1]?.by).toBeCloseTo(half);
    expect(buildings[2]?.bx).toBeCloseTo(half);
    expect(buildings[2]?.by).toBeCloseTo(cellSize + half);
    expect(buildings[3]?.bx).toBeCloseTo(cellSize + half);
    expect(buildings[3]?.by).toBeCloseTo(cellSize + half);
  });

  test('building footprint reflects cognitiveComplexity', () => {
    const groups: CommunityGroup[] = [
      {
        id: 'pkg/a',
        entries: [
          entry('pkg/a/low.ts', 'low', { cognitiveComplexity: 0 }),
          entry('pkg/a/high.ts', 'high', { cognitiveComplexity: 64 }),
        ],
      },
    ];
    const blocks = computeCityLayout(groups);
    const low = blocks[0]!.buildings.find((b) => b.entry.functionName === 'low');
    const high = blocks[0]!.buildings.find((b) => b.entry.functionName === 'high');
    expect(high?.footprint).toBeGreaterThan(low?.footprint ?? 0);
  });

  test('building height reflects lineCount', () => {
    const groups: CommunityGroup[] = [
      {
        id: 'pkg/a',
        entries: [
          entry('pkg/a/short.ts', 'short', { lineCount: 5 }),
          entry('pkg/a/long.ts', 'long', { lineCount: 200 }),
        ],
      },
    ];
    const blocks = computeCityLayout(groups);
    const short = blocks[0]!.buildings.find((b) => b.entry.functionName === 'short');
    const long = blocks[0]!.buildings.find((b) => b.entry.functionName === 'long');
    expect(long?.height).toBeGreaterThan(short?.height ?? 0);
  });
});
