import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { MemoryDbConnection } from '../db/connection/types';
import { fromTrailGraph } from '../ingest/code/fromTrailGraph';
import { ingestAstFacts, type AstFactInput } from '../ingest/code/astFunctionLevel';
import { ingestDecisionComments, type DecisionCommentItem } from '../ingest/code/extractComments';
import { extractCommitRationale } from '../ingest/code/extractCommitRationale';
import { noopLogger, type MemoryLogger } from '../logger';
// typescript / analyzeWithProgram への依存は撤去。code graph は trail-db の current_graphs、
// decision comment は trail-db の code_decision_comments（analyze-child が永続化）から読む。

const SCOPE = 'code_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';

export interface CodeIncrementalResult {
  status: 'success' | 'partial' | 'error' | 'skipped';
  items_processed: number;
  entities_inserted: number;
  edges_inserted: number;
  duration_ms: number;
  /** ingestAstFacts が抽出した Function / File entity ID 集合。reconciliation で使用 */
  current_entity_ids: Set<string>;
}

function runId(startedAt: string): string {
  return createHash('sha1')
    .update(`${SCOPE}:${startedAt}`)
    .digest('hex')
    .slice(0, 16);
}

function readPipelineState(db: MemoryDbConnection): { last_processed_at: string } {
  const stmt = db.prepare(
    `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = ?`
  );
  try {
    const row = stmt.get(SCOPE);
    if (row) return { last_processed_at: (row['last_processed_at'] as string) || DEFAULT_SINCE };
    return { last_processed_at: DEFAULT_SINCE };
  } finally {
    stmt.free?.();
  }
}

function upsertPipelineState(
  db: MemoryDbConnection,
  opts: { status: string; last_processed_at?: string; error_detail?: string }
): void {
  const { status, last_processed_at, error_detail } = opts;
  db.run(
    `INSERT INTO memory_pipeline_state
       (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail      = excluded.error_detail`,
    [SCOPE, status, last_processed_at ?? '', error_detail ?? '']
  );
}

function insertPipelineRun(db: MemoryDbConnection, id: string, startedAt: string): void {
  db.run(
    `INSERT INTO memory_pipeline_runs
       (id, scope, started_at, status,
        items_processed, entities_inserted, entities_updated,
        edges_inserted, edges_invalidated, drifts_detected,
        items_failed, duration_ms)
     VALUES (?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0)`,
    [id, SCOPE, startedAt]
  );
}

function finalizePipelineRun(
  db: MemoryDbConnection,
  id: string,
  startedAt: string,
  status: 'success' | 'partial' | 'error',
  totals: {
    items_processed: number;
    entities_inserted: number;
    edges_inserted: number;
  }
): void {
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();
  db.run(
    `UPDATE memory_pipeline_runs SET
       finished_at       = ?,
       status            = ?,
       items_processed   = ?,
       entities_inserted = ?,
       edges_inserted    = ?,
       duration_ms       = ?
     WHERE id = ?`,
    [
      finishedAt,
      status,
      totals.items_processed,
      totals.entities_inserted,
      totals.edges_inserted,
      durationMs,
      id,
    ]
  );
}


/**
 * Incremental pipeline that reads `trail.current_code_graphs` and runs the
 * code ingest pipeline (fromTrailGraph, ingestAstFacts, ingestDecisionComments,
 * extractCommitRationale) when the graph has been updated since the last run.
 *
 * typescript には依存しない。生 TrailGraph は `trail.current_graphs` から、decision
 * comment は `trail.code_decision_comments`（analyze-child が永続化）から読む。
 *
 * The trail DB must already be ATTACHed as "trail" on `db`.
 */
export async function runCodeIncremental(opts: {
  db: MemoryDbConnection;
  repoName: string;
  tsconfigPath: string;
  gitRoot: string;
  logger?: MemoryLogger;
}): Promise<CodeIncrementalResult> {
  // tsconfigPath は opts に残すが本処理では未使用（TS 再解析を撤去したため）。
  const { db, repoName, gitRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── 1. Read last_processed_at ────────────────────────────────────────────
  const { last_processed_at } = readPipelineState(db);

  // ── 2. Read current_code_graphs.updated_at ───────────────────────────────
  let graphUpdatedAt: string | null = null;
  // Phase H-3: trail.current_code_graphs から repo_name 列を撤去した。attach 済 trail スキーマの
  // repos を JOIN して repo_name → repo_id を解決し、repo_id で絞る (クロス DB JOIN)。
  const stmt = db.prepare(
    `SELECT g.updated_at FROM trail.current_code_graphs g
       JOIN trail.repos r ON r.repo_id = g.repo_id
      WHERE r.repo_name = ?`
  );
  try {
    const row = stmt.get(repoName);
    if (row) graphUpdatedAt = (row['updated_at'] as string) ?? null;
  } finally {
    stmt.free?.();
  }

  if (graphUpdatedAt === null) {
    logger.info(
      `[anytime-memory] runCodeIncremental: no code graph found for repo "${repoName}" — skipping`
    );
    return { status: 'skipped', items_processed: 0, entities_inserted: 0, edges_inserted: 0, duration_ms: 0, current_entity_ids: new Set() };
  }

  if (graphUpdatedAt <= last_processed_at) {
    logger.info(
      `[anytime-memory] runCodeIncremental: graph not updated (updated_at=${graphUpdatedAt}, last_processed_at=${last_processed_at}) — skipping`
    );
    return { status: 'skipped', items_processed: 0, entities_inserted: 0, edges_inserted: 0, duration_ms: 0, current_entity_ids: new Set() };
  }

  // ── 3. Insert pipeline_run (running) ─────────────────────────────────────
  const rId = runId(startedAt);
  insertPipelineRun(db, rId, startedAt);
  upsertPipelineState(db, { status: 'running' });

  const totals = { items_processed: 0, entities_inserted: 0, edges_inserted: 0 };
  let hasIngestFailure = false;

  // ── 4. git rev-parse HEAD ────────────────────────────────────────────────
  let commitSha: string | null = null;
  try {
    commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: gitRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    logger.error(`[anytime-memory] runCodeIncremental: failed to resolve HEAD commit`, err);
  }

  const recordedAt = new Date().toISOString();

  // ── 5. 生 TrailGraph を trail.current_graphs から読む ───────────────────────
  // 旧版は analyzeWithProgram で TS 再解析していたが、同じ graph は analyze-child が
  // current_graphs に保存済み。typescript 依存を断つため DB から読む。
  let graph: AstFactInput['graph'] | null = null;
  const graphStmt = db.prepare(
    `SELECT g.graph_json FROM trail.current_graphs g
       JOIN trail.repos r ON r.repo_id = g.repo_id
      WHERE r.repo_name = ?`
  );
  try {
    const row = graphStmt.get(repoName);
    if (row) graph = JSON.parse(row['graph_json'] as string) as AstFactInput['graph'];
  } catch (err) {
    logger.error(
      `[anytime-memory] runCodeIncremental: failed to read/parse current_graphs (repo="${repoName}")`,
      err
    );
  } finally {
    graphStmt.free?.();
  }

  // ── 6. ingestFromTrailGraph ──────────────────────────────────────────────
  try {
    const stats = fromTrailGraph({ db, repoName, recordedAt, logger });
    totals.items_processed += stats.packages_upserted + stats.files_upserted;
    totals.entities_inserted += stats.packages_upserted + stats.files_upserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runCodeIncremental: fromTrailGraph failed`, err);
    hasIngestFailure = true;
  }

  // ── 7. ingestAstFacts ────────────────────────────────────────────────────
  const currentEntityIds = new Set<string>();
  if (graph) {
    try {
      const stats = ingestAstFacts({ db, repoName, graph, commitSha, recordedAt, logger });
      totals.items_processed += stats.facts_inserted;
      totals.entities_inserted += stats.facts_inserted + stats.function_entities_upserted;
      totals.edges_inserted += stats.edges_inserted;
      for (const id of stats.current_entity_ids) currentEntityIds.add(id);
    } catch (err) {
      logger.error(`[anytime-memory] runCodeIncremental: ingestAstFacts failed`, err);
      hasIngestFailure = true;
    }
  } else {
    logger.warn?.(
      `[anytime-memory] runCodeIncremental: current_graphs に TrailGraph が無いため ingestAstFacts をスキップ (repo="${repoName}")`
    );
  }

  // ── 8. ingestDecisionComments（trail.code_decision_comments を読む）─────────
  // decision comment の AST 走査は analyze-child へ移設済み。ここでは抽出済みデータを
  // trail-db から読み memory DB へ ingest するのみ（typescript 非依存）。
  try {
    const cStmt = db.prepare(
      `SELECT c.file_path, c.line, c.comment_text, c.symbol_name
         FROM trail.code_decision_comments c
         JOIN trail.repos r ON r.repo_id = c.repo_id
        WHERE r.repo_name = ?`
    );
    let comments: DecisionCommentItem[] = [];
    try {
      const rows = cStmt.all(repoName) as Array<{
        file_path: string;
        line: number;
        comment_text: string;
        symbol_name: string | null;
      }>;
      comments = rows.map((r) => ({
        filePath: r.file_path,
        line: r.line,
        text: r.comment_text,
        symbolName: r.symbol_name ?? null,
      }));
    } finally {
      cStmt.free?.();
    }
    const stats = ingestDecisionComments({ db, comments, repoName, recordedAt, logger });
    totals.entities_inserted += stats.decisions_inserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runCodeIncremental: ingestDecisionComments failed`, err);
    hasIngestFailure = true;
  }

  // ── 9. extractCommitRationale ────────────────────────────────────────────
  try {
    const stats = extractCommitRationale({
      db,
      repoName,
      sinceCommittedAt: last_processed_at === DEFAULT_SINCE ? null : last_processed_at,
      recordedAt,
      logger,
    });
    totals.entities_inserted += stats.decisions_inserted;
    totals.edges_inserted += stats.edges_inserted;
  } catch (err) {
    logger.error(`[anytime-memory] runCodeIncremental: extractCommitRationale failed`, err);
    hasIngestFailure = true;
  }

  const finalStatus = hasIngestFailure ? 'partial' : 'success';

  // ── 10. UPDATE pipeline_state ────────────────────────────────────────────
  upsertPipelineState(db, { status: 'idle', last_processed_at: graphUpdatedAt });

  // ── 11. finalize pipeline_run ────────────────────────────────────────────
  finalizePipelineRun(db, rId, startedAt, finalStatus, totals);

  return {
    status: finalStatus,
    ...totals,
    duration_ms: Date.now() - startMs,
    current_entity_ids: currentEntityIds,
  };
}
