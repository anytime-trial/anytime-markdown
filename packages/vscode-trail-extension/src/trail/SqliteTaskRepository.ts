// SqliteTaskRepository.ts — ITaskRepository implementation using sql.js

import type { Database } from 'sql.js';
import type {
  ITaskRepository,
  SessionStats,
  TaskRow,
  TaskFileRow,
  TaskC4ElementRow,
  TaskFeatureRow,
} from '@anytime-markdown/trail-core';

export class SqliteTaskRepository implements ITaskRepository {
  constructor(private readonly db: Database) {}

  existsByMergeHash(hash: string): boolean {
    const escaped = hash.replaceAll("'", "''");
    const result = this.db.exec(
      `SELECT id FROM tasks WHERE merge_commit_hash = '${escaped}'`,
    );
    return (result[0]?.values?.length ?? 0) > 0;
  }

  insertTask(row: TaskRow): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO tasks
        (id, merge_commit_hash, branch_name, pr_number, title,
         merged_at, base_branch, commit_count, files_changed,
         lines_added, lines_deleted, resolved_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
    );
    stmt.run([
      row.id,
      row.merge_commit_hash,
      row.branch_name,
      row.pr_number,
      row.title,
      row.merged_at,
      row.base_branch,
      row.commit_count,
      row.files_changed,
      row.lines_added,
      row.lines_deleted,
    ]);
    stmt.free();
  }

  insertFiles(taskId: string, files: readonly TaskFileRow[]): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO task_files
        (task_id, file_path, lines_added, lines_deleted, change_type)
        VALUES (?,?,?,?,?)`,
    );
    for (const file of files) {
      stmt.run([taskId, file.file_path, file.lines_added, file.lines_deleted, file.change_type]);
    }
    stmt.free();
  }

  insertC4Elements(taskId: string, elements: readonly TaskC4ElementRow[]): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO task_c4_elements
        (task_id, element_id, element_type, element_name, match_type)
        VALUES (?,?,?,?,?)`,
    );
    for (const el of elements) {
      stmt.run([taskId, el.element_id, el.element_type, el.element_name, el.match_type]);
    }
    stmt.free();
  }

  insertFeatures(taskId: string, features: readonly TaskFeatureRow[]): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO task_features
        (task_id, feature_id, feature_name, role)
        VALUES (?,?,?,?)`,
    );
    for (const f of features) {
      stmt.run([taskId, f.feature_id, f.feature_name, f.role]);
    }
    stmt.free();
  }

  updateSessionStats(taskId: string, stats: SessionStats): void {
    const escaped = taskId.replaceAll("'", "''");
    this.db.run(`UPDATE tasks SET
      session_count = ${stats.sessionCount},
      total_input_tokens = ${stats.totalInputTokens},
      total_output_tokens = ${stats.totalOutputTokens},
      total_cache_read_tokens = ${stats.totalCacheReadTokens},
      total_duration_ms = ${stats.totalDurationMs}
      WHERE id = '${escaped}'`);
  }
}
