import type { C4Model } from '../../c4/types';
import { computeActivityTrend } from '../computeActivityTrend';

function makeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'pkg_core', type: 'container', name: 'Core' },
      { id: 'pkg_core/x', type: 'component', name: 'X', boundaryId: 'pkg_core' },
      { id: 'pkg_core/y', type: 'component', name: 'Y', boundaryId: 'pkg_core' },
      { id: 'file::x/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_core/x' },
      { id: 'file::y/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_core/y' },
    ],
    relationships: [],
  };
}

describe('computeActivityTrend', () => {
  test('aggregates 7d period with daily buckets', () => {
    const result = computeActivityTrend({
      rows: [
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'x/a.ts' },
        { committedAt: '2026-04-26T10:00:00.000Z', filePath: 'x/a.ts' },
        { committedAt: '2026-04-26T15:00:00.000Z', filePath: 'x/a.ts' },
        { committedAt: '2026-04-28T10:00:00.000Z', filePath: 'x/a.ts' },
      ],
      elementId: 'pkg_core/x',
      granularity: 'commit',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeModel(),
      timeZone: 'Asia/Tokyo',
    });
    expect(result.type).toBe('single-series');
    if (result.type !== 'single-series') return;
    const totals = result.buckets.reduce((s, b) => s + b.count, 0);
    expect(totals).toBe(4);
    expect(result.bucketSize).toBe('1d');
  });

  test('descendant filter excludes files not under elementId', () => {
    const result = computeActivityTrend({
      rows: [
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'x/a.ts' },
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'y/b.ts' },
      ],
      elementId: 'pkg_core/x',
      granularity: 'commit',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeModel(),
      timeZone: 'Asia/Tokyo',
    });
    if (result.type !== 'single-series') throw new Error('expected single-series');
    expect(result.buckets.reduce((s, b) => s + b.count, 0)).toBe(1);
  });

  test('subagent granularity yields multi-series', () => {
    const result = computeActivityTrend({
      rows: [
        { committedAt: '2026-04-25T10:00:00.000Z', filePath: 'x/a.ts', subagentType: 'general-purpose' },
        { committedAt: '2026-04-26T10:00:00.000Z', filePath: 'x/a.ts', subagentType: 'general-purpose' },
        { committedAt: '2026-04-26T10:00:00.000Z', filePath: 'x/a.ts', subagentType: 'Explore' },
      ],
      elementId: 'pkg_core/x',
      granularity: 'subagent',
      period: '7d',
      from: '2026-04-23T00:00:00.000Z',
      to: '2026-04-29T23:59:59.999Z',
      c4Model: makeModel(),
      timeZone: 'Asia/Tokyo',
    });
    expect(result.type).toBe('multi-series');
    if (result.type !== 'multi-series') return;
    expect(result.series).toHaveLength(2);
    expect(result.series[0].key).toBe('general-purpose');
  });

  test("period 'all' selects 1M bucket size", () => {
    const result = computeActivityTrend({
      rows: [],
      elementId: 'pkg_core/x',
      granularity: 'commit',
      period: 'all',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-04-30T00:00:00.000Z',
      c4Model: makeModel(),
      timeZone: 'Asia/Tokyo',
    });
    expect(result.bucketSize).toBe('1M');
  });

  test('UTC 15:30 commit is bucketed to next day in JST (UTC->JST = +9h)', () => {
    const result = computeActivityTrend({
      rows: [{ committedAt: '2026-04-25T15:30:00.000Z', filePath: 'x/a.ts' }],
      elementId: 'pkg_core/x',
      granularity: 'commit',
      period: '7d',
      from: '2026-04-22T15:00:00.000Z',
      to: '2026-04-29T14:59:59.999Z',
      c4Model: makeModel(),
      timeZone: 'Asia/Tokyo',
    });
    if (result.type !== 'single-series') throw new Error('expected single-series');
    const apr26 = result.buckets.find((b) => b.date === '2026-04-26');
    const apr25 = result.buckets.find((b) => b.date === '2026-04-25');
    expect(apr26?.count).toBe(1);
    expect(apr25?.count).toBe(0);
  });
});
