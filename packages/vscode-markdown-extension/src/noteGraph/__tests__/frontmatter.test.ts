import { parseFrontmatter, extractNoteDoc, addRelatedEntry } from '../frontmatter';

const FM = (body: string): string => `---\n${body}\n---\n\n# Heading\n\ncontent\n`;

describe('parseFrontmatter', () => {
  it('parses scalars', () => {
    const { scalars } = parseFrontmatter(FM('title: "Doc A"\ntype: spec\ncategory: design'));
    expect(scalars.get('title')).toBe('Doc A');
    expect(scalars.get('type')).toBe('spec');
    expect(scalars.get('category')).toBe('design');
  });

  it('parses YAML list arrays', () => {
    const { arrays } = parseFrontmatter(FM('related:\n  - "a/x.md"\n  - "b/y.md"\ntags:\n  - graph'));
    expect(arrays.get('related')).toEqual(['a/x.md', 'b/y.md']);
    expect(arrays.get('tags')).toEqual(['graph']);
  });

  it('parses inline arrays', () => {
    const { arrays } = parseFrontmatter(FM('c4Scope: ["pkg_a", pkg_b]'));
    expect(arrays.get('c4Scope')).toEqual(['pkg_a', 'pkg_b']);
  });

  it('returns empty maps when no frontmatter', () => {
    const { scalars, arrays } = parseFrontmatter('# no frontmatter\n');
    expect(scalars.size).toBe(0);
    expect(arrays.size).toBe(0);
  });
});

describe('extractNoteDoc', () => {
  it('maps frontmatter to a NoteGraphDocInput', () => {
    const doc = extractNoteDoc('spec/a/a.ja.md', FM('title: Doc A\ntype: spec\nrelated:\n  - "spec/b/b.ja.md"'));
    expect(doc).not.toBeNull();
    expect(doc?.path).toBe('spec/a/a.ja.md');
    expect(doc?.title).toBe('Doc A');
    expect(doc?.type).toBe('spec');
    expect(doc?.related).toEqual(['spec/b/b.ja.md']);
  });

  it('returns null without a title', () => {
    expect(extractNoteDoc('x.md', FM('type: spec'))).toBeNull();
  });

  it('returns null when frontmatter is absent', () => {
    expect(extractNoteDoc('x.md', '# just markdown')).toBeNull();
  });

  it('excludes documents with graph: false / no / off', () => {
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: false'))).toBeNull();
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: no'))).toBeNull();
    expect(extractNoteDoc('x.md', FM('title: X\ngraph: off'))).toBeNull();
  });

  it('drops unsafe related references (traversal / absolute paths)', () => {
    const doc = extractNoteDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - "../../etc/passwd"\n  - "/abs/x.md"\n  - "spec/b.md"'),
    );
    expect(doc?.related).toEqual(['spec/b.md']);
  });

  it('sets related to undefined when all references are unsafe', () => {
    const doc = extractNoteDoc('spec/a.md', FM('title: A\nrelated:\n  - "../x.md"'));
    expect(doc?.related).toBeUndefined();
  });
});

describe('addRelatedEntry', () => {
  it('appends to an existing related list', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    const after = addRelatedEntry(before, 'spec/c.md');
    const { arrays } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/b.md', 'spec/c.md']);
    expect(after).toContain('# Heading'); // 本文を保存
  });

  it('adds a related key when missing', () => {
    const before = FM('title: A\ntype: spec');
    const after = addRelatedEntry(before, 'spec/c.md');
    const { arrays, scalars } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/c.md']);
    expect(scalars.get('title')).toBe('A'); // 既存キーを保存
  });

  it('is idempotent for an already-present target', () => {
    const before = FM('title: A\nrelated:\n  - "spec/b.md"');
    expect(addRelatedEntry(before, 'spec/b.md')).toBe(before);
  });

  it('converts an inline related array to a list when appending', () => {
    const before = FM('title: A\nrelated: ["spec/b.md"]');
    const after = addRelatedEntry(before, 'spec/c.md');
    const { arrays } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/b.md', 'spec/c.md']);
  });

  it('creates frontmatter when none exists', () => {
    const after = addRelatedEntry('# just markdown\n', 'spec/c.md');
    const { arrays } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/c.md']);
    expect(after).toContain('# just markdown');
  });

  it('preserves CRLF line endings when appending', () => {
    const before = '---\r\ntitle: A\r\ntype: spec\r\n---\r\n\r\n# Body\r\n';
    const after = addRelatedEntry(before, 'spec/c.md');
    // 裸の LF（\r を伴わない \n）が混入していないこと
    expect(/[^\r]\n/.test(after)).toBe(false);
    const { arrays } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/c.md']);
  });

  it('does not corrupt body when a target contains a dollar sign', () => {
    const before = FM('title: A');
    const after = addRelatedEntry(before, 'spec/$weird.md');
    const { arrays } = parseFrontmatter(after);
    expect(arrays.get('related')).toEqual(['spec/$weird.md']);
    expect(after).toContain('# Heading');
  });
});
