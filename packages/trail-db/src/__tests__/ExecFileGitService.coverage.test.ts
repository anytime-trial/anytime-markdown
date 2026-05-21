/**
 * ExecFileGitService characterization tests
 * Covers all public methods and internal parser branches via execFileSync mock.
 * No real git calls are made.
 */

// Mock execFileSync — must be before any import that uses it
jest.mock('node:child_process', () => ({
  execFileSync: jest.fn(),
}));

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { ExecFileGitService } from '../ExecFileGitService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExecFileSync = execFileSync as jest.MockedFunction<any>;

// Spies for fs methods used in countSnapshotLines / processSnapshotEntry
let spyMkdtemp: jest.SpyInstance;
let spyReaddir: jest.SpyInstance;
let spyReadFile: jest.SpyInstance;
let spyRmSync: jest.SpyInstance;

function makeService(root = '/fake/repo') {
  return new ExecFileGitService(root);
}

function mockExecReturn(value: string) {
  mockExecFileSync.mockReturnValueOnce(value);
}

function mockExecThrow(err: Error = new Error('git error')) {
  mockExecFileSync.mockImplementationOnce(() => { throw err; });
}

function makeDirent(name: string, isDir: boolean): fs.Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  } as unknown as fs.Dirent;
}

beforeEach(() => {
  jest.clearAllMocks();
  spyMkdtemp = jest.spyOn(fs, 'mkdtempSync');
  spyReaddir = jest.spyOn(fs, 'readdirSync');
  spyReadFile = jest.spyOn(fs, 'readFileSync');
  spyRmSync = jest.spyOn(fs, 'rmSync');
});

afterEach(() => {
  spyMkdtemp.mockRestore();
  spyReaddir.mockRestore();
  spyReadFile.mockRestore();
  spyRmSync.mockRestore();
});

// ============================================================
// getMergeCommits
// ============================================================
describe('getMergeCommits', () => {
  it('parses a single merge commit entry', () => {
    const raw = `aaaa1111\x00Merge branch\x00parent1 parent2\x002026-01-01T00:00:00+09:00\x1e`;
    mockExecReturn(raw);

    const result = makeService().getMergeCommits();
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe('aaaa1111');
    expect(result[0].subject).toBe('Merge branch');
    expect(result[0].parentHashes).toEqual(['parent1', 'parent2']);
    expect(result[0].mergedAt).toBe('2025-12-31T15:00:00.000Z');
  });

  it('parses multiple merge commit entries', () => {
    const e1 = 'hash1\x00subj1\x00p1 p2\x002026-01-01T00:00:00Z';
    const e2 = 'hash2\x00subj2\x00p3 p4\x002026-02-01T00:00:00Z';
    mockExecReturn(`${e1}\x1e${e2}\x1e`);

    const result = makeService().getMergeCommits();
    expect(result).toHaveLength(2);
    expect(result[0].hash).toBe('hash1');
    expect(result[1].hash).toBe('hash2');
  });

  it('skips entries with fewer than 4 NUL-separated parts', () => {
    mockExecReturn('hash\x00subject\x00parents\x1e');
    expect(makeService().getMergeCommits()).toHaveLength(0);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getMergeCommits()).toEqual([]);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getMergeCommits()).toEqual([]);
  });

  it('handles whitespace-only segments in RS-separated output', () => {
    // RS with whitespace between entries should be filtered
    mockExecReturn(`hash1\x00subj1\x00p1\x002026-01-01T00:00:00Z\x1e   \x1e`);
    const result = makeService().getMergeCommits();
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// getCommitsInRange
// ============================================================
describe('getCommitsInRange', () => {
  it('returns trimmed non-empty hashes', () => {
    mockExecReturn('abc123\ndef456\n\nghi789\n');
    expect(makeService().getCommitsInRange('v1', 'v2')).toEqual(['abc123', 'def456', 'ghi789']);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getCommitsInRange('v1', 'v2')).toEqual([]);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getCommitsInRange('v1', 'v2')).toEqual([]);
  });
});

// ============================================================
// getVersionTags
// ============================================================
describe('getVersionTags', () => {
  it('returns list of tags', () => {
    mockExecReturn('v1.2.3\nv1.2.2\nv1.2.1\n');
    expect(makeService().getVersionTags()).toEqual(['v1.2.3', 'v1.2.2', 'v1.2.1']);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getVersionTags()).toEqual([]);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getVersionTags()).toEqual([]);
  });
});

// ============================================================
// getTagCommitHash
// ============================================================
describe('getTagCommitHash', () => {
  it('returns trimmed commit hash', () => {
    mockExecReturn('deadbeef1234\n');
    expect(makeService().getTagCommitHash('v1.0.0')).toBe('deadbeef1234');
  });

  it('returns empty string for whitespace-only output', () => {
    mockExecReturn('  \n');
    expect(makeService().getTagCommitHash('v1.0.0')).toBe('');
  });

  it('returns empty string when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getTagCommitHash('v1.0.0')).toBe('');
  });
});

// ============================================================
// getTagsAtCommit
// ============================================================
describe('getTagsAtCommit', () => {
  it('returns list of tags at commit', () => {
    mockExecReturn('v1.0.0\nv1.0.0-rc1\n');
    expect(makeService().getTagsAtCommit('abc123')).toEqual(['v1.0.0', 'v1.0.0-rc1']);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getTagsAtCommit('abc123')).toEqual([]);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getTagsAtCommit('abc123')).toEqual([]);
  });
});

// ============================================================
// getTagDate
// ============================================================
describe('getTagDate', () => {
  it('converts ISO with timezone offset to UTC Z form', () => {
    mockExecReturn('2026-01-01T09:00:00+09:00\n');
    expect(makeService().getTagDate('v1.0.0')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns original string when date is unparseable (toUTC fallback)', () => {
    // new Date('not-a-date').toISOString() throws Invalid Date → catch returns original
    mockExecReturn('not-a-date\n');
    expect(makeService().getTagDate('v1.0.0')).toBe('not-a-date');
  });

  it('returns empty string for empty output (toUTC empty string path)', () => {
    mockExecReturn('  ');
    // toUTC('') → new Date('').toISOString() → Invalid Date → returns ''
    expect(makeService().getTagDate('v1.0.0')).toBe('');
  });

  it('returns empty string when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getTagDate('v1.0.0')).toBe('');
  });
});

// ============================================================
// getCommitSubjects
// ============================================================
describe('getCommitSubjects', () => {
  it('returns list of commit subjects', () => {
    mockExecReturn('feat: add feature\nfix: fix bug\n\nchore: cleanup\n');
    expect(makeService().getCommitSubjects('v1', 'v2')).toEqual([
      'feat: add feature',
      'fix: fix bug',
      'chore: cleanup',
    ]);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getCommitSubjects('v1', 'v2')).toEqual([]);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getCommitSubjects('v1', 'v2')).toEqual([]);
  });
});

// ============================================================
// getDiffStats
// ============================================================
describe('getDiffStats', () => {
  it('parses full shortstat output', () => {
    mockExecReturn(' 10 files changed, 500 insertions(+), 200 deletions(-)\n');
    expect(makeService().getDiffStats('v1', 'v2')).toEqual({
      filesChanged: 10, linesAdded: 500, linesDeleted: 200,
    });
  });

  it('handles output with only files changed (no insertions or deletions)', () => {
    mockExecReturn(' 3 files changed\n');
    expect(makeService().getDiffStats('v1', 'v2')).toEqual({
      filesChanged: 3, linesAdded: 0, linesDeleted: 0,
    });
  });

  it('returns zeros for empty output', () => {
    mockExecReturn('');
    expect(makeService().getDiffStats('v1', 'v2')).toEqual({
      filesChanged: 0, linesAdded: 0, linesDeleted: 0,
    });
  });

  it('returns zeros when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getDiffStats('v1', 'v2')).toEqual({
      filesChanged: 0, linesAdded: 0, linesDeleted: 0,
    });
  });
});

// ============================================================
// getFileStatsByRange
// ============================================================
describe('getFileStatsByRange', () => {
  it('parses numstat and name-status for modified and added files', () => {
    mockExecReturn('10\t5\tsrc/foo.ts\n3\t1\tsrc/bar.ts\n');
    mockExecReturn('M\tsrc/foo.ts\nA\tsrc/bar.ts\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result).toHaveLength(2);
    const foo = result.find((e) => e.filePath === 'src/foo.ts');
    expect(foo?.linesAdded).toBe(10);
    expect(foo?.linesDeleted).toBe(5);
    expect(foo?.changeType).toBe('modified');
    const bar = result.find((e) => e.filePath === 'src/bar.ts');
    expect(bar?.changeType).toBe('added');
  });

  it('handles renamed file — R status uses parts[2] as filePath', () => {
    mockExecReturn('0\t0\tsrc/new.ts\n');
    mockExecReturn('R\tsrc/old.ts\tsrc/new.ts\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    const newFile = result.find((e) => e.filePath === 'src/new.ts');
    expect(newFile?.changeType).toBe('renamed');
  });

  it('handles deleted file', () => {
    mockExecReturn('0\t10\tsrc/deleted.ts\n');
    mockExecReturn('D\tsrc/deleted.ts\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result.find((e) => e.filePath === 'src/deleted.ts')?.changeType).toBe('deleted');
  });

  it('handles binary files — dash treated as 0', () => {
    mockExecReturn('-\t-\tsrc/image.png\n');
    mockExecReturn('M\tsrc/image.png\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    const img = result.find((e) => e.filePath === 'src/image.png');
    expect(img?.linesAdded).toBe(0);
    expect(img?.linesDeleted).toBe(0);
  });

  it('skips name-status line with only 1 part', () => {
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecReturn('MALFORMED\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('modified');
  });

  it('uses modified as fallback for unknown status character', () => {
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecReturn('X\tsrc/foo.ts\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result[0].changeType).toBe('modified');
  });

  it('skips name-status line where parts[1] is empty string (line 124 branch)', () => {
    // 'A\t\tfoo' → trim → parts=['A','','foo'] → filePath=parts[1]='' → !filePath=true → continue
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecReturn('A\t\tfoo\n'); // parts[1]='' → filePath='' → skip

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
  });

  it('returns empty array when numstat throws', () => {
    mockExecThrow();
    expect(makeService().getFileStatsByRange('v1', 'v2')).toEqual([]);
  });

  it('uses defaults when name-status throws after numstat success', () => {
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecThrow();

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('modified');
  });

  it('handles empty numstat output', () => {
    mockExecReturn('');
    mockExecReturn('');
    expect(makeService().getFileStatsByRange('v1', 'v2')).toEqual([]);
  });

  it('skips numstat lines without filePath', () => {
    // No tab-separated filePath
    mockExecReturn('10\t5\n');
    mockExecReturn('');
    expect(makeService().getFileStatsByRange('v1', 'v2')).toEqual([]);
  });

  it('adds new file entry from name-status when not in fileMap (requireExisting=false)', () => {
    // numstat is empty — name-status adds a new entry
    mockExecReturn('');
    mockExecReturn('A\tsrc/new-only.ts\n');

    const result = makeService().getFileStatsByRange('v1', 'v2');
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/new-only.ts');
    expect(result[0].changeType).toBe('added');
  });
});

// ============================================================
// getHeadCommit
// ============================================================
describe('getHeadCommit', () => {
  it('returns trimmed HEAD hash', () => {
    mockExecReturn('cafebabe1234\n');
    expect(makeService().getHeadCommit()).toBe('cafebabe1234');
  });

  it('returns empty string when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getHeadCommit()).toBe('');
  });
});

// ============================================================
// getChangedPackages
// ============================================================
describe('getChangedPackages', () => {
  it('extracts unique package names from paths', () => {
    mockExecReturn(
      'packages/trail-core/src/index.ts\n' +
      'packages/trail-db/src/Service.ts\n' +
      'packages/trail-core/src/types.ts\n' +
      'README.md\n',
    );
    const result = makeService().getChangedPackages('v1', 'v2');
    expect(result).toContain('trail-core');
    expect(result).toContain('trail-db');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no packages match', () => {
    mockExecReturn('README.md\npackage.json\n');
    expect(makeService().getChangedPackages('v1', 'v2')).toEqual([]);
  });

  it('returns empty array for empty output', () => {
    mockExecReturn('');
    expect(makeService().getChangedPackages('v1', 'v2')).toEqual([]);
  });

  it('returns empty array when execFileSync throws', () => {
    mockExecThrow();
    expect(makeService().getChangedPackages('v1', 'v2')).toEqual([]);
  });
});

// ============================================================
// getAggregateFileStats
// ============================================================
describe('getAggregateFileStats', () => {
  it('aggregates stats across multiple commits', () => {
    mockExecReturn('10\t5\tsrc/foo.ts\n');
    mockExecReturn('M\tsrc/foo.ts\n');
    mockExecReturn('3\t1\tsrc/foo.ts\n');
    mockExecReturn('M\tsrc/foo.ts\n');

    const result = makeService().getAggregateFileStats(['abc', 'def']);
    expect(result).toHaveLength(1);
    expect(result[0].linesAdded).toBe(13);
    expect(result[0].linesDeleted).toBe(6);
  });

  it('returns empty array for empty hashes list', () => {
    expect(makeService().getAggregateFileStats([])).toEqual([]);
  });

  it('skips commit when numstat throws', () => {
    mockExecThrow(); // numstat throws → skip, name-status not called
    // next mockExecThrow for name-status shouldn't be needed but provide it anyway
    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toEqual([]);
  });

  it('continues accumulating when name-status throws', () => {
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecThrow(); // name-status throws → skip change type update

    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toHaveLength(1);
    expect(result[0].linesAdded).toBe(5);
    expect(result[0].changeType).toBe('modified');
  });

  it('ignores name-status for files not in fileMap (requireExisting=true)', () => {
    mockExecReturn('10\t0\tsrc/foo.ts\n');
    mockExecReturn('A\tsrc/bar.ts\n'); // bar not in map → skipped

    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
  });

  it('applies renamed status when new path is in fileMap', () => {
    mockExecReturn('5\t2\tsrc/new.ts\n');
    mockExecReturn('R\tsrc/old.ts\tsrc/new.ts\n');

    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toHaveLength(1);
    expect(result[0].changeType).toBe('renamed');
  });

  it('handles binary files in aggregate numstat', () => {
    mockExecReturn('-\t-\tsrc/image.png\n');
    mockExecReturn('M\tsrc/image.png\n');

    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toHaveLength(1);
    expect(result[0].linesAdded).toBe(0);
    expect(result[0].linesDeleted).toBe(0);
  });

  it('skips name-status line where parts[1] is empty — requireExisting path (line 124)', () => {
    mockExecReturn('5\t2\tsrc/foo.ts\n');
    mockExecReturn('A\t\tfoo\n'); // parts[1]='' → filePath='' → skip

    const result = makeService().getAggregateFileStats(['abc']);
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/foo.ts');
  });

  it('accumulates 3 commits into the same file entry', () => {
    for (let i = 0; i < 3; i++) {
      mockExecReturn(`${i + 1}\t${i}\tsrc/x.ts\n`);
      mockExecReturn('M\tsrc/x.ts\n');
    }
    const result = makeService().getAggregateFileStats(['a', 'b', 'c']);
    expect(result).toHaveLength(1);
    expect(result[0].linesAdded).toBe(6); // 1+2+3
    expect(result[0].linesDeleted).toBe(3); // 0+1+2
  });
});

// ============================================================
// getSnapshotLineCount — spy-based approach
// ============================================================
describe('getSnapshotLineCount (spied fs)', () => {
  it('returns 0 when getTagCommitHash returns empty string', () => {
    mockExecReturn('  \n'); // trim → ''
    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
  });

  it('returns 0 when git worktree add throws', () => {
    mockExecReturn('deadbeef\n');
    spyMkdtemp.mockReturnValueOnce('/tmp/trail-snap-xyz');
    mockExecThrow(); // worktree add throws
    mockExecThrow(); // worktree remove also throws
    spyRmSync.mockReturnValueOnce(undefined);

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
  });

  it('counts lines from a code file', () => {
    const worktreeDir = '/tmp/trail-snap-count';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add

    spyReaddir
      .mockReturnValueOnce([makeDirent('index.ts', false)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([] as unknown as fs.Dirent[]);
    spyReadFile.mockReturnValueOnce('line1\nline2\nline3\n');
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(3);
  });

  it('handles readdirSync throwing inside countSnapshotLines', () => {
    const worktreeDir = '/tmp/trail-snap-rderr';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add
    spyReaddir.mockImplementationOnce(() => { throw new Error('EACCES'); });
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
  });

  it('handles readFileSync throwing inside processSnapshotEntry', () => {
    const worktreeDir = '/tmp/trail-snap-fserr';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add

    spyReaddir
      .mockReturnValueOnce([makeDirent('index.ts', false)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([] as unknown as fs.Dirent[]);
    spyReadFile.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
  });

  it('pushes sub-directories onto the stack and processes them', () => {
    const worktreeDir = '/tmp/trail-snap-dir';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add

    spyReaddir
      .mockReturnValueOnce([makeDirent('src', true)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([makeDirent('app.ts', false)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([] as unknown as fs.Dirent[]);
    spyReadFile.mockReturnValueOnce('a\nb\n');
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(2);
  });

  it('skips paths in SNAPSHOT_SKIP_DIRS (node_modules)', () => {
    const worktreeDir = '/tmp/trail-snap-skip';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add

    spyReaddir.mockReturnValueOnce([makeDirent('node_modules', true)] as unknown as fs.Dirent[]);
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
    expect(spyReadFile).not.toHaveBeenCalled();
  });

  it('skips non-code files (README.txt)', () => {
    const worktreeDir = '/tmp/trail-snap-nocode';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add

    spyReaddir
      .mockReturnValueOnce([makeDirent('README.txt', false)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([] as unknown as fs.Dirent[]);
    mockExecReturn(''); // worktree remove

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
    expect(spyReadFile).not.toHaveBeenCalled();
  });

  it('falls back to rmSync when worktree remove throws', () => {
    const worktreeDir = '/tmp/trail-snap-rmfallback';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add
    spyReaddir.mockReturnValueOnce([] as unknown as fs.Dirent[]);
    mockExecThrow(); // worktree remove throws
    spyRmSync.mockReturnValueOnce(undefined);

    expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
    expect(spyRmSync).toHaveBeenCalledWith(worktreeDir, { recursive: true, force: true });
  });

  it('silently ignores rmSync also throwing during fallback cleanup', () => {
    const worktreeDir = '/tmp/trail-snap-rmfail';
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add
    spyReaddir.mockReturnValueOnce([] as unknown as fs.Dirent[]);
    mockExecThrow(); // worktree remove throws
    spyRmSync.mockImplementationOnce(() => { throw new Error('rmSync failed'); });

    expect(() => makeService().getSnapshotLineCount('v1.0.0')).not.toThrow();
  });
});

// ============================================================
// countTextLines edge cases (via getSnapshotLineCount)
// ============================================================
describe('countTextLines edge cases', () => {
  function setupSnapshotWith(content: string): ExecFileGitService {
    const worktreeDir = `/tmp/trail-snap-ctl-${Math.random().toString(36).slice(2)}`;
    mockExecReturn('abc123\n');
    spyMkdtemp.mockReturnValueOnce(worktreeDir);
    mockExecReturn(''); // worktree add
    spyReaddir
      .mockReturnValueOnce([makeDirent('x.ts', false)] as unknown as fs.Dirent[])
      .mockReturnValueOnce([] as unknown as fs.Dirent[]);
    spyReadFile.mockReturnValueOnce(content);
    mockExecReturn(''); // worktree remove
    return makeService();
  }

  it('returns 0 for empty string content', () => {
    expect(setupSnapshotWith('').getSnapshotLineCount('v1.0.0')).toBe(0);
  });

  it('returns 1 for single line with no line endings', () => {
    expect(setupSnapshotWith('const x = 1;').getSnapshotLineCount('v1.0.0')).toBe(1);
  });

  it('counts LF line endings', () => {
    expect(setupSnapshotWith('a\nb\nc\n').getSnapshotLineCount('v1.0.0')).toBe(3);
  });

  it('counts CRLF line endings', () => {
    expect(setupSnapshotWith('line1\r\nline2\r\n').getSnapshotLineCount('v1.0.0')).toBe(2);
  });

  it('counts CR-only line endings', () => {
    // 2 CRs → 2 lineBreaks → returns 2
    expect(setupSnapshotWith('line1\rline2\rline3').getSnapshotLineCount('v1.0.0')).toBe(2);
  });
});

// ============================================================
// shouldSkipSnapshotPath — various skip dirs
// ============================================================
describe('shouldSkipSnapshotPath skip dirs', () => {
  const skipDirs = [
    '.git', '.anytime', '.claude', '.vscode', '.worktrees',
    '.next', 'build', 'coverage', 'dist', 'out',
  ];

  for (const dir of skipDirs) {
    it(`skips ${dir} directory`, () => {
      const worktreeDir = `/tmp/trail-snap-skip-${dir.replace(/\./g, '')}`;
      mockExecReturn('abc123\n');
      spyMkdtemp.mockReturnValueOnce(worktreeDir);
      mockExecReturn(''); // worktree add
      spyReaddir.mockReturnValueOnce([makeDirent(dir, true)] as unknown as fs.Dirent[]);
      mockExecReturn(''); // worktree remove

      expect(makeService().getSnapshotLineCount('v1.0.0')).toBe(0);
    });
  }
});
