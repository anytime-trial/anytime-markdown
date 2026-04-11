// domain/usecase/AggregateSessionStats.ts — Aggregate session stats for a task

import type { ISessionRepository } from '../port/ISessionRepository';
import type { ITaskRepository } from '../port/ITaskRepository';

export class AggregateSessionStats {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly taskRepo: ITaskRepository,
  ) {}

  execute(taskId: string, branchName: string): void {
    const stats = this.sessionRepo.getStatsByBranch(branchName);
    if (stats) {
      this.taskRepo.updateSessionStats(taskId, stats);
    }
  }
}
