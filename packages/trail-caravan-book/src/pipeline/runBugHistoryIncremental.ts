import type { CaravanDbConnection } from '../db/connection/types';
import { describeError, PipelineRunLedger } from './PipelineRunLedger';
import { parseFixCommit } from '../ingest/bug-history/parseFixCommit';
import { buildBugEntity } from '../ingest/bug-history/buildBugEntity';
import { linkAffectedFiles } from '../ingest/bug-history/linkAffectedFiles';
import { inferIntroducedBy } from '../ingest/bug-history/inferIntroducedBy';
import { linkRootCauseEpisode, relinkNullRootCauseEpisodes } from '../ingest/bug-history/linkRootCauseEpisode';
import { extractCommitBody } from '../ingest/bug-history/extractCommitBody';
import { upsertBugEntity, upsertCommitEntity, upsertBugFix, insertFixesEdge } from '../ingest/bug-history/persist';
import { entityId } from '../canonical/entityId';
import { noopLogger, type CaravanLogger } from '../logger';

const SCOPE = 'bug_history_incremental';
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z';
const MAX_CONSECUTIVE_FAILURES = 5;
const PROGRESS_LOG_INTERVAL = 50;
/**
 * 同期 commit 処理を何件ごとに event loop へ yield するか。
 * 大量 commit を同期で回し続けると daemon のイベントループがブロックされ、
 * SIGTERM/disconnect ハンドラが走れず Extension Host 終了時に child が孤児化する。
 * 一定間隔で yield して graceful shutdown ハンドラが割り込めるようにする。
 */
const YIELD_INTERVAL = 100;

export interface BugHistoryIncrementalResult {
  status: 'success' | 'partial' | 'error';
  items_processed: number;
  bugs_inserted: number;
  edges_inserted: number;
  duration_ms: number;
}

function readPipelineState(db: CaravanDbConnection): string {
  const stmt = db.prepare(`SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = ?`);
  try {
    const row = stmt.get(SCOPE);
    if (row) return (row['last_processed_at'] as string) || DEFAULT_SINCE;
    return DEFAULT_SINCE;
  } finally {
    stmt.free?.();
  }
}

function upsertPipelineState(
  db: CaravanDbConnection,
  opts: { status: string; last_processed_at?: string; error_detail?: string }
): void {
  db.run(
    `INSERT INTO caravan_pipeline_state (scope, status, last_processed_at, error_detail)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       status            = excluded.status,
       last_processed_at = CASE
         WHEN excluded.last_processed_at = '' THEN last_processed_at
         ELSE excluded.last_processed_at
       END,
       error_detail = excluded.error_detail`,
    [SCOPE, opts.status, opts.last_processed_at ?? '', opts.error_detail ?? '']
  );
}

function recordFailedItem(db: CaravanDbConnection, itemKey: string, reason: string, detail: string): void {
  db.run(
    `INSERT INTO caravan_failed_items (scope, item_key, failed_at, reason, detail, attempt_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(scope, item_key) DO UPDATE SET
       attempt_count = attempt_count + 1,
       failed_at     = excluded.failed_at,
       detail        = excluded.detail`,
    [SCOPE, itemKey, new Date().toISOString(), reason, detail]
  );
}

interface CommitRow {
  commit_hash: string;
  commit_message: string;
  committed_at: string;
  repo_name: string;
  session_id: string | null;
}

/**
 * `caravan_bug_fixes.workspace` が空（列追加前に取り込まれた行）を、activity.db 側の
 * コミット所属リポジトリから埋める。
 *
 * 既に埋まっている行は触らない（`WHERE workspace = ''`）ので、毎回走らせても
 * 実質 1 度きりで、以降は 0 件更新になる。失敗しても取込本体は続ける
 * （選択肢の欠けは表示の劣化であって、取込を止める理由にならない）。
 */
export function backfillBugFixWorkspace(db: CaravanDbConnection, repoName: string, logger: CaravanLogger): void {
  try {
    db.run(
      `UPDATE caravan_bug_fixes
         SET workspace = ?
       WHERE workspace = ''
         AND commit_sha IN (
           SELECT sc.commit_hash
           FROM trail.activity_session_commits sc
           JOIN trail.activity_repos r ON r.repo_id = sc.repo_id
           WHERE r.repo_name = ?
         )`,
      [repoName, repoName],
    );
  } catch (err) {
    logger.error(
      `[anytime-memory] backfillBugFixWorkspace failed for repo=${repoName}: ${String(err)}, ` +
        `Stack: ${err instanceof Error ? err.stack : ''}`,
    );
  }
}

/**
 * last_processed_at より新しい fix コミットを読む。
 *
 * Phase H-4: trail.activity_session_commits から repo_name 列を撤去した。attach 済 trail スキーマの repos を
 * JOIN して repo_name → repo_id を解決し、repo フィルタ・射影とも repos.repo_name で行う (クロス DB JOIN)。
 */
function readFixCommits(
  db: CaravanDbConnection,
  repoName: string,
  lastProcessedAt: string,
): CommitRow[] {
  const rows: CommitRow[] = [];
  const stmt = db.prepare(
    `SELECT sc.commit_hash, sc.commit_message, sc.committed_at, r.repo_name, sc.session_id
     FROM trail.activity_session_commits sc
     JOIN trail.activity_repos r ON r.repo_id = sc.repo_id
     WHERE r.repo_name = ? AND sc.committed_at > ? AND sc.commit_message LIKE 'fix%'
     ORDER BY sc.committed_at`
  );
  for (const r of stmt.iterate(repoName, lastProcessedAt)) {
    rows.push({
      commit_hash: String(r['commit_hash'] ?? ''),
      commit_message: String(r['commit_message'] ?? ''),
      committed_at: String(r['committed_at'] ?? ''),
      repo_name: String(r['repo_name'] ?? repoName),
      session_id: r['session_id'] == null ? null : String(r['session_id']),
    });
  }
  stmt.free?.();
  return rows;
}

/** 取込の進行状態。ループ制御（quarantine 判定・カーソル前進）と集計を 1 つに束ねる。 */
type BugHistoryState = {
  totals: { items_processed: number; entities_inserted: number; edges_inserted: number };
  bugsInserted: number;
  consecutiveFailures: number;
  maxCommittedAt: string;
  hasPartialFailure: boolean;
  /** 失敗理由を run 行の error_detail へ残すため蓄積する。 */
  failureDetails: string[];
};

/**
 * fix コミット 1 件を取り込む。
 * 失敗は failed_items へ記録して連続失敗数を進め、成功で 0 へ戻す（quarantine 判定の入力）。
 */
function ingestFixCommit(args: {
  db: CaravanDbConnection;
  row: CommitRow;
  repo: { name: string; root: string };
  state: BugHistoryState;
  logger: CaravanLogger;
}): void {
  const { db, row, repo, state, logger } = args;
  const { totals } = state;

  const subject = row.commit_message.split('\n')[0] ?? '';
  const parsed = parseFixCommit({ subject });
  if (parsed === null) {
    // Pre-filter (LIKE 'fix%') may include non-fix commits (e.g. 'fixup:')
    return;
  }

  const recordedAt = new Date().toISOString();
  const commitSha = row.commit_hash;
  const committedAt = row.committed_at;
  const sessionId = row.session_id;
  const bugEntityId = entityId('Bug', commitSha);
  const bugFixId = entityId('BugFix', commitSha);

  try {
    // a. Pre-insert Bug entity with preliminary data so FK constraints pass for affects edges
    const prelimBugEntity = buildBugEntity({
      commitSha, parsed, committedAt,
      affectedFilePaths: [],
      introducedCommitSha: null,
      recordedAt,
    });
    upsertBugEntity(db, prelimBugEntity);

    // b. Upsert Commit entity (needed before fixes edge)
    const commitId = upsertCommitEntity(db, { commitSha, recordedAt });

    // c. Insert fixes edge: Commit → Bug
    const fixesInserted = insertFixesEdge(db, {
      commitId, bugEntityId, commitSha, validFrom: committedAt, recordedAt,
    });

    // d. Link affected files (Bug entity now exists for FK)
    const affectedResult = linkAffectedFiles({
      db, bugEntityId, commitSha, repoName: repo.name, recordedAt, valid_from: committedAt, logger,
    });
    totals.edges_inserted += affectedResult.edges_inserted;

    // e. Infer introduced_by
    const introResult = inferIntroducedBy({
      db,
      bugEntityId,
      fixCommitSha: commitSha,
      affectedFilePaths: affectedResult.file_paths,
      repoRoot: repo.root,
      recordedAt,
      valid_from: committedAt,
      logger,
    });
    totals.edges_inserted += introResult.edges_inserted;

    // f. Replace Bug entity with final data (file paths + introduced commit now known)
    const finalBugEntity = buildBugEntity({
      commitSha, parsed, committedAt,
      affectedFilePaths: affectedResult.file_paths,
      introducedCommitSha: introResult.introduced_commit_sha,
      recordedAt,
    });
    upsertBugEntity(db, finalBugEntity);
    totals.entities_inserted += 2; // Bug + Commit
    state.bugsInserted += 1;
    if (fixesInserted) totals.edges_inserted += 1;

    // g. Upsert caravan_bug_fixes
    upsertBugFix(db, {
      id: bugFixId,
      commitSha,
      bugEntityId,
      pkg: parsed.package,
      category: parsed.category,
      subjectSummary: parsed.subject_summary,
      affectedFilePaths: affectedResult.file_paths,
      committedAt,
      recordedAt,
      sessionId,
      introducedCommitSha: introResult.introduced_commit_sha,
      bodyExcerpt: extractCommitBody(row.commit_message),
      workspace: row.repo_name,
    });

    // h. Link root cause episode
    linkRootCauseEpisode({ db, bugFixId, sessionId, committedAt, logger });

    totals.items_processed += 1;
    if (committedAt > state.maxCommittedAt) state.maxCommittedAt = committedAt;
    state.consecutiveFailures = 0;
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.error(
      `[anytime-memory] runBugHistoryIncremental: failed to process commit=${commitSha}`, err
    );
    recordFailedItem(db, commitSha, 'process_failed', detail);
    state.failureDetails.push(`commit=${commitSha}: ${detail}`);
    state.consecutiveFailures += 1;
    state.hasPartialFailure = true;
  }
}

export async function runBugHistoryIncremental(opts: {
  db: CaravanDbConnection;
  repoName: string;
  repoRoot: string;
  logger?: CaravanLogger;
}): Promise<BugHistoryIncrementalResult> {
  const { db, repoName, repoRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // ── 0. workspace 列の backfill ───────────────────────────────────────────
  // 020_workspace_scope.sql で足した列を既存行へ埋める。増分取込は last_processed_at より
  // 新しいコミットしか見ないため、ここで埋めないと過去分（実測 1,361 件）は永久に未解決の
  // ままになり、Flight Record でどのワークスペースを選んでも Bug Fixed が 0 件になる。
  // 埋めるのはこの repo のコミットに紐づく行だけ（他リポジトリの行には触らない）。
  backfillBugFixWorkspace(db, repoName, logger);

  // ── 0.5 root_cause_episode の再リンク ────────────────────────────────────
  // episode は bug_history より後から取込まれることが常態のため、新規コミットが
  // 無い実行でも毎回リンクを試みる（冪等・0 件更新に収束する。spec §6.7）。
  const relinked = relinkNullRootCauseEpisodes(db, { workspace: repoName, logger });
  if (relinked > 0) {
    logger.info(`[anytime-memory] bug history incremental: relinked root_cause_episode for ${relinked} rows`);
  }

  // ── 1. Read last_processed_at ────────────────────────────────────────────
  const lastProcessedAt = readPipelineState(db);

  // ── 2. Query fix commits from trail DB ─────────────────────────────────
  const rows = readFixCommits(db, repoName, lastProcessedAt);

  if (rows.length === 0) {
    return { status: 'success', items_processed: 0, bugs_inserted: 0, edges_inserted: 0, duration_ms: 0 };
  }

  // ── 3. Insert pipeline_run (running) ─────────────────────────────────────
  const ledger = new PipelineRunLedger({ db, scope: SCOPE, wave: 'memory', tier: 3, logger });
  ledger.start(startedAt);
  upsertPipelineState(db, { status: 'running' });

  const state: BugHistoryState = {
    totals: { items_processed: 0, entities_inserted: 0, edges_inserted: 0 },
    bugsInserted: 0,
    consecutiveFailures: 0,
    maxCommittedAt: lastProcessedAt,
    hasPartialFailure: false,
    failureDetails: [],
  };

  // ── 4. Process each commit ────────────────────────────────────────────────
  logger.info(`[anytime-memory] bug history incremental: ${rows.length} fix commits to process`);
  let commitProcessed = 0;
  for (const row of rows) {
    commitProcessed += 1;
    if (commitProcessed % PROGRESS_LOG_INTERVAL === 0) {
      logger.info(
        `[anytime-memory] bug history incremental progress: ${commitProcessed}/${rows.length} ` +
          `(bugs_inserted=${state.bugsInserted})`
      );
    }
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.info(`[anytime-memory] runBugHistoryIncremental: quarantine threshold reached`);
      state.failureDetails.push(`quarantine threshold reached after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      state.hasPartialFailure = true;
      break;
    }

    // 孤児化対策: 一定間隔で event loop に yield し、daemon の SIGTERM/disconnect
    // ハンドラが同期スイープの隙間で割り込めるようにする (graceful shutdown 成立)。
    if (commitProcessed % YIELD_INTERVAL === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    ingestFixCommit({ db, row, repo: { name: repoName, root: repoRoot }, state, logger });
  }

  const finalStatus = state.hasPartialFailure ? 'partial' : 'success';

  // ── 5. Update pipeline_state ─────────────────────────────────────────────
  upsertPipelineState(db, { status: 'idle', last_processed_at: state.maxCommittedAt });

  // ── 6. Finalize pipeline_run ─────────────────────────────────────────────
  ledger.finish(finalStatus, state.totals, state.failureDetails.join('\n'));

  return {
    status: finalStatus,
    items_processed: state.totals.items_processed,
    bugs_inserted: state.bugsInserted,
    edges_inserted: state.totals.edges_inserted,
    duration_ms: Date.now() - startMs,
  };
}
