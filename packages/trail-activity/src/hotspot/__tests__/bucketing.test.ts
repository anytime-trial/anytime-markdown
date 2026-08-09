import {
  enumerateBuckets,
  floorToBucketStart,
  pickBucketSize,
  toLocalDateString,
} from '../bucketing';

describe('bucketing', () => {
  test('pickBucketSize maps period correctly', () => {
    expect(pickBucketSize('7d')).toBe('1d');
    expect(pickBucketSize('30d')).toBe('1d');
    expect(pickBucketSize('90d')).toBe('1w');
    expect(pickBucketSize('all')).toBe('1M');
  });

  test('toLocalDateString handles JST boundary', () => {
    // UTC 15:00 maps to JST 00:00 the next day
    expect(toLocalDateString('2026-04-25T15:00:00.000Z', 'Asia/Tokyo')).toBe('2026-04-26');
    // UTC 14:59 still maps to JST 23:59 same day
    expect(toLocalDateString('2026-04-25T14:59:00.000Z', 'Asia/Tokyo')).toBe('2026-04-25');
    expect(toLocalDateString('2026-04-25T00:00:00.000Z', 'Asia/Tokyo')).toBe('2026-04-25');
  });

  test('floorToBucketStart aligns weeks and months', () => {
    // Wednesday 2026-04-29 → week starts Monday 2026-04-27
    expect(floorToBucketStart('2026-04-29', '1w')).toBe('2026-04-27');
    expect(floorToBucketStart('2026-04-29', '1M')).toBe('2026-04-01');
    expect(floorToBucketStart('2026-04-29', '1d')).toBe('2026-04-29');
  });

  test('enumerateBuckets covers from..to inclusive (JST aligned)', () => {
    // from = JST 2026-04-23 00:00, to = JST 2026-04-29 23:59:59
    const buckets = enumerateBuckets(
      '2026-04-22T15:00:00.000Z',
      '2026-04-29T14:59:59.999Z',
      '1d',
      'Asia/Tokyo',
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toBe('2026-04-23');
    expect(buckets[6]).toBe('2026-04-29');
  });
});
