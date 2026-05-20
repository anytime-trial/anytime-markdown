import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type {
  CorrelationCommitFile,
  CorrelationSessionCommit,
  CrossSourceCorrelationRow,
  DoraReleaseInput,
  PrReviewFindingRow,
  PrReviewRow,
} from '@anytime-markdown/trail-db';

import {
  computeCrossSourceCorrelations,
  DEFAULT_WINDOW_DAYS,
} from './computeCrossSourceCorrelations';

const MS_PER_DAY = 86_400_000;

/** CrossSourceCorrelator が trail.db に必要とする最小データソース (テストで fake 注入)。 */
export interface CrossSourceDataSource {
  getPrReviews(): PrReviewRow[];
  getPrReviewFindings(reviewId?: string): PrReviewFindingRow[];
  getCorrelationSessionCommits(sinceCommittedAt?: string): CorrelationSessionCommit[];
  getDoraReleases(): DoraReleaseInput[];
  getCorrelationCommitFiles(filePaths: readonly string[]): CorrelationCommitFile[];
  replaceCrossSourceCorrelations(rows: readonly CrossSourceCorrelationRow[]): void;
}

export interface CrossSourceCorrelatorOptions {
  readonly trailDb: CrossSourceDataSource;
  /** 算出日時の注入口 (テスト用)。 */
  readonly now?: () => Date;
  /** 相関の時間窓 (日)。省略時 14。 */
  readonly windowDays?: number;
}

/**
 * Layer 4 (Aggregator) Analyzer: 複数ソース横断の相関を算出し `cross_source_correlations` へ
 * 洗い替えで書き込む (Step 4d)。LEP の価値の核心 — analyzer を 1 個足すだけで cross-source 指標が書ける。
 *
 * - tier=4 / inputMode='self-read' / `wave_start:derived` 購読 (DoraMetricsAggregator と同じ)
 * - LLM 不要 (突合のみ)
 * - PR review が 0 件なら即 [] を書いて return (重い session_commits / commit_files の読込を回避)
 * - 実証目的: 相関 0 件でも例外なく完了する (空振りは repo 状況依存であり失敗ではない)
 */
export class CrossSourceCorrelator implements Analyzer {
  readonly id = 'CrossSourceCorrelator';
  readonly tier = 4 as const;
  readonly inputMode = 'self-read' as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['wave_start'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private correlationsComputed = 0;

  constructor(private readonly opts: CrossSourceCorrelatorOptions) {}

  getCorrelationsComputed(): number {
    return this.correlationsComputed;
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'wave_start' || e.wave !== 'derived') return;

    try {
      const reviews = this.opts.trailDb.getPrReviews();
      if (reviews.length === 0) {
        // PR review が無ければ相関も無い。重い読込を避けて空で洗い替え。
        this.opts.trailDb.replaceCrossSourceCorrelations([]);
        this.correlationsComputed = 0;
        ctx.logger.info('[CrossSourceCorrelator] done (no PR reviews, 0 correlations)');
        return;
      }

      const findings = this.opts.trailDb.getPrReviewFindings();
      // review 提出の最古 - windowDays を下限に、時間窓外の古い session commit ロードを避ける
      const windowDays = this.opts.windowDays ?? DEFAULT_WINDOW_DAYS;
      const since = earliestSince(reviews, windowDays);
      const sessionCommits = this.opts.trailDb.getCorrelationSessionCommits(since);
      const releases = this.opts.trailDb.getDoraReleases();
      const findingPaths = distinct(findings.map((f) => f.filePath).filter((p) => p.length > 0));
      const commitFiles = this.opts.trailDb.getCorrelationCommitFiles(findingPaths);

      const computedAt = (this.opts.now?.() ?? new Date()).toISOString();
      const rows = computeCrossSourceCorrelations(
        { reviews, findings, sessionCommits, releases, commitFiles },
        computedAt,
        this.opts.windowDays,
      );
      this.opts.trailDb.replaceCrossSourceCorrelations(rows);
      this.correlationsComputed = rows.length;
      ctx.logger.info(
        `[CrossSourceCorrelator] done (reviews=${reviews.length}, findings=${findings.length}, correlations=${rows.length})`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ctx.logger.error(`[CrossSourceCorrelator] failed: ${error.message}\n${error.stack ?? ''}`);
    }
  }
}

function distinct(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/**
 * review 群のうち最古の submittedAt から windowDays 遡った時刻を ISO 8601 で返す。
 * 解析不能な submittedAt しか無い場合は undefined (= 全件取得にフォールバック)。
 */
function earliestSince(
  reviews: readonly PrReviewRow[],
  windowDays: number,
): string | undefined {
  let minMs = Number.POSITIVE_INFINITY;
  for (const r of reviews) {
    const ms = Date.parse(r.submittedAt);
    if (!Number.isNaN(ms) && ms < minMs) minMs = ms;
  }
  if (!Number.isFinite(minMs)) return undefined;
  return new Date(minMs - windowDays * MS_PER_DAY).toISOString();
}
