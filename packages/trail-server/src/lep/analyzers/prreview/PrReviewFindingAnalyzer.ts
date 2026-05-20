import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { PrReviewDetail, PrReviewFindingRow } from '@anytime-markdown/trail-db';

import {
  extractPrReviewFindings,
  type PrReviewFindingClassifier,
} from './extractPrReviewFindings';

/** PrReviewFindingAnalyzer が trail.db に必要とする最小データソース (テストで fake 注入)。 */
export interface PrReviewFindingDataSource {
  getPrReviewDetail(reviewId: string): PrReviewDetail | null;
  replacePrReviewFindings(reviewId: string, findings: readonly PrReviewFindingRow[]): void;
}

export interface PrReviewFindingAnalyzerOptions {
  readonly trailDb: PrReviewFindingDataSource;
  /**
   * severity / category 分類フック (LLM 等)。任意。未指定なら raw コメントのみ保存し分類は skip。
   * これにより Ollama 不在環境でも finding 抽出は機能する (lep-step4 プラン §6.3.2 の「LLM 任意」)。
   */
  readonly classify?: PrReviewFindingClassifier;
  /** created_at の注入口 (テスト用)。省略時は `new Date()`。 */
  readonly now?: () => Date;
}

/**
 * `pr_review_imported` を購読し、PR review の body + コメントから finding を抽出して
 * **独立テーブル** `pr_review_findings` に書き込む (Step 4c)。
 *
 * - memory_review_findings には一切書かない (memory-core の source_type enum 不変)
 * - 既存 ReviewFindingMemoryAnalyzer (ローカル review .md / session 用) も変更しない。完全並走
 * - LLM 任意: `classify` 未指定なら severity / category は null (raw 保存のみ)
 *
 * 設計判断 (プラン Layer 3 案からの調整): pr_review_findings は trail.db のテーブルで
 * pr_reviews への FK を持つ。trail.db は Wave 2 末で PersistAnalyzer が save し Wave 3 では
 * read-only attach されるため、finding 書込は Wave 2 (tier=2) で行う。本 analyzer は
 * `pr_review_imported` (PrReviewImporter が Wave 1 の event chain で emit) を購読し、
 * onEvent で finding を書込む (PersistAnalyzer の save より前)。LLM 分類は任意フックで後付けする。
 */
export class PrReviewFindingAnalyzer implements Analyzer {
  readonly id = 'PrReviewFindingAnalyzer';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['pr_review_imported'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private reviewsProcessed = 0;
  private findingsWritten = 0;

  constructor(private readonly opts: PrReviewFindingAnalyzerOptions) {}

  getCounters(): { reviewsProcessed: number; findingsWritten: number } {
    return { reviewsProcessed: this.reviewsProcessed, findingsWritten: this.findingsWritten };
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'pr_review_imported') return;

    try {
      const detail = this.opts.trailDb.getPrReviewDetail(e.reviewId);
      if (!detail) {
        ctx.logger.warn?.(`[PrReviewFindingAnalyzer] review ${e.reviewId} not found, skipping`);
        return;
      }
      const createdAt = (this.opts.now?.() ?? new Date()).toISOString();
      const findings = extractPrReviewFindings(detail, createdAt, this.opts.classify);
      this.opts.trailDb.replacePrReviewFindings(e.reviewId, findings);
      this.reviewsProcessed += 1;
      this.findingsWritten += findings.length;
    } catch (err) {
      ctx.logger.error(
        `[PrReviewFindingAnalyzer] failed for review ${e.reviewId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    ctx.logger.info(
      `[PrReviewFindingAnalyzer] done (reviews=${this.reviewsProcessed}, findings=${this.findingsWritten})`,
    );
    // event は Wave 1 で配信されるため、リセットは onRunEnd 末尾で行う (PrReviewImporter と同方針)
    this.reviewsProcessed = 0;
    this.findingsWritten = 0;
  }
}
