import {
  ingestPrReview,
  type Analyzer,
  type AnalyzerContext,
  type AnalyzerEvent,
  type MemoryDbConnection,
  type PrReviewIngestInput,
} from '@anytime-markdown/trail-caravan-book';

import {
  extractPrReviewFindingInputs,
  type PrReviewFindingClassifier,
} from './extractPrReviewFindings';

export interface PrReviewFindingAnalyzerOptions {
  /** review + findings を同時永続化する caravan-book.db への書込接続。 */
  readonly memoryDb: MemoryDbConnection;
  /**
   * severity / category 分類フック (LLM 等)。任意。未指定なら raw コメントのみ保存し分類は skip。
   * これにより Ollama 不在環境でも finding 抽出は機能する (lep-step4 プラン §6.3.2 の「LLM 任意」)。
   */
  readonly classify?: PrReviewFindingClassifier;
}

/**
 * `pr_review_imported` を購読し、PR review の body + コメントから finding を抽出して
 * `ingestPrReview`（trail-caravan-book）で **review 本体と同時に** `memory_reviews` /
 * `memory_review_findings` へ書き込む (Step 5: activity.db から caravan-book.db への付け替え)。
 *
 * - `ingestPrReview` は bodyHash 一致で即 skip する冪等 API のため、review 行を先に空
 *   findings で作ってから findings だけを追い書きする 2 段呼び出しは成立しない
 *   （PrReviewImporter のドキュメント参照）。そのため本 analyzer が
 *   `pr_review_imported` イベント 1 件につき `ingestPrReview` を 1 回だけ呼び、
 *   review メタデータ（author / state / submittedAt / bodyHash 等）と抽出済み findings を
 *   同一呼び出しへまとめる。これにより severity_overall / target_refs_json も
 *   findings の内容から正しく再計算される。
 * - LLM 任意: `classify` 未指定なら severity / category は null (raw 保存のみ)。
 * - 本 analyzer は tier=2 (Wave 2) で動く。`pr_review_imported` は PrReviewImporter が
 *   Wave 1 の event chain で emit するため、onEvent で書込めば PersistAnalyzer の activity.db
 *   save より前に完結する（activity.db 側への書込は無い）。
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
      const repoName = e.repo.includes('/') ? (e.repo.split('/').pop() ?? e.repo) : e.repo;
      const findings = extractPrReviewFindingInputs(
        { state: e.state, body: e.body, comments: e.comments },
        this.opts.classify,
      );
      const input: PrReviewIngestInput = {
        repoName,
        prNumber: e.prNumber,
        reviewId: e.reviewId,
        author: e.author,
        state: e.state,
        submittedAt: e.submittedAt,
        bodyHash: e.bodyHash,
        bodyExcerpt: e.body,
        findings,
      };
      const result = ingestPrReview(this.opts.memoryDb, input, ctx.logger);
      this.reviewsProcessed += 1;
      this.findingsWritten += result.findingsCount;
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
