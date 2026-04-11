import type { Database } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { toUTC } from './dateUtils';
import {
  parseTaskFromMergeCommit as parseTaskFromMergeCommitCore,
  mapFilesToC4Elements as mapFilesToC4ElementsCore,
  mapC4ToFeatures as mapC4ToFeaturesCore,
} from '@anytime-markdown/trail-core';

// Re-export domain types from trail-core
/** @deprecated Import from '@anytime-markdown/trail-core' directly */
export type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from '@anytime-markdown/trail-core';
/** @deprecated Import from '@anytime-markdown/trail-core' directly */
export { parseTaskFromMergeCommit, mapFilesToC4Elements } from '@anytime-markdown/trail-core';
export type { C4MappingResult } from '@anytime-markdown/trail-core';

// ---------------------------------------------------------------------------
//  Type definitions
// ---------------------------------------------------------------------------

// Type definitions moved to @anytime-markdown/trail-core/domain/model
// Re-exported above for backward compatibility

// ---------------------------------------------------------------------------
//  SQL definitions
// ---------------------------------------------------------------------------

// SQL constants moved to @anytime-markdown/trail-core/domain/schema
/** @deprecated Import from '@anytime-markdown/trail-core' directly */
export {
  CREATE_TASKS,
  CREATE_TASK_FILES,
  CREATE_TASK_C4_ELEMENTS,
  CREATE_TASK_FEATURES,
  CREATE_TASK_INDEXES,
} from '@anytime-markdown/trail-core';

// ---------------------------------------------------------------------------
//  C4 model types (minimal subset)
// ---------------------------------------------------------------------------

interface C4Element {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly boundaryId?: string;
}

interface FeatureMapping {
  readonly featureId: string;
  readonly elementId: string;
  readonly role: string;
}

interface Feature {
  readonly id: string;
  readonly name: string;
}

interface C4Model {
  readonly model: {
    readonly elements: readonly C4Element[];
  };
  readonly featureMatrix?: {
    readonly features: readonly Feature[];
    readonly mappings: readonly FeatureMapping[];
  };
}

// ---------------------------------------------------------------------------
//  Merge commit parsing
// ---------------------------------------------------------------------------

// parseTaskFromMergeCommit moved to @anytime-markdown/trail-core/domain/engine

// ---------------------------------------------------------------------------
//  File stats aggregation
// ---------------------------------------------------------------------------

interface FileStats {
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly changeType: string;
}

/**
 * マージコミットに含まれる全コミットの変更ファイルを集計する。
 * 同一ファイルの変更は合算し、ユニークファイル単位で返す。
 */
function computeAggregateFileStats(
  commitHashes: readonly string[],
  gitRoot: string,
): FileStats[] {
  const execOpts = { encoding: 'utf-8' as const, timeout: 10_000 };
  const fileMap = new Map<string, { added: number; deleted: number; changeType: string }>();

  for (const hash of commitHashes) {
    // Get line stats
    try {
      const numstat = execFileSync('git', [
        'diff', '--numstat', `${hash}^..${hash}`,
      ], { ...execOpts, cwd: gitRoot });

      for (const line of numstat.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [added, deleted, filePath] = trimmed.split('\t');
        if (!filePath) continue;

        const existing = fileMap.get(filePath) ?? { added: 0, deleted: 0, changeType: 'modified' };
        if (added !== '-') existing.added += Number.parseInt(added, 10) || 0;
        if (deleted !== '-') existing.deleted += Number.parseInt(deleted, 10) || 0;
        fileMap.set(filePath, existing);
      }
    } catch {
      // Initial commit or other error — skip
    }

    // Get change types (A/M/D/R)
    try {
      const nameStatus = execFileSync('git', [
        'diff', '--name-status', `${hash}^..${hash}`,
      ], { ...execOpts, cwd: gitRoot });

      for (const line of nameStatus.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('\t');
        if (parts.length < 2) continue;

        const status = parts[0].charAt(0);
        // For renames (R100), the new path is parts[2]
        const filePath = status === 'R' && parts[2] ? parts[2] : parts[1];
        const existing = fileMap.get(filePath);
        if (!existing) continue;

        const typeMap: Record<string, string> = {
          A: 'added', M: 'modified', D: 'deleted', R: 'renamed',
        };
        existing.changeType = typeMap[status] ?? 'modified';
      }
    } catch {
      // Skip — change types remain as default 'modified'
    }
  }

  return [...fileMap.entries()].map(([filePath, stats]) => ({
    filePath,
    linesAdded: stats.added,
    linesDeleted: stats.deleted,
    changeType: stats.changeType,
  }));
}

// ---------------------------------------------------------------------------
//  C4 model mapping
// ---------------------------------------------------------------------------

// mapFilesToC4Elements moved to @anytime-markdown/trail-core/domain/engine

// ---------------------------------------------------------------------------
//  Feature mapping
// ---------------------------------------------------------------------------

// mapC4ToFeatures moved to @anytime-markdown/trail-core/domain/engine

// ---------------------------------------------------------------------------
//  Session aggregation
// ---------------------------------------------------------------------------

/**
 * ブランチ名でセッションを集計し、タスクのトークン・セッション数を更新する。
 */
function aggregateSessionStats(
  db: Database,
  taskId: string,
  branchName: string | null,
): void {
  if (!branchName) return;

  const escaped = branchName.replaceAll("'", "''");
  const result = db.exec(`
    SELECT
      COUNT(*) as cnt,
      COALESCE(SUM(input_tokens), 0) as inp,
      COALESCE(SUM(output_tokens), 0) as outp,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read
    FROM sessions
    WHERE git_branch = '${escaped}'
  `);

  if (!result[0]?.values?.[0]) return;
  const [cnt, inp, outp, cacheRead] = result[0].values[0];

  // Calculate total duration from start_time/end_time
  const durResult = db.exec(`
    SELECT COALESCE(SUM(
      CAST((julianday(end_time) - julianday(start_time)) * 86400000 AS INTEGER)
    ), 0) as dur
    FROM sessions
    WHERE git_branch = '${escaped}' AND end_time != '' AND start_time != ''
  `);
  const dur = durResult[0]?.values?.[0]?.[0] ?? 0;

  const taskEscaped = taskId.replaceAll("'", "''");
  db.run(`UPDATE tasks SET
    session_count = ${cnt},
    total_input_tokens = ${inp},
    total_output_tokens = ${outp},
    total_cache_read_tokens = ${cacheRead},
    total_duration_ms = ${dur}
    WHERE id = '${taskEscaped}'`);
}

// ---------------------------------------------------------------------------
//  Main resolver
// ---------------------------------------------------------------------------

/**
 * git log のマージコミットからタスク（PR）を解決し、DBに保存する。
 * 既に解決済みのマージコミットはスキップする。
 */
export function resolveTasks(
  db: Database,
  gitRoot: string,
  c4ModelPath?: string,
): number {
  const execOpts = { encoding: 'utf-8' as const, timeout: 30_000 };
  const logFormat = '%H%x00%s%x00%P%x00%aI%x1e';

  // Load C4 model if path provided
  let c4Elements: readonly C4Element[] = [];
  let featureData: { features: readonly Feature[]; mappings: readonly FeatureMapping[] } | null = null;
  if (c4ModelPath) {
    try {
      const raw = fs.readFileSync(c4ModelPath, 'utf-8');
      const model = JSON.parse(raw) as C4Model;
      c4Elements = model.model.elements;
      if (model.featureMatrix) {
        featureData = {
          features: model.featureMatrix.features,
          mappings: model.featureMatrix.mappings,
        };
      }
    } catch {
      // C4 model not available — proceed without mapping
    }
  }

  // Get all merge commits
  let logOutput = '';
  try {
    logOutput = execFileSync('git', [
      'log', '--merges', '--all',
      `--format=${logFormat}`,
    ], { ...execOpts, cwd: gitRoot });
  } catch {
    return 0;
  }

  const entries = logOutput
    .split('\x1e')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let count = 0;

  const insertTask = db.prepare(
    `INSERT OR IGNORE INTO tasks
      (id, merge_commit_hash, branch_name, pr_number, title,
       merged_at, base_branch, commit_count, files_changed,
       lines_added, lines_deleted, resolved_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
  );

  const insertFile = db.prepare(
    `INSERT OR IGNORE INTO task_files
      (task_id, file_path, lines_added, lines_deleted, change_type)
      VALUES (?,?,?,?,?)`,
  );

  const insertC4 = db.prepare(
    `INSERT OR IGNORE INTO task_c4_elements
      (task_id, element_id, element_type, element_name, match_type)
      VALUES (?,?,?,?,?)`,
  );

  const insertFeature = db.prepare(
    `INSERT OR IGNORE INTO task_features
      (task_id, feature_id, feature_name, role)
      VALUES (?,?,?,?)`,
  );

  for (const entry of entries) {
    const parts = entry.split('\x00');
    if (parts.length < 4) continue;

    const mergeHash = parts[0];
    const subject = parts[1];
    const parents = parts[2];
    const mergedAt = toUTC(parts[3]);

    // Skip if already resolved
    const existing = db.exec(
      `SELECT id FROM tasks WHERE merge_commit_hash = '${mergeHash.replaceAll("'", "''")}'`,
    );
    if (existing[0]?.values?.length) continue;

    const { branchName, prNumber, baseBranch } = parseTaskFromMergeCommitCore(subject);

    // Get commits in merge range: merge^1..merge^2
    const parentHashes = parents.split(' ');
    if (parentHashes.length < 2) continue; // Not a standard merge

    let commitsOutput = '';
    try {
      commitsOutput = execFileSync('git', [
        'log', `${parentHashes[0]}..${parentHashes[1]}`,
        '--no-merges',
        '--format=%H',
      ], { encoding: 'utf-8', timeout: 10_000, cwd: gitRoot });
    } catch {
      continue;
    }

    const commitHashes = commitsOutput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (commitHashes.length === 0) continue;

    // Compute file stats (with change_type)
    const fileStats = computeAggregateFileStats(commitHashes, gitRoot);

    const totalAdded = fileStats.reduce((s, f) => s + f.linesAdded, 0);
    const totalDeleted = fileStats.reduce((s, f) => s + f.linesDeleted, 0);

    // Insert task
    insertTask.run([
      mergeHash,
      mergeHash,
      branchName,
      prNumber,
      subject,
      mergedAt,
      baseBranch,
      commitHashes.length,
      fileStats.length,
      totalAdded,
      totalDeleted,
    ]);

    // Insert task files (with change_type)
    for (const file of fileStats) {
      insertFile.run([mergeHash, file.filePath, file.linesAdded, file.linesDeleted, file.changeType]);
    }

    // Insert C4 mappings (with element_name)
    let c4ElementIds: string[] = [];
    if (c4Elements.length > 0) {
      const c4Mappings = mapFilesToC4ElementsCore(
        fileStats.map((f) => f.filePath),
        c4Elements,
      );
      c4ElementIds = c4Mappings.map((m) => m.elementId);
      for (const m of c4Mappings) {
        insertC4.run([mergeHash, m.elementId, m.elementType, m.elementName, m.matchType]);
      }
    }

    // Insert feature mappings
    if (featureData && c4ElementIds.length > 0) {
      const featureMappings = mapC4ToFeaturesCore(
        c4ElementIds,
        featureData.features,
        featureData.mappings,
      );
      for (const fm of featureMappings) {
        insertFeature.run([mergeHash, fm.featureId, fm.featureName, fm.role]);
      }
    }

    // Aggregate session stats for this task
    aggregateSessionStats(db, mergeHash, branchName);

    count++;
  }

  insertTask.free();
  insertFile.free();
  insertC4.free();
  insertFeature.free();

  return count;
}
