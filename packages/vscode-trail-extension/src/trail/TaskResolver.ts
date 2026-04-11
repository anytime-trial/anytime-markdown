import type { Database } from 'sql.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { toUTC } from './dateUtils';

// ---------------------------------------------------------------------------
//  Type definitions
// ---------------------------------------------------------------------------

export interface TaskRow {
  readonly id: string;
  readonly merge_commit_hash: string;
  readonly branch_name: string | null;
  readonly pr_number: number | null;
  readonly title: string;
  readonly merged_at: string;
  readonly base_branch: string;
  readonly commit_count: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly session_count: number;
  readonly total_input_tokens: number;
  readonly total_output_tokens: number;
  readonly total_cache_read_tokens: number;
  readonly total_duration_ms: number;
  readonly resolved_at: string | null;
}

export interface TaskFileRow {
  readonly task_id: string;
  readonly file_path: string;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly change_type: string;
}

export interface TaskC4ElementRow {
  readonly task_id: string;
  readonly element_id: string;
  readonly element_type: string;
  readonly element_name: string;
  readonly match_type: string;
}

export interface TaskFeatureRow {
  readonly task_id: string;
  readonly feature_id: string;
  readonly feature_name: string;
  readonly role: string;
}

// ---------------------------------------------------------------------------
//  SQL definitions
// ---------------------------------------------------------------------------

export const CREATE_TASKS = `CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  merge_commit_hash TEXT NOT NULL,
  branch_name TEXT,
  pr_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  merged_at TEXT NOT NULL DEFAULT '',
  base_branch TEXT NOT NULL DEFAULT '',
  commit_count INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  UNIQUE(merge_commit_hash)
)`;

export const CREATE_TASK_FILES = `CREATE TABLE IF NOT EXISTS task_files (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_deleted INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL DEFAULT 'modified',
  PRIMARY KEY (task_id, file_path)
)`;

export const CREATE_TASK_C4_ELEMENTS = `CREATE TABLE IF NOT EXISTS task_c4_elements (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  element_type TEXT NOT NULL,
  element_name TEXT NOT NULL DEFAULT '',
  match_type TEXT NOT NULL,
  PRIMARY KEY (task_id, element_id)
)`;

export const CREATE_TASK_FEATURES = `CREATE TABLE IF NOT EXISTS task_features (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL,
  feature_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, feature_id)
)`;

export const CREATE_TASK_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_tasks_merged_at ON tasks(merged_at)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch_name)',
  'CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_task_c4_task ON task_c4_elements(task_id)',
  'CREATE INDEX IF NOT EXISTS idx_task_features_task ON task_features(task_id)',
];

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

interface ParsedTask {
  readonly branchName: string | null;
  readonly prNumber: number | null;
  readonly baseBranch: string;
}

/**
 * マージコミットのメッセージからブランチ名・PR番号・マージ先を抽出する。
 */
export function parseTaskFromMergeCommit(subject: string): ParsedTask {
  let branchName: string | null = null;
  let prNumber: number | null = null;
  let baseBranch = '';

  // Pattern 1: "Merge branch 'feature/xxx' into develop"
  const mergeMatch = /^[Mm]erge branch '([^']+)' into (\S+)/.exec(subject);
  if (mergeMatch) {
    branchName = mergeMatch[1];
    baseBranch = mergeMatch[2];
  }

  // Pattern 2: "merge: feature/xxx into develop"
  if (!branchName) {
    const altMatch = /^merge:\s+(\S+)\s+into\s+(\S+)/i.exec(subject);
    if (altMatch) {
      branchName = altMatch[1];
      baseBranch = altMatch[2];
    }
  }

  // Pattern 3: "(#NN)" anywhere in subject
  const prMatch = /\(#(\d+)\)/.exec(subject);
  if (prMatch) {
    prNumber = Number.parseInt(prMatch[1], 10);
  }

  return { branchName, prNumber, baseBranch };
}

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

export interface C4MappingResult {
  readonly elementId: string;
  readonly elementType: string;
  readonly elementName: string;
  readonly matchType: 'exact' | 'package_fallback';
}

/**
 * 変更ファイルパスからC4モデル要素へマッピングする。
 *
 * 1. `file::` + filePath で exact マッチ
 * 2. マッチしない場合 `packages/xxx/` → `pkg_xxx` にフォールバック
 */
export function mapFilesToC4Elements(
  filePaths: readonly string[],
  elements: readonly C4Element[],
): C4MappingResult[] {
  const results: C4MappingResult[] = [];
  const seen = new Set<string>();

  // Build lookup maps for efficient matching
  const elementById = new Map<string, C4Element>();
  for (const el of elements) {
    elementById.set(el.id, el);
  }

  for (const filePath of filePaths) {
    // 1. Exact file match
    const fileId = `file::${filePath}`;
    const fileEl = elementById.get(fileId);
    if (fileEl && !seen.has(fileEl.id)) {
      results.push({
        elementId: fileEl.id,
        elementType: fileEl.type,
        elementName: fileEl.name,
        matchType: 'exact',
      });
      seen.add(fileEl.id);

      // Also add parent container/component via boundaryId chain
      let current = fileEl;
      while (current.boundaryId) {
        const parent = elementById.get(current.boundaryId);
        if (!parent || seen.has(parent.id)) break;
        results.push({
          elementId: parent.id,
          elementType: parent.type,
          elementName: parent.name,
          matchType: 'exact',
        });
        seen.add(parent.id);
        current = parent;
      }
      continue;
    }

    // 2. Package fallback: packages/xxx/ → pkg_xxx
    const pkgMatch = /^packages\/([^/]+)\//.exec(filePath);
    if (pkgMatch) {
      const pkgId = `pkg_${pkgMatch[1]}`;
      if (!seen.has(pkgId)) {
        const pkgEl = elementById.get(pkgId);
        if (pkgEl) {
          results.push({
            elementId: pkgId,
            elementType: pkgEl.type,
            elementName: pkgEl.name,
            matchType: 'package_fallback',
          });
          seen.add(pkgId);
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
//  Feature mapping
// ---------------------------------------------------------------------------

interface FeatureMappingResult {
  readonly featureId: string;
  readonly featureName: string;
  readonly role: string;
}

/**
 * タスクの C4 要素から featureMatrix を使って影響を受ける機能を導出する。
 */
function mapC4ToFeatures(
  c4ElementIds: readonly string[],
  features: readonly Feature[],
  mappings: readonly FeatureMapping[],
): FeatureMappingResult[] {
  const elementIdSet = new Set(c4ElementIds);
  const featureById = new Map<string, Feature>();
  for (const f of features) {
    featureById.set(f.id, f);
  }

  // Find all features that map to any of the affected C4 elements
  const seen = new Set<string>();
  const results: FeatureMappingResult[] = [];

  for (const mapping of mappings) {
    if (!elementIdSet.has(mapping.elementId)) continue;
    if (seen.has(mapping.featureId)) continue;
    seen.add(mapping.featureId);

    const feature = featureById.get(mapping.featureId);
    if (!feature) continue;

    results.push({
      featureId: mapping.featureId,
      featureName: feature.name,
      role: mapping.role,
    });
  }

  return results;
}

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

    const { branchName, prNumber, baseBranch } = parseTaskFromMergeCommit(subject);

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
      const c4Mappings = mapFilesToC4Elements(
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
      const featureMappings = mapC4ToFeatures(
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
