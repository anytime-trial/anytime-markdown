import { execFileSync } from 'node:child_process';
import { resolveGitExecutable } from '@anytime-markdown/trail-activity/gitExecutable';
import type { CaravanDbConnection } from '../db/connection/types';
import { describeError, PipelineRunLedger } from './PipelineRunLedger';
import { fromTrailGraph } from '../ingest/code/fromTrailGraph';
import { ingestAstFacts, type AstFactInput } from '../ingest/code/astFunctionLevel';
import { ingestDecisionComments, type DecisionCommentItem } from '../ingest/code/extractComments';
import { extractCommitRationale } from '../ingest/code/extractCommitRationale';
import { noopLogger, type CaravanLogger } from '../logger';
// typescript / analyzeWithProgram への依存は撤去。code graph は trail-db の activity_current_graphs、
// decision comment は trail-db の activity_code_decision_comments（analyze-child が永続化）から読む。

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

function readPipelineState(db: CaravanDbConnection): { last_processed_at: string } {
  const stmt = db.prepare(
    `SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?`
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
  db: CaravanDbConnection,
  opts: { status: string; last_processed_at?: string; error_detail?: string }
): void {
  const { status, last_processed_at, error_detail } = opts;
  db.run(
    `INSERT INTO caravan_pipeline_state
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


/**
 * Incremental pipeline that reads `trail.activity_current_code_graphs` and runs the
 * code ingest pipeline (fromTrailGraph, ingestAstFacts, ingestDecisionComments,
 * extractCommitRationale) when the graph has been updated since the last run.
 *
 * typescript には依存しない。生 TrailGraph は `trail.activity_current_graphs` から、decision
 * comment は `trail.activity_code_decision_comments`（analyze-child が永続化）から読む。
 *
 * The trail DB must already be ATTACHed as "trail" on `db`.
 */
export async function runCodeIncremental(opts: {
  db: CaravanDbConnection;
  repoName: string;
  tsconfigPath: string;
  gitRoot: string;
  logger?: CaravanLogger;
}): Promise<CodeIncrementalResult> {
  // tsconfigPath は opts に残すが本処理では未使用（TS 再解析を撤去したため）。
  const { db, repoName, gitRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── 1. Read last_processed_at ────────────────────────────────────────────
  const { last_processed_at } = readPipelineState(db);

  // ── 2. Read activity_current_code_graphs.updated_at ───────────────────────────────
  let graphUpdatedAt: string | null = null;
  // Phase H-3: trail.activity_current_code_graphs から repo_name 列を撤去した。attach 済 trail スキーマの
  // repos を JOIN して repo_name → repo_id を解決し、repo_id で絞る (クロス DB JOIN)。
  const stmt = db.prepare(
    `SELECT g.updated_at FROM trail.activity_current_code_graphs g
       JOIN trail.activity_repos r ON r.repo_id = g.repo_id
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
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);
  upsertPipelineState(db, { status: 'running' });

  const totals = { items_processed: 0, entities_inserted: 0, edges_inserted: 0 };
  let hasIngestFailure = false;
  // 失敗理由を run 行の error_detail へ残すため蓄積する。旧実装は boolean だけを
  // 持っており、partial の理由がどこにも残らなかった。
  const failureDetails: string[] = [];

  // ── 4. git rev-parse HEAD ────────────────────────────────────────────────
  let commitSha: string | null = null;
  try {
    commitSha = execFileSync(resolveGitExecutable(), ['rev-parse', 'HEAD'], { cwd: gitRoot, encoding: 'utf8' }).trim();
  } catch (err) {
    logger.error(`[anytime-memory] runCodeIncremental: failed to resolve HEAD commit`, err);
  }

  const recordedAt = new Date().toISOString();

  // ── 5. 生 TrailGraph を trail.activity_current_graphs から読む ───────────────────────
  // 旧版は analyzeWithProgram で TS 再解析していたが、同じ graph は analyze-child が
  // activity_current_graphs に保存済み。typescript 依存を断つため DB から読む。
  let graph: AstFactInput['graph'] | null = null;
  const graphStmt = db.prepare(
    `SELECT g.graph_json FROM trail.activity_current_graphs g
       JOIN trail.activity_repos r ON r.repo_id = g.repo_id
      WHERE r.repo_name = ?`
  );
  try {
    const row = graphStmt.get(repoName);
    if (row) graph = JSON.parse(row['graph_json'] as string) as AstFactInput['graph'];
  } catch (err) {
    logger.error(
      `[anytime-memory] runCodeIncremental: failed to read/parse activity_current_graphs (repo="${repoName}")`,
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
    failureDetails.push(`fromTrailGraph: ${describeError(err)}`);
    hasIngestFailure = true;
  }

  // ── 7. ingestAstFacts ────────────────────────────────────────────────────
  //
  // 完走したかを `astFactsRan` で持つ。ウォーターマークの前進条件（10.）がこれに依存する:
  // ここが走らない run で前進させると、migration 025 / 029 のようにウォーターマークの
  // 巻き戻しを再取込のトリガとして使うバックフィルが、再取込されないまま焼き切れる。
  const currentEntityIds = new Set<string>();
  let astFactsRan = false;
  if (graph) {
    try {
      const stats = ingestAstFacts({ db, repoName, graph, commitSha, recordedAt, logger });
      totals.items_processed += stats.facts_inserted;
      totals.entities_inserted += stats.facts_inserted + stats.function_entities_upserted;
      totals.edges_inserted += stats.edges_inserted;
      for (const id of stats.current_entity_ids) currentEntityIds.add(id);
      astFactsRan = true;
    } catch (err) {
      logger.error(`[anytime-memory] runCodeIncremental: ingestAstFacts failed`, err);
      failureDetails.push(`ingestAstFacts: ${describeError(err)}`);
      hasIngestFailure = true;
    }
  } else {
    // スキップではなく失敗として扱う。スキップ判定（3.）が読む activity_current_code_graphs と
    // 実データの activity_current_graphs は別テーブルで、前者に行があり後者が空・破損という
    // ズレが起こり得る。warn で流すと「取込ゼロなのに success」になり、ウォーターマークだけが
    // 進む。
    logger.error(
      `[anytime-memory] runCodeIncremental: activity_current_graphs に TrailGraph が無い ` +
        `(repo="${repoName}") — ingestAstFacts を実行できずウォーターマークを進めない`,
      new Error('missing TrailGraph in activity_current_graphs')
    );
    failureDetails.push('ingestAstFacts: activity_current_graphs に TrailGraph が無い');
    hasIngestFailure = true;
  }

  // ── 8. ingestDecisionComments（trail.activity_code_decision_comments を読む）─────────
  // decision comment の AST 走査は analyze-child へ移設済み。ここでは抽出済みデータを
  // trail-db から読み caravan-book DB へ ingest するのみ（typescript 非依存）。
  try {
    const cStmt = db.prepare(
      `SELECT c.file_path, c.line, c.comment_text, c.symbol_name
         FROM trail.activity_code_decision_comments c
         JOIN trail.activity_repos r ON r.repo_id = c.repo_id
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
  //
  // ウォーターマークは ingestAstFacts が完走した run でのみ前進させる。`last_processed_at`
  // を省くと upsertPipelineState は既存値を据え置くので、次サイクルが同じ graph を再取込する。
  const advanceWatermark = astFactsRan && !hasIngestFailure;
  if (!advanceWatermark) {
    logger.warn?.(
      `[anytime-memory] runCodeIncremental: 取込が完走しなかったためウォーターマークを据え置く ` +
        `(repo="${repoName}", astFactsRan=${astFactsRan})`
    );
  }
  upsertPipelineState(db, {
    status: 'idle',
    last_processed_at: advanceWatermark ? graphUpdatedAt : undefined,
  });

  // ── 11. finalize pipeline_run ────────────────────────────────────────────
  ledger.finish(finalStatus, totals, failureDetails.join('\n'));

  return {
    status: finalStatus,
    ...totals,
    duration_ms: Date.now() - startMs,
    current_entity_ids: currentEntityIds,
  };
}
