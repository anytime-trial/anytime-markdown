import { formatLocalDate, formatLocalTime, formatLocalDateTime, toLocalDateKey, resolveLocalTimeZone } from '../formatDate';

const TZ = resolveLocalTimeZone();

describe('formatLocalDate', () => {
  it('formats UTC ISO string to local date', () => {
    const iso = '2026-04-10T00:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
    expect(formatLocalDate(iso)).toBe(expected);
  });

  it('returns empty string for empty input', () => {
    expect(formatLocalDate('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalDate('not-a-date')).toBe('');
  });
});

describe('formatLocalTime', () => {
  it('formats UTC ISO string to local time', () => {
    const iso = '2026-04-10T15:30:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      timeZone: TZ,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
    expect(formatLocalTime(iso)).toBe(expected);
  });

  it('returns empty string for empty input', () => {
    expect(formatLocalTime('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalTime('not-a-date')).toBe('');
  });
});

describe('formatLocalDateTime', () => {
  it('formats UTC ISO string to local date-time', () => {
    const iso = '2026-04-10T15:30:45.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso));
    expect(formatLocalDateTime(iso)).toBe(expected);
  });

  it('returns empty string for empty input', () => {
    expect(formatLocalDateTime('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(formatLocalDateTime('not-a-date')).toBe('');
  });
});

describe('time zone resolution', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  // formatter をモジュールロード時に固定すると、TZ を差し替えるテストが黙って固着する。
  it('resolves the time zone per call, not once at module load', () => {
    const iso = '2026-04-10T15:30:45.000Z';

    process.env.TZ = 'Asia/Tokyo';
    const tokyo = formatLocalDateTime(iso);

    process.env.TZ = 'America/New_York';
    const newYork = formatLocalDateTime(iso);

    expect(tokyo).toContain('00:30:45');
    expect(newYork).toContain('11:30:45');
    expect(tokyo).not.toBe(newYork);
  });

  it('applies the switched time zone to date keys as well', () => {
    const iso = '2026-04-10T15:30:45.000Z';

    process.env.TZ = 'Asia/Tokyo';
    expect(toLocalDateKey(iso)).toBe('2026-04-11');

    process.env.TZ = 'America/New_York';
    expect(toLocalDateKey(iso)).toBe('2026-04-10');
  });
});

describe('toLocalDateKey', () => {
  it('returns local date in YYYY-MM-DD format', () => {
    const iso = '2026-04-10T15:00:00.000Z';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(iso));
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    expect(toLocalDateKey(iso)).toBe(`${y}-${m}-${day}`);
  });

  it('returns empty string for empty input', () => {
    expect(toLocalDateKey('')).toBe('');
  });

  it('returns empty string for invalid input', () => {
    expect(toLocalDateKey('not-a-date')).toBe('');
  });
});
