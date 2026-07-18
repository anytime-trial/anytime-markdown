// Phase 6 S5-C: ドリフト件数の日次推移（FR-26）。JST 境界と 0 埋めを固定する。
import { aggregateDriftByDay } from '../aggregateDriftByDay';

describe('aggregateDriftByDay', () => {
  test('検知・解決を日次で数える', () => {
    const points = aggregateDriftByDay([
      { detectedAt: '2026-07-01T03:00:00.000Z', resolvedAt: null },
      { detectedAt: '2026-07-01T04:00:00.000Z', resolvedAt: '2026-07-02T05:00:00.000Z' },
    ]);
    expect(points).toEqual([
      { date: '2026-07-01', detectedCount: 2, resolvedCount: 0, unresolvedCumulative: 2 },
      { date: '2026-07-02', detectedCount: 0, resolvedCount: 1, unresolvedCumulative: 1 },
    ]);
  });

  test('日次境界は JST（UTC 15:00 以降は翌日に入る）', () => {
    const points = aggregateDriftByDay(
      [
        // JST では 2026-07-02 00:30
        { detectedAt: '2026-07-01T15:30:00.000Z', resolvedAt: null },
        // JST では 2026-07-01 23:30
        { detectedAt: '2026-07-01T14:30:00.000Z', resolvedAt: null },
      ],
      { timeZone: 'Asia/Tokyo' },
    );
    expect(points.map((p) => [p.date, p.detectedCount])).toEqual([
      ['2026-07-01', 1],
      ['2026-07-02', 1],
    ]);
  });

  test('UTC を指定すると境界が変わる（TZ が効いている証拠）', () => {
    const points = aggregateDriftByDay(
      [{ detectedAt: '2026-07-01T15:30:00.000Z', resolvedAt: null }],
      { timeZone: 'UTC' },
    );
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe('2026-07-01');
  });

  test('イベントの無い日も 0 で埋める（欠測と 0 件を区別する）', () => {
    const points = aggregateDriftByDay([
      { detectedAt: '2026-07-01T03:00:00.000Z', resolvedAt: null },
      { detectedAt: '2026-07-04T03:00:00.000Z', resolvedAt: null },
    ]);
    expect(points.map((p) => p.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]);
    expect(points[1]).toEqual({
      date: '2026-07-02',
      detectedCount: 0,
      resolvedCount: 0,
      unresolvedCumulative: 1,
    });
  });

  test('since / until を渡すと範囲が固定される', () => {
    const points = aggregateDriftByDay(
      [{ detectedAt: '2026-07-03T03:00:00.000Z', resolvedAt: null }],
      { sinceIso: '2026-07-01T00:00:00.000Z', untilIso: '2026-07-05T00:00:00.000Z' },
    );
    expect(points.map((p) => p.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]);
  });

  test('未解決累計は解決で減る', () => {
    const points = aggregateDriftByDay([
      { detectedAt: '2026-07-01T03:00:00.000Z', resolvedAt: '2026-07-03T03:00:00.000Z' },
      { detectedAt: '2026-07-01T04:00:00.000Z', resolvedAt: null },
      { detectedAt: '2026-07-02T03:00:00.000Z', resolvedAt: '2026-07-02T09:00:00.000Z' },
    ]);
    expect(points.map((p) => p.unresolvedCumulative)).toEqual([2, 2, 1]);
  });

  test('範囲外で検知され範囲内で解決された分でも累計は負にならない', () => {
    const points = aggregateDriftByDay(
      [{ detectedAt: '2026-06-01T03:00:00.000Z', resolvedAt: '2026-07-02T03:00:00.000Z' }],
      { sinceIso: '2026-07-01T00:00:00.000Z', untilIso: '2026-07-03T00:00:00.000Z' },
    );
    expect(points.every((p) => p.unresolvedCumulative >= 0)).toBe(true);
  });

  test('イベントが無ければ空配列（範囲指定なし）', () => {
    expect(aggregateDriftByDay([])).toEqual([]);
  });

  test('イベントが無くても範囲指定があれば 0 の系列を返す', () => {
    const points = aggregateDriftByDay([], {
      sinceIso: '2026-07-01T00:00:00.000Z',
      untilIso: '2026-07-02T00:00:00.000Z',
    });
    expect(points).toEqual([
      { date: '2026-07-01', detectedCount: 0, resolvedCount: 0, unresolvedCumulative: 0 },
      { date: '2026-07-02', detectedCount: 0, resolvedCount: 0, unresolvedCumulative: 0 },
    ]);
  });
});
