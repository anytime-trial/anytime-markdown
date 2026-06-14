import * as path from 'path';
import { resolveDocPath } from '../scan';

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
