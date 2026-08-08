/**
 * 既存のレビュー記録へワークスペース／対象リポジトリを遡って埋めるバックフィル。
 *
 * 解決ロジックそのものは増分パイプラインと同じ `resolveReviewTargets` を呼ぶ。
 * ここが持つのは「本番 DB を触る手順の安全弁」だけ:
 *
 * - **既定は dry-run**。実書き込みは `apply: true` を明示したときだけ。
 * - **`addressed_*` は不変**。既にリンク済みの指摘には触れない。
 * - 実行前後の件数を返し、呼び出し側が差分を報告できるようにする。
 *
 * バックアップの取得は呼び出し側（運用手順）の責務とする。ここで自動的に
 * ファイル操作をしないのは、「自動実行される機構に破壊的操作を組み込まない」
 * （事故防止機構が事故そのものになる）という規約に従うため。
 */
import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';
import { resolveReviewTargets, type ResolveReviewTargetsResult } from '../ingest/review/resolveReviewTargets';
import { linkAddresses } from '../ingest/review/linkAddresses';

export interface ReviewTargetStats {
  readonly reviews: number;
  readonly reviewsWithWorkspace: number;
  readonly findings: number;
  readonly findingsWithPath: number;
  readonly findingsWithTargetRepo: number;
  readonly findingsAddressed: number;
}

export interface BackfillReviewTargetsResult {
  readonly applied: boolean;
  readonly before: ReviewTargetStats;
  readonly after: ReviewTargetStats;
  readonly resolve: ResolveReviewTargetsResult | null;
  readonly linkedFindings: number;
  readonly linkedEdges: number;
}

function count(db: MemoryDbConnection, sql: string): number {
  const result = db.exec(sql);
  return Number(result[0]?.values?.[0]?.[0] ?? 0);
}

export function collectReviewTargetStats(db: MemoryDbConnection): ReviewTargetStats {
  return {
    reviews: count(db, `SELECT COUNT(*) FROM memory_reviews`),
    reviewsWithWorkspace: count(db, `SELECT COUNT(*) FROM memory_reviews WHERE workspace != ''`),
    findings: count(db, `SELECT COUNT(*) FROM memory_review_findings`),
    findingsWithPath: count(
      db,
      `SELECT COUNT(*) FROM memory_review_findings WHERE target_file_path IS NOT NULL AND target_file_path != ''`,
    ),
    findingsWithTargetRepo: count(
      db,
      `SELECT COUNT(*) FROM memory_review_findings WHERE target_repo IS NOT NULL`,
    ),
    findingsAddressed: count(
      db,
      `SELECT COUNT(*) FROM memory_review_findings WHERE addressed_commit_sha IS NOT NULL`,
    ),
  };
}

export function backfillReviewTargets(input: {
  db: MemoryDbConnection;
  /** true のときだけ実際に書き込む。既定は dry-run（統計のみ）。 */
  apply?: boolean;
  /** 解決後に linkAddresses を再実行するか。既定 true。 */
  relink?: boolean;
  windowDays?: number;
  logger: MemoryLogger;
}): BackfillReviewTargetsResult {
  const { db, apply = false, relink = true, windowDays = 30, logger } = input;

  const before = collectReviewTargetStats(db);

  if (!apply) {
    logger.info(
      `[anytime-memory] backfillReviewTargets: dry-run ` +
        `reviews=${before.reviews} workspace=${before.reviewsWithWorkspace} ` +
        `findings=${before.findings} path=${before.findingsWithPath} ` +
        `targetRepo=${before.findingsWithTargetRepo} addressed=${before.findingsAddressed}`,
    );
    return { applied: false, before, after: before, resolve: null, linkedFindings: 0, linkedEdges: 0 };
  }

  const resolve = resolveReviewTargets({ db, logger });

  let linkedFindings = 0;
  let linkedEdges = 0;
  if (relink) {
    // addressed_at が NULL の行だけを対象にする挙動は linkAddresses 側が持つ。
    // 既存のリンク済み 28 件は上書きされない。
    const linkResult = linkAddresses({
      db,
      windowDays,
      logger: { warn: (msg: string) => logger.info(msg) },
    });
    linkedFindings = linkResult.findings_linked;
    linkedEdges = linkResult.edges_inserted;
  }

  const after = collectReviewTargetStats(db);

  logger.info(
    `[anytime-memory] backfillReviewTargets: applied ` +
      `workspacesFilled=${resolve.workspacesFilled} targetsResolved=${resolve.targetsResolved} ` +
      `pathsNormalized=${resolve.pathsNormalized} pathsRejected=${resolve.pathsRejected} ` +
      `failures=${resolve.failures} linkedFindings=${linkedFindings} ` +
      `addressed=${before.findingsAddressed}→${after.findingsAddressed}`,
  );

  return { applied: true, before, after, resolve, linkedFindings, linkedEdges };
}
