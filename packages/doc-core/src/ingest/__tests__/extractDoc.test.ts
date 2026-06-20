import { extractDoc } from '../extractDoc';

const FM = (body: string, content = '# Heading\n\nhello world'): string => `---\n${body}\n---\n\n${content}\n`;

describe('extractDoc', () => {
  it('maps frontmatter metadata', () => {
    const d = extractDoc('spec/a/a.ja.md', FM('title: Doc A\ncategory: graph\ntype: spec\nlang: ja\nexcerpt: "an excerpt"'));
    expect(d).not.toBeNull();
    expect(d?.path).toBe('spec/a/a.ja.md');
    expect(d?.title).toBe('Doc A');
    expect(d?.category).toBe('graph');
    expect(d?.type).toBe('spec');
    expect(d?.lang).toBe('ja');
    expect(d?.excerpt).toBe('an excerpt');
    expect(d?.body).toContain('hello world');
    expect(d?.body).not.toContain('title:'); // frontmatter は body に含めない
  });

  it('normalizes related: bare string = references, object = typed', () => {
    const d = extractDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - "spec/b.md"\n  - to: "spec/c.md"\n    type: depends-on'),
    );
    expect(d?.related).toEqual([
      { fromPath: 'spec/a.md', toPath: 'spec/b.md', type: 'references' },
      { fromPath: 'spec/a.md', toPath: 'spec/c.md', type: 'depends-on' },
    ]);
  });

  it('falls back unknown relation type to references', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const d = extractDoc('spec/a.md', FM('title: A\nrelated:\n  - to: "spec/b.md"\n    type: mentions'));
      expect(d?.related).toEqual([{ fromPath: 'spec/a.md', toPath: 'spec/b.md', type: 'references' }]);
    } finally {
      warn.mockRestore();
    }
  });

  it('drops unsafe (traversal/absolute) and self related targets', () => {
    const d = extractDoc(
      'spec/a.md',
      FM('title: A\nrelated:\n  - "../../etc/passwd"\n  - "/abs.md"\n  - "spec/a.md"\n  - "spec/b.md"'),
    );
    expect(d?.related).toEqual([{ fromPath: 'spec/a.md', toPath: 'spec/b.md', type: 'references' }]);
  });

  it('returns null without a title or with graph:false', () => {
    expect(extractDoc('x.md', FM('type: spec'))).toBeNull();
    expect(extractDoc('x.md', FM('title: X\ngraph: false'))).toBeNull();
    expect(extractDoc('x.md', '# no frontmatter')).toBeNull();
  });

  it('produces a stable content hash that changes with content', () => {
    const a = extractDoc('spec/a.md', FM('title: A'));
    const b = extractDoc('spec/a.md', FM('title: A'));
    const c = extractDoc('spec/a.md', FM('title: A', '# Heading\n\ndifferent body'));
    expect(a?.contentHash).toBe(b?.contentHash);
    expect(a?.contentHash).not.toBe(c?.contentHash);
    expect(a?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
