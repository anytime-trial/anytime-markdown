import { buildTimeSeries, buildRatioTimeSeries, median } from '../../domain/metrics/timeSeriesUtils';
import type { DateRange } from '../../domain/metrics/types';

const range: DateRange = {
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-04-07T23:59:59.999Z',
};

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the single value for one-element array', () => {
    expect(median([5])).toBe(5);
  });

  it('returns middle value for odd-length array', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('buildTimeSeries', () => {
  it('sums values in the same day bucket', () => {
    const events = [
      { date: '2026-04-01T08:00:00.000Z', value: 10 },
      { date: '2026-04-01T15:00:00.000Z', value: 5 },
      { date: '2026-04-03T09:00:00.000Z', value: 3 },
    ];
    const ts = buildTimeSeries(events, range, 'day', 'sum');
    const apr1 = ts.find((b) => b.bucketStart.startsWith('2026-04-01'));
    expect(apr1?.value).toBe(15);
    const apr3 = ts.find((b) => b.bucketStart.startsWith('2026-04-03'));
    expect(apr3?.value).toBe(3);
  });

  it('uses median aggregation', () => {
    const events = [
      { date: '2026-04-01T08:00:00.000Z', value: 10 },
      { date: '2026-04-01T12:00:00.000Z', value: 20 },
      { date: '2026-04-01T16:00:00.000Z', value: 30 },
    ];
    const ts = buildTimeSeries(events, range, 'day', 'median');
    const apr1 = ts.find((b) => b.bucketStart.startsWith('2026-04-01'));
    expect(apr1?.value).toBe(20);
  });

  it('skips events outside the range', () => {
    const events = [
      { date: '2026-03-31T23:59:59.000Z', value: 100 },
      { date: '2026-04-08T00:00:00.000Z', value: 100 },
      { date: '2026-04-02T10:00:00.000Z', value: 7 },
    ];
    const ts = buildTimeSeries(events, range, 'day', 'sum');
    const total = ts.reduce((s, b) => s + b.value, 0);
    expect(total).toBe(7);
  });

  it('builds weekly buckets', () => {
    const weekRange: DateRange = {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
    };
    const events = [
      { date: '2026-04-01T10:00:00.000Z', value: 1 },
      { date: '2026-04-08T10:00:00.000Z', value: 2 },
    ];
    const ts = buildTimeSeries(events, weekRange, 'week', 'sum');
    const total = ts.reduce((s, b) => s + b.value, 0);
    expect(total).toBe(3);
  });
});

describe('buildRatioTimeSeries', () => {
  it('computes ratio per bucket', () => {
    const samples = [
      { date: '2026-04-01T10:00:00.000Z', numerator: 3, denominator: 10 },
      { date: '2026-04-01T14:00:00.000Z', numerator: 2, denominator: 10 },
    ];
    const ts = buildRatioTimeSeries(samples, range, 'day');
    const apr1 = ts.find((b) => b.bucketStart.startsWith('2026-04-01'));
    expect(apr1?.value).toBeCloseTo(0.25);
  });

  it('returns 0 when denominator is 0 for the bucket', () => {
    const ts = buildRatioTimeSeries([], range, 'day');
    expect(ts.every((b) => b.value === 0)).toBe(true);
  });

  it('skips samples outside the range', () => {
    const samples = [
      { date: '2026-03-31T10:00:00.000Z', numerator: 99, denominator: 100 },
      { date: '2026-04-02T10:00:00.000Z', numerator: 1, denominator: 2 },
    ];
    const ts = buildRatioTimeSeries(samples, range, 'day');
    const total = ts.reduce((s, b) => s + b.value, 0);
    expect(total).toBeCloseTo(0.5);
  });
});
