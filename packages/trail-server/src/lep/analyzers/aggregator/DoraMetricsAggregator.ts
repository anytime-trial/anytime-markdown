import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type {
  DoraCommitInput,
  DoraMetricRow,
  DoraReleaseInput,
} from '@anytime-markdown/trail-db';

import { computeDoraMetrics } from './computeDoraMetrics';

/**
 * `DoraMetricsAggregator` が trail.db に対して必要とする最小データソース。
 *
 * 本番では `TrailDatabase` がこの 3 メソッドを実装する。テストでは fake を注入し、
 * 実 DB 非依存で集計ロジックを検証する。
 */
export interface DoraDataSource {
  getDoraReleases(): DoraReleaseInput[];
  getDoraCommits(): DoraCommitInput[];
  replaceDoraMetrics(rows: readonly DoraMetricRow[]): void;
}

export interface DoraMetricsAggregatorOptions {
  readonly trailDb: DoraDataSource;
  /** 算出日時の注入口 (テスト用)。省略時は `new Date()`。 */
  readonly now?: () => Date;
}

/**
 * Layer 4 (Aggregator) Analyzer: 既存 trail.db データ (releases / session_commits) のみから
 * DORA 指標 (deployment frequency / lead time) を月次集計し `dora_metrics` に洗い替えで書き込む。
 *
 * - tier=4 / inputMode='self-read': 新規 raw データは取り込まず、既存テーブルを読んで横断指標を算出
 * - `wave_start:derived` (Wave 4 開始) を購読し、その時点で算出する
 * - LLM 不要 (`requiresLlm` 未宣言)、集計のみ
 *
 * Wave 4 (tier 4) は `stage='all'` でのみ実行される (opt-in)。空 (release 0 件) でも例外なく
 * 完了する。算出失敗は throw せず error ログに留め、run 全体を止めない (実証目的)。
 */
export class DoraMetricsAggregator implements Analyzer {
  readonly id = 'DoraMetricsAggregator';
  readonly tier = 4 as const;
  readonly inputMode = 'self-read' as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['wave_start'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private periodsComputed = 0;

  constructor(private readonly opts: DoraMetricsAggregatorOptions) {}

  /** 直近 run で書き込んだ dora_metrics の行数 (= repo × period 数)。 */
  getPeriodsComputed(): number {
    return this.periodsComputed;
  }

  async onEvent(e: AnalyzerEvent, ctx: AnalyzerContext): Promise<void> {
    // Wave 4 開始のみで発火する。他 Wave (sources/primary/memory) の wave_start は無視。
    if (e.kind !== 'wave_start' || e.wave !== 'derived') return;

    try {
      const releases = this.opts.trailDb.getDoraReleases();
      const commits = this.opts.trailDb.getDoraCommits();
      const computedAt = (this.opts.now?.() ?? new Date()).toISOString();
      const rows = computeDoraMetrics(releases, commits, computedAt);
      this.opts.trailDb.replaceDoraMetrics(rows);
      this.periodsComputed = rows.length;
      ctx.logger.info(
        `[DoraMetricsAggregator] done (releases=${releases.length}, commits=${commits.length}, periods=${rows.length})`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ctx.logger.error(
        `[DoraMetricsAggregator] failed: ${error.message}\n${error.stack ?? ''}`,
      );
    }
  }
}
