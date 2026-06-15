import { extractBodyLinks } from '../bodyLinks';

describe('extractBodyLinks', () => {
  it('extracts markdown links that target .md files', () => {
    const md = 'See [A](spec/a/a.ja.md) and [B](../b/b.ja.md).';
    expect(extractBodyLinks(md)).toEqual(['spec/a/a.ja.md', '../b/b.ja.md']);
  });

  it('strips anchors and query strings from targets', () => {
    expect(extractBodyLinks('[x](spec/a.md#section)')).toEqual(['spec/a.md']);
    expect(extractBodyLinks('[x](spec/a.md?v=1)')).toEqual(['spec/a.md']);
  });

  it('ignores non-.md targets (http, images, anchors)', () => {
    const md = '[ext](https://example.com) ![img](pic.png) [here](#top) [pdf](doc.pdf)';
    expect(extractBodyLinks(md)).toEqual([]);
  });

  it('ignores image links to .md (defensive)', () => {
    expect(extractBodyLinks('![alt](spec/a.md)')).toEqual([]);
  });

  it('does not pick links inside fenced or inline code', () => {
    const md = [
      'Real [A](spec/a.md).',
      '```',
      'fake [B](spec/b.md)',
      '```',
      'inline `[C](spec/c.md)` code.',
    ].join('\n');
    expect(extractBodyLinks(md)).toEqual(['spec/a.md']);
  });

  it('ignores links inside long (4+) backtick fences', () => {
    const md = ['Real [A](spec/a.md).', '````js', '[B](spec/b.md)', '````'].join('\n');
    expect(extractBodyLinks(md)).toEqual(['spec/a.md']);
  });

  it('handles link titles and angle-bracket targets', () => {
    expect(extractBodyLinks('[a](spec/a.md "title")')).toEqual(['spec/a.md']);
    expect(extractBodyLinks('[a](<spec/a.md>)')).toEqual(['spec/a.md']);
  });

  it('url-decodes targets', () => {
    expect(extractBodyLinks('[a](spec/my%20note.md)')).toEqual(['spec/my note.md']);
  });

  it('deduplicates repeated targets', () => {
    expect(extractBodyLinks('[a](spec/a.md) [again](spec/a.md)')).toEqual(['spec/a.md']);
  });
});
