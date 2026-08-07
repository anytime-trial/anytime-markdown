import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';

import { buildPrReviewSourceRef } from './prReviewMemorySource';

/** PrReviewImporter が memory-core.db に必要とする最小データソース (テストで fake 注入)。 */
export interface PrReviewImporterDataSource {
  /**
   * `memory_reviews.source_hash` を読む (`source_kind='pr_comment'` AND
   * `source_ref=sourceRef`)。行が無ければ null。
   */
  getReviewSourceHash(sourceRef: string): string | null;
}

export interface PrReviewImporterOptions {
  readonly memoryDb: PrReviewImporterDataSource;
}

/**
 * Layer 2 Primary Analyzer: `github_pr_review` を購読し memory-core.db への冪等判定のみ行う。
 *
 * - tier=2 / subscribes=['github_pr_review'] / emits=['pr_review_imported']
 * - 冪等: `memory_reviews.source_hash`（source_kind='pr_comment'）が一致したら
 *   emit を skip（Ingester の再 emit 対策）
 * - 本 analyzer は**永続化しない**。ingestPrReview（memory-core）は bodyHash 一致で即座に
 *   skip する冪等 API のため、ここで先に `findings: []` で ingestPrReview を呼んでしまうと
 *   同じ bodyHash を積んだ 2 度目の呼び出し（PrReviewFindingAnalyzer 側）が必ず skip 経路に
 *   入り、findings を一切書き込めなくなる（実測: memory-core の
 *   `__tests__/ingest/pr-review/prReview.test.ts` が単発呼び出しのみを契約として固定して
 *   いる）。そのため review 本文・コメント一式を `pr_review_imported` のペイロードへ積んで
 *   emit し、実際の永続化（review + findings 同時書込）は PrReviewFindingAnalyzer に一本化
 *   する。
 * - repo_name は GitHub の 'owner/name' のうち name 部分を使い、`source_ref`
 *   （`${repoName}#pr${prNumber}#${reviewId}`）を組み立てて照合する。
 *
 * event は Wave 1 で tier-1 ingester から配信される。LepOrchestrator は tier-1 の event を
 * tier-2 の onRunStart **より前に** subscriber へ届けるため、カウンタのリセットを onRunStart で
 * 行うと Wave 1 の集計が消える。よってリセットは onRunEnd の末尾 (ログ出力後) で行い、
 * 次 run の Wave 1 から 0 起算にする。
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
      const repoName = e.repo.includes('/') ? (e.repo.split('/').pop() ?? e.repo) : e.repo;
      const sourceRef = buildPrReviewSourceRef(repoName, e.prNumber, e.reviewId);
      const existing = this.opts.memoryDb.getReviewSourceHash(sourceRef);
      if (existing !== null && existing === e.bodyHash) {
        this.skipped += 1;
        return; // 未変更 → 冪等 skip (finding 再抽出も走らない)
      }

      this.imported += 1;
      await ctx.bus.publish({
        kind: 'pr_review_imported',
        repo: e.repo,
        prNumber: e.prNumber,
        reviewId: e.reviewId,
        commentCount: e.comments.length,
        author: e.author,
        state: e.state,
        submittedAt: e.submittedAt,
        body: e.body,
        bodyHash: e.bodyHash,
        comments: e.comments,
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
