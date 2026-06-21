import { splitSections } from '../splitSections';

describe('splitSections', () => {
  it('splits body by heading, each section running until next same-or-higher heading', () => {
    const body = [
      '# Title',
      'intro under title',
      '## A',
      'alpha body',
      '### A-1',
      'sub alpha',
      '## B',
      'beta body',
    ].join('\n');

    const sections = splitSections(body);
    const byHeading = Object.fromEntries(sections.map((s) => [s.heading, s]));

    // H1 includes everything until next H1 (none) → whole doc
    expect(byHeading['Title'].level).toBe(1);
    expect(byHeading['Title'].text).toContain('beta body');

    // ## A includes its ### A-1 subsection but not ## B
    expect(byHeading['A'].level).toBe(2);
    expect(byHeading['A'].text).toContain('sub alpha');
    expect(byHeading['A'].text).not.toContain('beta body');

    // ### A-1 runs until ## B
    expect(byHeading['A-1'].level).toBe(3);
    expect(byHeading['A-1'].text).toContain('sub alpha');
    expect(byHeading['A-1'].text).not.toContain('beta body');

    expect(byHeading['B'].level).toBe(2);
    expect(byHeading['B'].text).toContain('beta body');
  });

  it('ignores # inside fenced code blocks', () => {
    const body = ['## Real', 'text', '```', '# fake heading', '```', 'more text'].join('\n');
    const sections = splitSections(body);
    expect(sections.map((s) => s.heading)).toEqual(['Real']);
    expect(sections[0].text).toContain('# fake heading');
  });

  it('treats preamble before the first heading as a lead section (heading="" level 0)', () => {
    const body = ['lead paragraph', 'second line', '# First', 'body'].join('\n');
    const sections = splitSections(body);
    expect(sections[0].heading).toBe('');
    expect(sections[0].level).toBe(0);
    expect(sections[0].text).toBe('lead paragraph\nsecond line');
    expect(sections[1].heading).toBe('First');
  });

  it('returns empty array for empty body', () => {
    expect(splitSections('')).toEqual([]);
    expect(splitSections('   \n  ')).toEqual([]);
  });

  it('trims trailing heading whitespace', () => {
    const body = '## Spaced   \nbody';
    const sections = splitSections(body);
    expect(sections[0].heading).toBe('Spaced');
  });
});
