/**
 * Additional branch tests for bucketing.ts:
 * - toLocalDateString throws on invalid ISO (line 30)
 * - getTimezoneOffsetMinutes returns 0 when GMT regex doesn't match
 * - enumerateBuckets with weekly and monthly bucket sizes
 * - advance with '1M' (month bucket) crosses year boundary
 */
import {
  enumerateBuckets,
  floorToBucketStart,
  getTimezoneOffsetMinutes,
  toLocalDateString,
} from '../bucketing';

describe('bucketing branches', () => {
  test('toLocalDateString throws for invalid ISO string', () => {
    expect(() => toLocalDateString('not-a-date', 'Asia/Tokyo')).toThrow('invalid utc iso');
  });

  test('getTimezoneOffsetMinutes returns 0 for UTC timezone', () => {
    // UTC offset is 0
    const offset = getTimezoneOffsetMinutes('UTC');
    expect(offset).toBe(0);
  });

  test('getTimezoneOffsetMinutes returns positive offset for JST (UTC+9)', () => {
    const offset = getTimezoneOffsetMinutes('Asia/Tokyo');
    expect(offset).toBe(540); // 9 * 60
  });

  test('getTimezoneOffsetMinutes returns negative offset for US/Eastern', () => {
    // EST = UTC-5 or EDT = UTC-4; should be negative
    const offset = getTimezoneOffsetMinutes('America/New_York');
    expect(offset).toBeLessThan(0);
  });

  test('enumerateBuckets with weekly buckets (1w) enumerates weeks', () => {
    // from Mon 2026-04-27 to Sun 2026-05-10 (two weeks)
    const buckets = enumerateBuckets(
      '2026-04-26T15:00:00.000Z', // → JST 2026-04-27
      '2026-05-10T14:59:59.999Z', // → JST 2026-05-10
      '1w',
      'Asia/Tokyo',
    );
    // week starting 2026-04-27 and week starting 2026-05-04
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toBe('2026-04-27');
    expect(buckets[1]).toBe('2026-05-04');
  });

  test('enumerateBuckets with monthly buckets (1M) enumerates months', () => {
    const buckets = enumerateBuckets(
      '2026-01-15T00:00:00.000Z',
      '2026-03-15T00:00:00.000Z',
      '1M',
      'UTC',
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toBe('2026-01-01');
    expect(buckets[1]).toBe('2026-02-01');
    expect(buckets[2]).toBe('2026-03-01');
  });

  test('enumerateBuckets advances across year boundary for monthly', () => {
    const buckets = enumerateBuckets(
      '2025-12-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '1M',
      'UTC',
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toBe('2025-12-01');
    expect(buckets[1]).toBe('2026-01-01');
    expect(buckets[2]).toBe('2026-02-01');
  });

  test('floorToBucketStart with 1d returns the same date', () => {
    expect(floorToBucketStart('2026-04-15', '1d')).toBe('2026-04-15');
  });

  test('floorToBucketStart with 1w floors to Monday', () => {
    // 2026-04-30 is a Thursday → Monday is 2026-04-27
    expect(floorToBucketStart('2026-04-30', '1w')).toBe('2026-04-27');
    // 2026-04-27 is a Monday → stays
    expect(floorToBucketStart('2026-04-27', '1w')).toBe('2026-04-27');
    // 2026-05-03 is a Sunday → Monday is 2026-04-27
    expect(floorToBucketStart('2026-05-03', '1w')).toBe('2026-04-27');
  });
});
