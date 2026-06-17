import * as path from 'path';
import { resolveDocPath, resolveBodyLinkTarget } from '../scan';

describe('resolveDocPath', () => {
  const root = path.resolve('/tmp/note-graph-repo');

  it('resolves a repo-relative path to an absolute path inside the root', () => {
    expect(resolveDocPath(root, 'spec/a/a.ja.md')).toBe(path.join(root, 'spec', 'a', 'a.ja.md'));
  });

  it('rejects parent-directory traversal', () => {
    expect(() => resolveDocPath(root, '../../etc/passwd')).toThrow(/path traversal/);
  });

  it('rejects traversal that escapes then re-enters', () => {
    expect(() => resolveDocPath(root, 'spec/../../outside.md')).toThrow(/path traversal/);
  });

  it('allows internal ".." that stays within the root', () => {
    expect(resolveDocPath(root, 'spec/sub/../a.md')).toBe(path.join(root, 'spec', 'a.md'));
  });
});

describe('resolveBodyLinkTarget', () => {
  const known = new Set(['spec/a/a.ja.md', 'spec/b/b.ja.md', 'tech/c.ja.md']);

  it('resolves a root-relative target (corpus convention)', () => {
    expect(resolveBodyLinkTarget('spec/a/a.ja.md', 'spec/b/b.ja.md', known)).toBe('spec/b/b.ja.md');
  });

  it('resolves a file-relative target (markdown spec)', () => {
    expect(resolveBodyLinkTarget('spec/a/a.ja.md', '../b/b.ja.md', known)).toBe('spec/b/b.ja.md');
  });

  it('falls back to file-relative form when unresolved (placeholder)', () => {
    expect(resolveBodyLinkTarget('spec/a/a.ja.md', '../missing/x.md', known)).toBe('spec/missing/x.md');
  });
});
