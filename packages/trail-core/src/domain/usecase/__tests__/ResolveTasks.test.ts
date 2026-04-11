import { ResolveTasks } from '../ResolveTasks';
import type { IGitService, MergeCommitEntry, FileStatEntry } from '../../port/IGitService';
import type { ITaskRepository } from '../../port/ITaskRepository';
import type { ISessionRepository, SessionStats } from '../../port/ISessionRepository';
import type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from '../../model/task';

function createMockGit(overrides: Partial<IGitService> = {}): IGitService {
  return {
    getMergeCommits: jest.fn<readonly MergeCommitEntry[], []>(() => []),
    getCommitsInRange: jest.fn<readonly string[], [string, string]>(() => []),
    getAggregateFileStats: jest.fn<readonly FileStatEntry[], [readonly string[]]>(() => []),
    ...overrides,
  };
}

function createMockTaskRepo(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    existsByMergeHash: jest.fn<boolean, [string]>(() => false),
    insertTask: jest.fn<void, [TaskRow]>(),
    insertFiles: jest.fn<void, [string, readonly TaskFileRow[]]>(),
    insertC4Elements: jest.fn<void, [string, readonly TaskC4ElementRow[]]>(),
    insertFeatures: jest.fn<void, [string, readonly TaskFeatureRow[]]>(),
    updateSessionStats: jest.fn<void, [string, SessionStats]>(),
    ...overrides,
  };
}

function createMockSessionRepo(overrides: Partial<ISessionRepository> = {}): ISessionRepository {
  return {
    getStatsByBranch: jest.fn<SessionStats | null, [string]>(() => null),
    ...overrides,
  };
}

const MERGE_ENTRY: MergeCommitEntry = {
  hash: 'abc123',
  subject: "Merge branch 'feature/test' into develop",
  parentHashes: ['parent1', 'parent2'],
  mergedAt: '2026-01-01T00:00:00Z',
};

const FILE_STATS: FileStatEntry[] = [
  { filePath: 'packages/core/src/index.ts', linesAdded: 10, linesDeleted: 5, changeType: 'modified' },
];

describe('ResolveTasks', () => {
  it('should skip already resolved merge commits', () => {
    const taskRepo = createMockTaskRepo({
      existsByMergeHash: jest.fn(() => true),
    });
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [MERGE_ENTRY]),
    });
    const uc = new ResolveTasks(git, taskRepo, createMockSessionRepo());
    const count = uc.execute();
    expect(count).toBe(0);
    expect(taskRepo.insertTask).not.toHaveBeenCalled();
  });

  it('should skip entries with fewer than 2 parents', () => {
    const entry = { ...MERGE_ENTRY, parentHashes: ['only-one'] };
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [entry]),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new ResolveTasks(git, taskRepo, createMockSessionRepo());
    const count = uc.execute();
    expect(count).toBe(0);
    expect(taskRepo.insertTask).not.toHaveBeenCalled();
  });

  it('should skip entries with 0 commits in range', () => {
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [MERGE_ENTRY]),
      getCommitsInRange: jest.fn(() => []),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new ResolveTasks(git, taskRepo, createMockSessionRepo());
    const count = uc.execute();
    expect(count).toBe(0);
    expect(taskRepo.insertTask).not.toHaveBeenCalled();
  });

  it('should insert task and files on success', () => {
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [MERGE_ENTRY]),
      getCommitsInRange: jest.fn(() => ['c1', 'c2']),
      getAggregateFileStats: jest.fn(() => FILE_STATS),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new ResolveTasks(git, taskRepo, createMockSessionRepo());
    const count = uc.execute();
    expect(count).toBe(1);
    expect(taskRepo.insertTask).toHaveBeenCalledTimes(1);
    expect(taskRepo.insertFiles).toHaveBeenCalledTimes(1);
  });

  it('should not call insertC4Elements when no c4Elements provided', () => {
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [MERGE_ENTRY]),
      getCommitsInRange: jest.fn(() => ['c1']),
      getAggregateFileStats: jest.fn(() => FILE_STATS),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new ResolveTasks(git, taskRepo, createMockSessionRepo());
    uc.execute();
    expect(taskRepo.insertC4Elements).not.toHaveBeenCalled();
  });

  it('should call updateSessionStats when branch name is present', () => {
    const stats: SessionStats = {
      sessionCount: 2,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCacheReadTokens: 200,
      totalDurationMs: 60000,
    };
    const git = createMockGit({
      getMergeCommits: jest.fn(() => [MERGE_ENTRY]),
      getCommitsInRange: jest.fn(() => ['c1']),
      getAggregateFileStats: jest.fn(() => FILE_STATS),
    });
    const sessionRepo = createMockSessionRepo({
      getStatsByBranch: jest.fn(() => stats),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new ResolveTasks(git, taskRepo, sessionRepo);
    uc.execute();
    expect(sessionRepo.getStatsByBranch).toHaveBeenCalledWith('feature/test');
    expect(taskRepo.updateSessionStats).toHaveBeenCalledWith('abc123', stats);
  });
});
