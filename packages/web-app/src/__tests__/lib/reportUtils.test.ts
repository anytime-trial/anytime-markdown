import type { ReportMeta } from '../../types/report';
import { buildArchiveMonths, buildNavigation, paginate, parseFrontmatter, sortByDateDesc } from '../../lib/reportUtils';

const makeReport = (slug: string, date: string): ReportMeta => ({
  slug,
  date,
  key: `reports/${slug}.md`,
  title: `Title ${slug}`,
});

// ────────────────────────────────────────────────────────────
// parseFrontmatter
// ────────────────────────────────────────────────────────────
describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const md = `---\ntitle: "Hello"\ndate: "2026-01-01"\n---\nbody text`;
    const { data, content } = parseFrontmatter(md);
    expect(data.title).toBe('Hello');
    expect(data.date).toBe('2026-01-01');
    expect(content).toBe('body text');
  });

  it('parses frontmatter with single-quoted values', () => {
    const md = `---\ntitle: 'World'\n---\n`;
    const { data } = parseFrontmatter(md);
    expect(data.title).toBe('World');
  });

  it('strips quotes only when both sides match', () => {
    const md = `---\ntitle: unquoted value\n---\n`;
    const { data } = parseFrontmatter(md);
    expect(data.title).toBe('unquoted value');
  });

  it('ignores lines without colon', () => {
    const md = `---\njust a line\ntitle: ok\n---\n`;
    const { data } = parseFrontmatter(md);
    expect(Object.keys(data)).toEqual(['title']);
  });

  it('returns empty data and raw string when no frontmatter delimiter', () => {
    const md = 'no frontmatter here';
    const { data, content } = parseFrontmatter(md);
    expect(data).toEqual({});
    expect(content).toBe(md);
  });

  it('handles CRLF line endings', () => {
    const md = `---\r\ntitle: "CR"\r\n---\r\nbody`;
    const { data, content } = parseFrontmatter(md);
    expect(data.title).toBe('CR');
    expect(content).toBe('body');
  });

  it('skips keys that are empty strings after trim', () => {
    const md = `---\n: value\n---\n`;
    const { data } = parseFrontmatter(md);
    expect(data).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────
// sortByDateDesc
// ────────────────────────────────────────────────────────────
describe('sortByDateDesc', () => {
  it('sorts newer dates first', () => {
    const reports = [
      makeReport('a', '2026-01-01'),
      makeReport('b', '2026-03-15'),
      makeReport('c', '2025-12-31'),
    ];
    const sorted = sortByDateDesc(reports);
    expect(sorted.map((r) => r.slug)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the original array', () => {
    const reports = [makeReport('a', '2026-01-01'), makeReport('b', '2026-03-01')];
    const original = [...reports];
    sortByDateDesc(reports);
    expect(reports).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortByDateDesc([])).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// paginate
// ────────────────────────────────────────────────────────────
describe('paginate', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);

  it('returns first page correctly', () => {
    const { items: page, totalPages } = paginate(items, 1, 3);
    expect(page).toEqual([0, 1, 2]);
    expect(totalPages).toBe(4);
  });

  it('returns last page with remaining items', () => {
    const { items: page } = paginate(items, 4, 3);
    expect(page).toEqual([9]);
  });

  it('clamps page below 1 to page 1', () => {
    const { items: page } = paginate(items, 0, 5);
    expect(page).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps page beyond totalPages to last page', () => {
    const { items: page } = paginate(items, 99, 5);
    expect(page).toEqual([5, 6, 7, 8, 9]);
  });

  it('returns totalPages=1 for empty array', () => {
    const { items: page, totalPages } = paginate([], 1, 5);
    expect(page).toEqual([]);
    expect(totalPages).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// buildArchiveMonths
// ────────────────────────────────────────────────────────────
describe('buildArchiveMonths', () => {
  it('groups reports by YYYY-MM and sorts descending', () => {
    const reports = [
      makeReport('a', '2026-03-10'),
      makeReport('b', '2026-03-25'),
      makeReport('c', '2026-01-05'),
    ];
    const archive = buildArchiveMonths(reports);
    expect(archive).toEqual([
      { month: '2026-03', count: 2 },
      { month: '2026-01', count: 1 },
    ]);
  });

  it('skips dates with invalid month length', () => {
    // date shorter than 7 chars → month.length < 7, should skip
    const reports = [makeReport('x', '2026-0')];
    expect(buildArchiveMonths(reports)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(buildArchiveMonths([])).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// buildNavigation
// ────────────────────────────────────────────────────────────
describe('buildNavigation', () => {
  const reports = [
    makeReport('newest', '2026-05-01'),
    makeReport('middle', '2026-04-01'),
    makeReport('oldest', '2026-03-01'),
  ];

  it('returns null prev and correct next for the newest post', () => {
    const { prev, next } = buildNavigation(reports, 'newest');
    expect(prev?.slug).toBe('middle'); // older
    expect(next).toBeNull();
  });

  it('returns correct prev and next for a middle post', () => {
    const { prev, next } = buildNavigation(reports, 'middle');
    expect(prev?.slug).toBe('oldest');
    expect(next?.slug).toBe('newest');
  });

  it('returns null next and correct prev for the oldest post', () => {
    const { prev, next } = buildNavigation(reports, 'oldest');
    expect(prev).toBeNull();
    expect(next?.slug).toBe('middle');
  });

  it('returns both null when slug not found', () => {
    const { prev, next } = buildNavigation(reports, 'nonexistent');
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });
});
