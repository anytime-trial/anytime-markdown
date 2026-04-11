import { toUTC } from '../dateUtils';

describe('toUTC', () => {
  it('returns UTC string unchanged', () => {
    expect(toUTC('2026-04-10T00:00:00.000Z')).toBe('2026-04-10T00:00:00.000Z');
  });

  it('converts offset timestamp to UTC', () => {
    expect(toUTC('2026-04-10T09:00:00+09:00')).toBe('2026-04-10T00:00:00.000Z');
  });

  it('converts negative offset timestamp to UTC', () => {
    expect(toUTC('2026-04-09T20:00:00-04:00')).toBe('2026-04-10T00:00:00.000Z');
  });

  it('preserves milliseconds', () => {
    expect(toUTC('2026-03-27T23:23:45.106Z')).toBe('2026-03-27T23:23:45.106Z');
  });

  it('returns empty string for empty input', () => {
    expect(toUTC('')).toBe('');
  });

  it('returns invalid string as-is', () => {
    expect(toUTC('not-a-date')).toBe('not-a-date');
  });
});
