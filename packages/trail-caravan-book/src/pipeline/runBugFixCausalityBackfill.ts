import type { CaravanDbConnection } from '../db/connection/types';
import { extractCommitBody } from '../ingest/bug-history/extractCommitBody';
import { relinkNullRootCauseEpisodes } from '../ingest/bug-history/linkRootCauseEpisode';
import { inferIntroducedBy } from '../ingest/bug-history/inferIntroducedBy';
import { entityId } from '../canonical/entityId';
import { noopLogger, type CaravanLogger } from '../logger';

const PROGRESS_LOG_INTERVAL = 100;

export interface BugFixCausalityBackfillResult {
  status: 'success' | 'partial';
  body_filled: number;
  episodes_relinked: number;
  introduced_attempted: number;
  introduced_inferred: number;
  failures: number;
  duration_ms: number;
}

/**
 * `caravan_bug_fixes` の因果 3 列（body_excerpt / root_cause_episode_id /
 * introduced_commit_sha）を既存行へ充填する operator 駆動バックフィル
 * （spec memory-core §6.7。常駐パイプラインには組み込まない）。
 *
 * 冪等: 各列とも「未充填の行」だけを対象にするため、再実行は 0 件更新に収束する。
 * 前提: activity.db が `trail` として ATTACH 済みであること。
 */
export function runBugFixCausalityBackfill(opts: {
  db: CaravanDbConnection;
  repoName: string;
  /** introduced_commit_sha 推定（git diff/blame）に使うリポジトリ実体のルート */
  repoRoot: string;
  /** false で SZZ 推定をスキップする（git が無い環境・時間短縮用） */
  inferIntroduced?: boolean;
  /** 1 回の実行で SZZ 推定を試みる最大行数（既定: 無制限） */
  introducedLimit?: number;
  logger?: CaravanLogger;
}): BugFixCausalityBackfillResult {
  const { db, repoName, repoRoot } = opts;
  const logger = opts.logger ?? noopLogger;
  const startMs = Date.now();
  let failures = 0;

  // ── 1. body_excerpt: attach 済み activity.db のコミット本文から充填 ──────
  let bodyFilled = 0;
  const bodyRows = db.exec(
    `SELECT bf.id, sc.commit_message
       FROM caravan_bug_fixes bf
       JOIN trail.activity_session_commits sc ON sc.commit_hash = bf.commit_sha
       JOIN trail.activity_repos r ON r.repo_id = sc.repo_id
      WHERE bf.workspace = ? AND r.repo_name = ? AND bf.body_excerpt = ''`,
    [repoName, repoName],
  );
  for (const row of bodyRows[0]?.values ?? []) {
    const id = row[0] as string;
    const message = row[1] as string;
    try {
      const body = extractCommitBody(message);
      if (body === '') continue; // 本文なしコミットは未充填のまま（'' は「無い」を意味する）
      db.run(`UPDATE caravan_bug_fixes SET body_excerpt = ? WHERE id = ? AND body_excerpt = ''`, [body, id]);
      bodyFilled += db.getRowsModified();
    } catch (err) {
      failures += 1;
      logger.error(`[anytime-memory] causality backfill: body_excerpt failed for id=${id}`, err);
    }
  }

  // ── 2. root_cause_episode_id: 再リンク ──────────────────────────────────
  const episodesRelinked = relinkNullRootCauseEpisodes(db, { workspace: repoName, logger });

  // ── 3. introduced_commit_sha: SZZ 簡易推定の再実行 ──────────────────────
  let introducedAttempted = 0;
  let introducedInferred = 0;
  if (opts.inferIntroduced !== false) {
    const limit = opts.introducedLimit ?? Number.MAX_SAFE_INTEGER;
    const targetRows = db.exec(
      `SELECT id, commit_sha, affected_file_paths_json, committed_at
         FROM caravan_bug_fixes
        WHERE workspace = ? AND introduced_commit_sha IS NULL
        ORDER BY committed_at DESC`,
      [repoName],
    );
    for (const row of targetRows[0]?.values ?? []) {
      if (introducedAttempted >= limit) break;
      const id = row[0] as string;
      const commitSha = row[1] as string;
      const committedAt = row[3] as string;
      let filePaths: string[] = [];
      try {
        const parsed: unknown = JSON.parse((row[2] as string) || '[]');
        if (Array.isArray(parsed)) filePaths = parsed.filter((p): p is string => typeof p === 'string');
      } catch (err) {
        logger.error(`[anytime-memory] causality backfill: broken affected_file_paths_json id=${id}`, err);
      }
      if (filePaths.length === 0) continue; // 変更ファイル不明の行は推定不能
      introducedAttempted += 1;
      if (introducedAttempted % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(
          `[anytime-memory] causality backfill: introduced inference ${introducedAttempted} attempted ` +
            `(${introducedInferred} inferred)`,
        );
      }
      try {
        const result = inferIntroducedBy({
          db,
          bugEntityId: entityId('Bug', commitSha),
          fixCommitSha: commitSha,
          affectedFilePaths: filePaths,
          repoRoot,
          recordedAt: new Date().toISOString(),
          valid_from: committedAt,
          logger,
        });
        if (result.introduced_commit_sha !== null) {
          db.run(
            `UPDATE caravan_bug_fixes SET introduced_commit_sha = ? WHERE id = ? AND introduced_commit_sha IS NULL`,
            [result.introduced_commit_sha, id],
          );
          introducedInferred += db.getRowsModified();
        }
      } catch (err) {
        failures += 1;
        logger.error(`[anytime-memory] causality backfill: introduced inference failed for id=${id}`, err);
      }
    }
  }

  return {
    status: failures > 0 ? 'partial' : 'success',
    body_filled: bodyFilled,
    episodes_relinked: episodesRelinked,
    introduced_attempted: introducedAttempted,
    introduced_inferred: introducedInferred,
    failures,
    duration_ms: Date.now() - startMs,
  };
}
