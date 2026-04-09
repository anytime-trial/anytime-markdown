import { parseStatusLine } from '../GitStatusParser';
import { parseStatusCode } from '../types';

// GitStatus const enum values (inlined since const enum is erased at compile time)
const GitStatus = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
} as const;

const GIT_ROOT = '/repo';

describe('parseStatusLine', () => {
  describe('staged changes', () => {
    it('should parse staged modified file (M  file)', () => {
      const result = parseStatusLine('M  src/file.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.filePath).toBe('src/file.ts');
      expect(result.staged?.absPath).toBe('/repo/src/file.ts');
      expect(result.staged?.status).toBe(GitStatus.INDEX_MODIFIED);
      expect(result.staged?.group).toBe('staged');
      expect(result.unstaged).toBeUndefined();
    });

    it('should parse staged added file (A  file)', () => {
      const result = parseStatusLine('A  src/new.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.status).toBe(GitStatus.INDEX_ADDED);
      expect(result.staged?.group).toBe('staged');
      expect(result.unstaged).toBeUndefined();
    });

    it('should parse staged deleted file (D  file)', () => {
      const result = parseStatusLine('D  src/deleted.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.status).toBe(GitStatus.INDEX_DELETED);
      expect(result.staged?.group).toBe('staged');
      expect(result.unstaged).toBeUndefined();
    });

    it('should parse staged renamed file (R  old -> new)', () => {
      const result = parseStatusLine('R  old.ts -> new.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.status).toBe(GitStatus.INDEX_RENAMED);
      expect(result.staged?.filePath).toBe('old.ts -> new.ts');
      expect(result.staged?.group).toBe('staged');
    });
  });

  describe('unstaged changes', () => {
    it('should parse unstaged modified file ( M file)', () => {
      const result = parseStatusLine(' M src/file.ts', GIT_ROOT);

      expect(result.unstaged).toBeDefined();
      expect(result.unstaged?.filePath).toBe('src/file.ts');
      expect(result.unstaged?.absPath).toBe('/repo/src/file.ts');
      expect(result.unstaged?.status).toBe(GitStatus.MODIFIED);
      expect(result.unstaged?.group).toBe('changes');
      expect(result.staged).toBeUndefined();
    });

    it('should parse untracked file (?? file)', () => {
      const result = parseStatusLine('?? src/untracked.ts', GIT_ROOT);

      expect(result.unstaged).toBeDefined();
      expect(result.unstaged?.status).toBe(GitStatus.UNTRACKED);
      expect(result.unstaged?.group).toBe('changes');
      expect(result.staged).toBeUndefined();
    });

    it('should parse unstaged deleted file ( D file)', () => {
      const result = parseStatusLine(' D src/removed.ts', GIT_ROOT);

      expect(result.unstaged).toBeDefined();
      expect(result.unstaged?.status).toBe(GitStatus.DELETED);
      expect(result.unstaged?.group).toBe('changes');
      expect(result.staged).toBeUndefined();
    });
  });

  describe('both staged and unstaged', () => {
    it('should parse file with both staged and unstaged changes (MM file)', () => {
      const result = parseStatusLine('MM src/both.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.status).toBe(GitStatus.INDEX_MODIFIED);
      expect(result.staged?.group).toBe('staged');

      expect(result.unstaged).toBeDefined();
      expect(result.unstaged?.status).toBe(GitStatus.MODIFIED);
      expect(result.unstaged?.group).toBe('changes');
    });
  });

  describe('edge cases', () => {
    it('should handle file path with spaces', () => {
      const result = parseStatusLine('M  path with spaces/file name.ts', GIT_ROOT);

      expect(result.staged).toBeDefined();
      expect(result.staged?.filePath).toBe('path with spaces/file name.ts');
      expect(result.staged?.absPath).toBe('/repo/path with spaces/file name.ts');
    });

    it('should handle deeply nested paths', () => {
      const result = parseStatusLine(' M src/a/b/c/d/deep.ts', GIT_ROOT);

      expect(result.unstaged).toBeDefined();
      expect(result.unstaged?.filePath).toBe('src/a/b/c/d/deep.ts');
    });
  });
});

describe('parseStatusCode', () => {
  describe('staged group', () => {
    it('should map M to INDEX_MODIFIED', () => {
      expect(parseStatusCode('M', 'staged')).toBe(GitStatus.INDEX_MODIFIED);
    });

    it('should map A to INDEX_ADDED', () => {
      expect(parseStatusCode('A', 'staged')).toBe(GitStatus.INDEX_ADDED);
    });

    it('should map D to INDEX_DELETED', () => {
      expect(parseStatusCode('D', 'staged')).toBe(GitStatus.INDEX_DELETED);
    });

    it('should map R to INDEX_RENAMED', () => {
      expect(parseStatusCode('R', 'staged')).toBe(GitStatus.INDEX_RENAMED);
    });

    it('should default to INDEX_MODIFIED for unknown codes', () => {
      expect(parseStatusCode('X', 'staged')).toBe(GitStatus.INDEX_MODIFIED);
    });
  });

  describe('changes group', () => {
    it('should map M to MODIFIED', () => {
      expect(parseStatusCode('M', 'changes')).toBe(GitStatus.MODIFIED);
    });

    it('should map D to DELETED', () => {
      expect(parseStatusCode('D', 'changes')).toBe(GitStatus.DELETED);
    });

    it('should map ? to UNTRACKED', () => {
      expect(parseStatusCode('?', 'changes')).toBe(GitStatus.UNTRACKED);
    });

    it('should default to MODIFIED for unknown codes', () => {
      expect(parseStatusCode('X', 'changes')).toBe(GitStatus.MODIFIED);
    });
  });
});
