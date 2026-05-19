import { getChanges, getSyncInfo, getRepoInfo, expandUntrackedDir } from '../GitStatusParser';

// Mock gitExec
jest.mock('../../../utils/gitExec', () => ({
  gitExec: jest.fn(),
}));
// Mock GitLogger
jest.mock('../../../utils/GitLogger', () => ({
  GitLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debugSql: jest.fn(),
    dispose: jest.fn(),
  },
}));

import { gitExec } from '../../../utils/gitExec';
const mockGitExec = gitExec as jest.MockedFunction<typeof gitExec>;

describe('expandUntrackedDir', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns ParsedChange entries for files in dir', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'new-dir/file1.ts\nnew-dir/file2.ts\n', stderr: '' });
    const result = await expandUntrackedDir('/repo', 'new-dir/');

    expect(mockGitExec).toHaveBeenCalledWith(
      ['ls-files', '--others', '--exclude-standard', '--', 'new-dir/'],
      { cwd: '/repo' },
    );
    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe('new-dir/file1.ts');
    expect(result[0].group).toBe('changes');
    expect(result[1].filePath).toBe('new-dir/file2.ts');
  });

  it('returns empty array on git error', async () => {
    mockGitExec.mockRejectedValueOnce(new Error('not a git repo'));
    const result = await expandUntrackedDir('/tmp', 'some-dir/');
    expect(result).toEqual([]);
  });

  it('filters empty lines from output', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'dir/a.ts\n\n  \ndir/b.ts\n', stderr: '' });
    const result = await expandUntrackedDir('/repo', 'dir/');
    expect(result).toHaveLength(2);
  });
});

describe('getChanges', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns staged and unstaged changes', async () => {
    mockGitExec.mockResolvedValueOnce({
      stdout: 'M  src/a.ts\n M src/b.ts\n?? src/new.ts\n',
      stderr: '',
    });
    const { staged, unstaged } = await getChanges('/repo');

    expect(staged).toHaveLength(1);
    expect(staged[0].filePath).toBe('src/a.ts');
    expect(staged[0].group).toBe('staged');

    expect(unstaged).toHaveLength(2);
    expect(unstaged[0].filePath).toBe('src/b.ts');
    expect(unstaged[0].group).toBe('changes');
    expect(unstaged[1].filePath).toBe('src/new.ts');
  });

  it('expands untracked directories', async () => {
    mockGitExec
      .mockResolvedValueOnce({ stdout: '?? new-dir/\n', stderr: '' }) // status
      .mockResolvedValueOnce({ stdout: 'new-dir/file.ts\n', stderr: '' }); // ls-files

    const { unstaged } = await getChanges('/repo');
    expect(unstaged).toHaveLength(1);
    expect(unstaged[0].filePath).toBe('new-dir/file.ts');
  });

  it('returns empty arrays on git error', async () => {
    mockGitExec.mockRejectedValueOnce(new Error('fatal: not a git repository'));
    const result = await getChanges('/not-a-repo');
    expect(result).toEqual({ staged: [], unstaged: [] });
  });

  it('skips lines shorter than 4 characters', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'M  a\n\nAB\n', stderr: '' });
    const { staged } = await getChanges('/repo');
    // 'M  a' is exactly 4 chars so valid, 'AB' is 2 chars and skipped
    expect(staged).toHaveLength(1);
  });

  it('handles mixed staged and unstaged on same file', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'MM src/both.ts\n', stderr: '' });
    const { staged, unstaged } = await getChanges('/repo');
    expect(staged).toHaveLength(1);
    expect(unstaged).toHaveLength(1);
    expect(staged[0].filePath).toBe('src/both.ts');
    expect(unstaged[0].filePath).toBe('src/both.ts');
  });
});

describe('getSyncInfo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns ahead and behind counts', async () => {
    mockGitExec
      .mockResolvedValueOnce({ stdout: '3\n', stderr: '' })   // ahead
      .mockResolvedValueOnce({ stdout: '1\n', stderr: '' });   // behind

    const result = await getSyncInfo('/repo');
    expect(result).toEqual({ ahead: 3, behind: 1 });
  });

  it('returns 0 for both when no upstream', async () => {
    mockGitExec
      .mockRejectedValueOnce(new Error('no upstream')) // ahead fails
      .mockRejectedValueOnce(new Error('no upstream')); // behind fails

    const result = await getSyncInfo('/repo');
    expect(result).toEqual({ ahead: 0, behind: 0 });
  });

  it('handles non-numeric output gracefully', async () => {
    mockGitExec
      .mockResolvedValueOnce({ stdout: 'not-a-number\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: '2\n', stderr: '' });

    const result = await getSyncInfo('/repo');
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(2);
  });

  it('handles partial failure (ahead ok, behind fails)', async () => {
    mockGitExec
      .mockResolvedValueOnce({ stdout: '5\n', stderr: '' })
      .mockRejectedValueOnce(new Error('no upstream'));

    const result = await getSyncInfo('/repo');
    expect(result.ahead).toBe(5);
    expect(result.behind).toBe(0);
  });
});

describe('getRepoInfo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns repoName and branchName', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'feature/my-branch\n', stderr: '' });
    const result = await getRepoInfo('/home/user/projects/my-repo');

    expect(result.repoName).toBe('my-repo');
    expect(result.branchName).toBe('feature/my-branch');
  });

  it('returns empty branchName on git error', async () => {
    mockGitExec.mockRejectedValueOnce(new Error('not a git repo'));
    const result = await getRepoInfo('/some/path/my-project');

    expect(result.repoName).toBe('my-project');
    expect(result.branchName).toBe('');
  });

  it('trims trailing newline from branch name', async () => {
    mockGitExec.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' });
    const result = await getRepoInfo('/path/to/repo');
    expect(result.branchName).toBe('main');
  });
});
