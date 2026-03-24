import path from 'path';
import { resolveSecurePath, validateFileExtension } from '../../utils/securePath';

describe('resolveSecurePath', () => {
  const rootDir = '/tmp/test-root';

  it('should resolve a valid relative path', () => {
    const result = resolveSecurePath(rootDir, 'docs/readme.md');
    expect(result).toBe(path.resolve(rootDir, 'docs/readme.md'));
  });

  it('should reject path traversal with ../', () => {
    expect(() => resolveSecurePath(rootDir, '../etc/passwd')).toThrow('Access denied');
  });

  it('should reject absolute path outside root', () => {
    expect(() => resolveSecurePath(rootDir, '/etc/passwd')).toThrow('Access denied');
  });

  it('should allow nested paths within root', () => {
    const result = resolveSecurePath(rootDir, 'a/b/c/file.md');
    expect(result).toBe(path.resolve(rootDir, 'a/b/c/file.md'));
  });

  it('should reject path with encoded traversal', () => {
    expect(() => resolveSecurePath(rootDir, 'docs/../../etc/passwd')).toThrow('Access denied');
  });
});

describe('validateFileExtension', () => {
  it('should accept .md files', () => {
    expect(() => validateFileExtension('file.md', ['.md', '.markdown'])).not.toThrow();
  });

  it('should accept .markdown files', () => {
    expect(() => validateFileExtension('file.markdown', ['.md', '.markdown'])).not.toThrow();
  });

  it('should reject .txt files', () => {
    expect(() => validateFileExtension('file.txt', ['.md', '.markdown'])).toThrow('File type not allowed');
  });

  it('should reject files without extension', () => {
    expect(() => validateFileExtension('Makefile', ['.md', '.markdown'])).toThrow('File type not allowed');
  });
});
