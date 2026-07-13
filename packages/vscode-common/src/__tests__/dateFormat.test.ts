import { formatLocalDateTime, formatLocalDateTimeHyphen, formatLocalTime, resolveLocalTimeZone } from '../dateFormat';

describe('formatLocalDateTime', () => {
  it('renders UTC ISO in the given time zone as yyyy/M/d HH:mm', () => {
    expect(formatLocalDateTime('2026-07-12T14:19:59.000Z', 'Asia/Tokyo')).toBe('2026/7/12 23:19');
  });

  it('crosses the date boundary in the target time zone', () => {
    expect(formatLocalDateTime('2026-07-12T18:08:57.000Z', 'Asia/Tokyo')).toBe('2026/7/13 03:08');
  });

  it('does not zero-pad month and day', () => {
    expect(formatLocalDateTime('2026-01-05T00:30:00.000Z', 'Asia/Tokyo')).toBe('2026/1/5 09:30');
  });

  it('uses 24-hour clock (midnight is 00, not 24)', () => {
    expect(formatLocalDateTime('2026-07-12T15:00:00.000Z', 'Asia/Tokyo')).toBe('2026/7/13 00:00');
  });

  it('honours a non-JST time zone', () => {
    expect(formatLocalDateTime('2026-07-12T14:19:59.000Z', 'America/New_York')).toBe('2026/7/12 10:19');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(formatLocalDateTime(new Date('2026-07-12T14:19:59.000Z'), 'Asia/Tokyo')).toBe('2026/7/12 23:19');
  });

  it('returns null for an unparsable value', () => {
    expect(formatLocalDateTime('not-a-date', 'Asia/Tokyo')).toBeNull();
    expect(formatLocalDateTime('', 'Asia/Tokyo')).toBeNull();
    expect(formatLocalDateTime(new Date('not-a-date'), 'Asia/Tokyo')).toBeNull();
  });
});

describe('formatLocalDateTimeHyphen', () => {
  it('renders a Date in the given time zone as zero-padded YYYY-MM-DD HH:mm', () => {
    expect(formatLocalDateTimeHyphen(new Date('2026-01-05T00:30:00.000Z'), 'Asia/Tokyo')).toBe('2026-01-05 09:30');
  });

  it('crosses the date boundary in the target time zone', () => {
    expect(formatLocalDateTimeHyphen('2026-07-12T18:08:57.000Z', 'Asia/Tokyo')).toBe('2026-07-13 03:08');
  });

  it('returns null for an unparsable value', () => {
    expect(formatLocalDateTimeHyphen('not-a-date', 'Asia/Tokyo')).toBeNull();
  });
});

describe('formatLocalTime', () => {
  it('renders only HH:mm in the given time zone', () => {
    expect(formatLocalTime('2026-07-12T18:08:57.000Z', 'Asia/Tokyo')).toBe('03:08');
  });

  it('returns null for an unparsable value', () => {
    expect(formatLocalTime('not-a-date', 'Asia/Tokyo')).toBeNull();
  });
});

describe('resolveLocalTimeZone', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('prefers process.env.TZ', () => {
    process.env.TZ = 'Europe/Berlin';
    expect(resolveLocalTimeZone()).toBe('Europe/Berlin');
  });

  it('falls back to Asia/Tokyo when the system TZ is UTC (WSL)', () => {
    delete process.env.TZ;
    const resolved = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    const expected = resolved && resolved !== 'UTC' ? resolved : 'Asia/Tokyo';
    expect(resolveLocalTimeZone()).toBe(expected);
  });
});
