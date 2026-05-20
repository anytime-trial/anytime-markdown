import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { PrReviewUpsert } from '@anytime-markdown/trail-db';

/** PrReviewImporter が trail.db に必要とする最小データソース (テストで fake 注入)。 */
export interface PrReviewImporterDataSource {
  getPrReviewBodyHash(reviewId: string): string | null;
  upsertPrReview(review: PrReviewUpsert): void;
}

export interface PrReviewImporterOptions {
  readonly trailDb: PrReviewImporterDataSource;
}

/**
 * Layer 2 Primary Analyzer: `github_pr_review` を購読し pr_reviews / pr_review_comments へ取込む。
 *
 * - tier=2 / subscribes=['github_pr_review'] / emits=['pr_review_imported']
 * - 冪等: 既存 review の body_hash が一致したら upsert / emit を skip (Ingester の再 emit 対策)
 * - 取込んだら `pr_review_imported` を emit し、PrReviewFindingAnalyzer の発火契機にする
 * - repo_name は GitHub の 'owner/name' のうち name 部分を保存し session_commits.repo_name
 *   (basename) と突合可能にする
 *
 * event は Wave 1 で tier-1 ingester から配信される。LepOrchestrator は tier-1 の event を
 * tier-2 の onRunStart **より前に** subscriber へ届けるため、カウンタのリセットを onRunStart で
 * 行うと Wave 1 の集計が消える。よってリセットは onRunEnd の末尾 (ログ出力後) で行い、
 * 次 run の Wave 1 から 0 起算にする。書込は onEvent 内で行い PersistAnalyzer が Wave 2 末で save する。
 */
export class PrReviewImporter implements Analyzer {
  readonly id = 'PrReviewImporter';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['github_pr_review'];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['pr_review_imported'];

  private imported = 0;
  private skipped = 0;

  constructor(private readonly opts: PrReviewImporterOptions) {}

  getCounters(): { imported: number; skipped: number } {
    return { imported: this.imported, skipped: this.skipped };
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'github_pr_review') return;

    try {
      const existing = this.opts.trailDb.getPrReviewBodyHash(e.reviewId);
      if (existing !== null && existing === e.bodyHash) {
        this.skipped += 1;
        return; // 未変更 → 冪等 skip (finding 再抽出も走らない)
      }

      const repoName = e.repo.includes('/') ? (e.repo.split('/').pop() ?? e.repo) : e.repo;
      this.opts.trailDb.upsertPrReview({
        reviewId: e.reviewId,
        repoName,
        prNumber: e.prNumber,
        author: e.author,
        state: e.state,
        submittedAt: e.submittedAt,
        body: e.body,
        bodyHash: e.bodyHash,
        comments: e.comments.map((c) => ({ path: c.path, line: c.line, body: c.body })),
      });
      this.imported += 1;

      await ctx.bus.publish({
        kind: 'pr_review_imported',
        repo: e.repo,
        prNumber: e.prNumber,
        reviewId: e.reviewId,
        commentCount: e.comments.length,
      });
    } catch (err) {
      ctx.logger.error(
        `[PrReviewImporter] failed for review ${e.reviewId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    ctx.logger.info(
      `[PrReviewImporter] done (imported=${this.imported}, skipped=${this.skipped})`,
    );
    // 次 run のために 0 起算に戻す (Wave 1 で増えたカウンタはここで初めてリセットする)
    this.imported = 0;
    this.skipped = 0;
  }
}
