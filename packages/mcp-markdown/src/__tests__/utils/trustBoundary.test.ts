import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectTrust, clipSegments, resolveBoundaryForFile } from '../../utils/trustBoundary';

describe('detectTrust', () => {
  it.each([
    ['# Title', 'workspace'],
    ['---\ntrust: external\n---\nBody', 'external'],
    ['---\ntrust: other\n---', 'workspace'],
    ['---\n: bad: [\n---', 'unknown'],
  ])('detects boundary for %s', (markdown, boundary) => {
    expect(detectTrust(markdown).boundary).toBe(boundary);
  });

  it('detects the trailing comment block with absolute line numbers', () => {
    expect(detectTrust('# T\n\n<!-- comments\nnote\n-->\n  ').untrustedSegments)
      .toEqual([{ kind: 'comment', startLine: 3, endLine: 5 }]);
  });

  it('only accepts the last comment block followed by whitespace', () => {
    expect(detectTrust('# T\n<!-- comments\nx\n-->\nbody').untrustedSegments).toEqual([]);
    expect(detectTrust('# T\n<!-- comments\nx\n-->\nbody\n<!-- comments\ny\n-->').untrustedSegments)
      .toEqual([{ kind: 'comment', startLine: 6, endLine: 8 }]);
    expect(detectTrust('# T\n<!-- comments\nunclosed').untrustedSegments).toEqual([]);
  });

  it('detects standalone embeds but not inline links or multiple links', () => {
    const doc = ' https://example.com \n[Link](http://example.com)\n<https://example.com>\ntext https://example.com\n[a](https://a) [b](https://b)';
    expect(detectTrust(doc).untrustedSegments).toEqual([1, 2, 3].map(line => ({ kind: 'embed', startLine: line, endLine: line })));
  });

  it.each(['```', '~~~'])('ignores URLs inside %s fences', fence => {
    expect(detectTrust(`${fence}text\nhttps://inside\n${fence}\nhttps://outside`).untrustedSegments)
      .toEqual([{ kind: 'embed', startLine: 4, endLine: 4 }]);
  });

  it('requires matching fence characters and sufficient closing length', () => {
    expect(detectTrust('````\n```\nhttps://inside\n~~~~\nhttps://inside\n````\nhttps://outside').untrustedSegments)
      .toEqual([{ kind: 'embed', startLine: 7, endLine: 7 }]);
  });

  it('clips intersections without changing input or coordinates', () => {
    const segments = [{ kind: 'comment' as const, startLine: 2, endLine: 8 }, { kind: 'embed' as const, startLine: 10, endLine: 10 }];
    expect(clipSegments(segments, 4, 6)).toEqual([{ kind: 'comment', startLine: 4, endLine: 6 }]);
    expect(clipSegments(segments, 8, 10)).toEqual([{ kind: 'comment', startLine: 8, endLine: 8 }, segments[1]]);
    expect(clipSegments(segments, 11, 12)).toEqual([]);
    expect(segments[0].startLine).toBe(2);
  });
});

describe('resolveBoundaryForFile', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trust-')); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads markdown boundaries', async () => {
    await fs.writeFile(path.join(dir, 'a.md'), '# T');
    await fs.writeFile(path.join(dir, 'b.markdown'), '---\ntrust: external\n---');
    expect(await resolveBoundaryForFile(dir, 'a.md')).toBe('workspace');
    expect(await resolveBoundaryForFile(dir, 'b.markdown')).toBe('external');
  });

  it('falls back to ANYTIME_MARKDOWN_DOC_ROOT when the hit path is not under rootDir (review #3)', async () => {
    const docRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'trust-docroot-'));
    const previous = process.env.ANYTIME_MARKDOWN_DOC_ROOT;
    try {
      await fs.writeFile(path.join(docRoot, 'ext.md'), '---\ntrust: external\n---');
      process.env.ANYTIME_MARKDOWN_DOC_ROOT = docRoot;
      expect(await resolveBoundaryForFile(dir, 'ext.md')).toBe('external');
      expect(await resolveBoundaryForFile(dir, '../outside.md')).toBe('unknown');
      delete process.env.ANYTIME_MARKDOWN_DOC_ROOT;
      expect(await resolveBoundaryForFile(dir, 'ext.md')).toBe('unknown');
    } finally {
      if (previous === undefined) delete process.env.ANYTIME_MARKDOWN_DOC_ROOT;
      else process.env.ANYTIME_MARKDOWN_DOC_ROOT = previous;
      await fs.rm(docRoot, { recursive: true, force: true });
    }
  });

  it('returns unknown for missing, invalid, malformed and outside files', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), '# T');
    await fs.writeFile(path.join(dir, 'bad.md'), '---\n: bad: [\n---');
    for (const file of ['missing.md', 'a.txt', 'bad.md', '../outside.md']) {
      expect(await resolveBoundaryForFile(dir, file)).toBe('unknown');
    }
  });

  it('rejects symlinks escaping the root', async () => {
    await fs.mkdir(path.join(dir, 'root'));
    await fs.writeFile(path.join(dir, 'outside.md'), '# T');
    await fs.symlink(path.join(dir, 'outside.md'), path.join(dir, 'root', 'link.md'));
    expect(await resolveBoundaryForFile(path.join(dir, 'root'), 'link.md')).toBe('unknown');
  });
});
