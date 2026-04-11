import { AggregateSessionStats } from '../AggregateSessionStats';
import type { ISessionRepository, SessionStats } from '../../port/ISessionRepository';
import type { ITaskRepository } from '../../port/ITaskRepository';
import type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from '../../model/task';

function createMockSessionRepo(overrides: Partial<ISessionRepository> = {}): ISessionRepository {
  return {
    getStatsByBranch: jest.fn<SessionStats | null, [string]>(() => null),
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

describe('AggregateSessionStats', () => {
  it('should update session stats when branch matches', () => {
    const stats: SessionStats = {
      sessionCount: 3,
      totalInputTokens: 5000,
      totalOutputTokens: 2000,
      totalCacheReadTokens: 1000,
      totalDurationMs: 120000,
    };
    const sessionRepo = createMockSessionRepo({
      getStatsByBranch: jest.fn(() => stats),
    });
    const taskRepo = createMockTaskRepo();
    const uc = new AggregateSessionStats(sessionRepo, taskRepo);
    uc.execute('task-1', 'feature/test');
    expect(taskRepo.updateSessionStats).toHaveBeenCalledWith('task-1', stats);
  });

  it('should not call updateSessionStats when getStatsByBranch returns null', () => {
    const sessionRepo = createMockSessionRepo();
    const taskRepo = createMockTaskRepo();
    const uc = new AggregateSessionStats(sessionRepo, taskRepo);
    uc.execute('task-1', 'feature/nonexistent');
    expect(taskRepo.updateSessionStats).not.toHaveBeenCalled();
  });
});
