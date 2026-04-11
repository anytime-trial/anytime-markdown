// domain/usecase/ResolveTasks.ts — Resolve tasks from merge commits

import type { IGitService } from '../port/IGitService';
import type { ITaskRepository } from '../port/ITaskRepository';
import type { ISessionRepository } from '../port/ISessionRepository';
import type { C4Element, FeatureData } from '../engine/c4Mapper';
import { parseTaskFromMergeCommit } from '../engine/taskParser';
import { mapFilesToC4Elements, mapC4ToFeatures } from '../engine/c4Mapper';

export class ResolveTasks {
  constructor(
    private readonly git: IGitService,
    private readonly taskRepo: ITaskRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly c4Elements?: readonly C4Element[],
    private readonly featureData?: FeatureData,
  ) {}

  execute(): number {
    const mergeCommits = this.git.getMergeCommits();
    let count = 0;

    for (const entry of mergeCommits) {
      if (this.taskRepo.existsByMergeHash(entry.hash)) continue;

      const parsed = parseTaskFromMergeCommit(entry.subject);
      if (entry.parentHashes.length < 2) continue;

      const commitHashes = this.git.getCommitsInRange(
        entry.parentHashes[0],
        entry.parentHashes[1],
      );
      if (commitHashes.length === 0) continue;

      const fileStats = this.git.getAggregateFileStats(commitHashes);

      const taskId = entry.hash;
      const filesChanged = fileStats.length;
      let linesAdded = 0;
      let linesDeleted = 0;
      for (const f of fileStats) {
        linesAdded += f.linesAdded;
        linesDeleted += f.linesDeleted;
      }

      this.taskRepo.insertTask({
        id: taskId,
        merge_commit_hash: entry.hash,
        branch_name: parsed.branchName,
        pr_number: parsed.prNumber,
        title: entry.subject,
        merged_at: entry.mergedAt,
        base_branch: parsed.baseBranch,
        commit_count: commitHashes.length,
        files_changed: filesChanged,
        lines_added: linesAdded,
        lines_deleted: linesDeleted,
        session_count: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_duration_ms: 0,
        resolved_at: new Date().toISOString(),
      });

      this.taskRepo.insertFiles(
        taskId,
        fileStats.map((f) => ({
          task_id: taskId,
          file_path: f.filePath,
          lines_added: f.linesAdded,
          lines_deleted: f.linesDeleted,
          change_type: f.changeType,
        })),
      );

      // C4 mapping (optional)
      if (this.c4Elements) {
        const c4Mappings = mapFilesToC4Elements(
          fileStats.map((f) => f.filePath),
          this.c4Elements,
        );
        if (c4Mappings.length > 0) {
          this.taskRepo.insertC4Elements(
            taskId,
            c4Mappings.map((m) => ({
              task_id: taskId,
              element_id: m.elementId,
              element_type: m.elementType,
              element_name: m.elementName,
              match_type: m.matchType,
            })),
          );

          if (this.featureData) {
            const features = mapC4ToFeatures(
              c4Mappings.map((m) => m.elementId),
              this.featureData.features,
              this.featureData.mappings,
            );
            if (features.length > 0) {
              this.taskRepo.insertFeatures(
                taskId,
                features.map((f) => ({
                  task_id: taskId,
                  feature_id: f.featureId,
                  feature_name: f.featureName,
                  role: f.role,
                })),
              );
            }
          }
        }
      }

      // Session stats aggregation
      if (parsed.branchName) {
        const stats = this.sessionRepo.getStatsByBranch(parsed.branchName);
        if (stats) {
          this.taskRepo.updateSessionStats(taskId, stats);
        }
      }

      count++;
    }

    return count;
  }
}
