/**
 * Branch coverage tests for computeActivityTrend:
 * - collectDescendantFilePaths when elementId is a code element directly (lines 38-40)
 * - subagent multi-series with a new subagentType seen for first time (line 113 ?? buildEmptyBuckets)
 * - subagentTopK limiting (line 115)
 * - subagentType is null/undefined → falls back to 'unknown'
 */
import type { C4Model } from '../../c4/types';
import { computeActivityTrend } from '../computeActivityTrend';

function makeCodeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'pkg_core', type: 'container', name: 'Core' },
      { id: 'pkg_core/mod', type: 'component', name: 'Mod', boundaryId: 'pkg_core' },
      { id: 'file::src/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_core/mod' },
      { id: 'file::src/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_core/mod' },
    ],
    relationships: [],
  };
}

describe('computeActivityTrend branch coverage', () => {
  test('elementId is a code element directly (lines 38-40)', () => {
    // Passing a code element id directly triggers the isCodeElement branch
    const result = computeActivityTrend({
      rows: [
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'src/a.ts' },
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'src/b.ts' },
      ],
      elementId: 'file::src/a.ts', // code element — direct match
      granularity: 'commit',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeCodeModel(),
      timeZone: 'Asia/Tokyo',
    });
    if (result.type !== 'single-series') throw new Error('expected single-series');
    const total = result.buckets.reduce((s, b) => s + b.count, 0);
    // Only src/a.ts is included
    expect(total).toBe(1);
  });

  test('elementId not found in model returns no rows', () => {
    const result = computeActivityTrend({
      rows: [
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'src/a.ts' },
      ],
      elementId: 'pkg_nonexistent',
      granularity: 'commit',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeCodeModel(),
      timeZone: 'Asia/Tokyo',
    });
    if (result.type !== 'single-series') throw new Error('expected single-series');
    expect(result.buckets.reduce((s, b) => s + b.count, 0)).toBe(0);
  });

  test('subagent granularity: first occurrence of type hits ?? buildEmptyBuckets (line 113)', () => {
    // Two different subagentTypes, second one hits the ?? branch on first encounter
    const result = computeActivityTrend({
      rows: [
        {
          committedAt: '2026-04-25T10:00:00.000Z',
          filePath: 'src/a.ts',
          subagentType: 'general-purpose',
        },
        {
          committedAt: '2026-04-26T10:00:00.000Z',
          filePath: 'src/a.ts',
          subagentType: 'Explore',
        },
        // Second entry for same type — this hits the existing buckets branch
        {
          committedAt: '2026-04-27T10:00:00.000Z',
          filePath: 'src/a.ts',
          subagentType: 'general-purpose',
        },
      ],
      elementId: 'pkg_core/mod',
      granularity: 'subagent',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeCodeModel(),
      timeZone: 'Asia/Tokyo',
    });
    expect(result.type).toBe('multi-series');
    if (result.type !== 'multi-series') return;
    expect(result.series).toHaveLength(2);
    const gp = result.series.find((s) => s.key === 'general-purpose');
    expect(gp?.buckets.reduce((s, b) => s + b.count, 0)).toBe(2);
  });

  test('subagentTopK limits series to specified count', () => {
    const rows = ['t1', 't2', 't3', 't4', 't5', 't6'].map((type, i) => ({
      committedAt: `2026-04-2${i + 1}T10:00:00.000Z`,
      filePath: 'src/a.ts',
      subagentType: type,
    }));
    const result = computeActivityTrend({
      rows,
      elementId: 'pkg_core/mod',
      granularity: 'subagent',
      period: '7d',
      from: '2026-04-20T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeCodeModel(),
      timeZone: 'Asia/Tokyo',
      subagentTopK: 3,
    });
    if (result.type !== 'multi-series') throw new Error('expected multi-series');
    expect(result.series).toHaveLength(3);
  });

  test('subagentType undefined falls back to "unknown"', () => {
    const result = computeActivityTrend({
      rows: [
        {
          committedAt: '2026-04-25T10:00:00.000Z',
          filePath: 'src/a.ts',
          subagentType: undefined,
        },
      ],
      elementId: 'pkg_core/mod',
      granularity: 'subagent',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeCodeModel(),
      timeZone: 'Asia/Tokyo',
    });
    if (result.type !== 'multi-series') throw new Error('expected multi-series');
    expect(result.series[0].key).toBe('unknown');
  });
});
