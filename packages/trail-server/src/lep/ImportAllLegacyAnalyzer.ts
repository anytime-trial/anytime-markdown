import { randomUUID } from 'node:crypto';

import type { Analyzer, AnalyzerContext, AnalyzerEvent } from '@anytime-markdown/memory-core';
import type {
  ImportAllLepOptions,
  ImportAllPhase,
  ImportAllPhaseEvent,
  TrailDatabase,
} from '@anytime-markdown/trail-db';

import { ImportAllPhaseStatusWriter } from '../jobs/ImportAllPhaseStatusFile';
import type { BehaviorAnalyzer } from './analyzers/primary/BehaviorAnalyzer';
import type { CommitResolver } from './analyzers/primary/CommitResolver';
import type { CostRebuilder } from './analyzers/primary/CostRebuilder';
import type { CountsRebuilder } from './analyzers/primary/CountsRebuilder';
import type { CoverageImporter } from './analyzers/primary/CoverageImporter';
import type { ReleaseResolver } from './analyzers/primary/ReleaseResolver';
import type { SessionImporter } from './analyzers/primary/SessionImporter';

type ImportAllAnalyzeFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;
type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

export interface ImportAllLegacyAnalyzerOptions {
  trailDb: TrailDatabase;
  gitRoots: readonly string[];
  onImportProgress?: (message: string, increment?: number) => void;
  analyzeReleaseFn?: ImportAllAnalyzeFn;
  onImportPhase?: (event: ImportAllPhaseEvent) => void;
  importAllStatusFilePath?: string;

  /**
   * LEP Step 2b: Phase 1 (import_sessions) を担う SessionImporter。`getSessionsToAnalyze()` から
   * Phase 6 (analyze_behavior) で使う session 集合を取得する。指定時は Phase 1 を skip する。
   */
  sessionImporter?: Pick<SessionImporter, 'getSessionsToAnalyze' | 'getCounters'>;
  /** LEP Step 2b: Phase 1 内 resolveCommits を担う CommitResolver。指定時は counters 集計用 */
  commitResolver?: Pick<CommitResolver, 'getCommitsResolved'>;
  /** LEP Step 2b: Phase 2 (resolve_releases) を担う。指定時は Phase 2 を skip する */
  releaseResolver?: Pick<ReleaseResolver, 'getReleasesResolved'>;
  /** LEP Step 2b: Phase 4 (import_coverage) を担う。指定時は Phase 4 を skip する */
  coverageImporter?: Pick<CoverageImporter, 'getCounters'>;
  /** LEP Step 2c: Phase 5 (rebuild_costs) を担う。指定時は Phase 5 を skip */
  costRebuilder?: Pick<CostRebuilder, 'id'>;
  /** LEP Step 2c: Phase 6 (analyze_behavior) を担う。指定時は Phase 6 を skip */
  behaviorAnalyzer?: Pick<BehaviorAnalyzer, 'id'>;
  /** LEP Step 2c: Phase 7 (rebuild_counts) を担う。指定時は Phase 7 を skip */
  countsRebuilder?: Pick<CountsRebuilder, 'id'>;
}

/**
 * 既存 `TrailDatabase.importAll()` を 1 個の Layer 2 analyzer として LEP に載せる。
 *
 * LEP Step 2b 以降は、Phase 1/2/4 が個別 analyzer (`SessionImporter` / `ReleaseResolver` /
 * `CoverageImporter`) に分離されたため、本 analyzer は **Phase 3 / 5 / 6 / 7 / 8** のみを担当する。
 * Phase 1/2/4 を skip すること、外部 analyzer の集計値を `lepOpts` で連携することで動作不変を維持する。
 *
 * - importAllStatusFilePath が指定されれば `ImportAllPhaseStatusWriter` を初期化し
 *   `ImportAllPhaseEvent` を JSON ファイルに書き出す。
 * - `onImportPhase` callback も併存して呼び出す (両方設定時は両方発火)。
 *
 * 後続の memory-core 実行が `wave_complete:primary` を契機に走るため、
 * importAll の完了が先行している必要があり、`onRunStart` ではなく `onRunEnd` に置く。
 */
export class ImportAllLegacyAnalyzer implements Analyzer {
  readonly id = 'ImportAllLegacy';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private lastResult: ImportAllResult | null = null;

  constructor(private readonly opts: ImportAllLegacyAnalyzerOptions) {}

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const {
      trailDb,
      gitRoots,
      onImportProgress,
      analyzeReleaseFn,
      onImportPhase,
      importAllStatusFilePath,
      sessionImporter,
      commitResolver,
      releaseResolver,
      coverageImporter,
      costRebuilder,
      behaviorAnalyzer,
      countsRebuilder,
    } = this.opts;

    ctx.logger.info(`[ImportAllLegacy] start (gitRoots=${gitRoots.length})`);

    const phaseWriter = importAllStatusFilePath
      ? new ImportAllPhaseStatusWriter(importAllStatusFilePath, randomUUID())
      : null;
    phaseWriter?.initialize();

    const phaseHandler = (event: ImportAllPhaseEvent): void => {
      phaseWriter?.applyEvent(event);
      onImportPhase?.(event);
    };

    // LEP analyzer が処理した phase を importAll 本体ではスキップさせる
    const phasesToSkip = new Set<ImportAllPhase>();
    if (sessionImporter) phasesToSkip.add('import_sessions');
    if (releaseResolver) phasesToSkip.add('resolve_releases');
    if (coverageImporter) phasesToSkip.add('import_coverage');
    if (costRebuilder) phasesToSkip.add('rebuild_costs');
    if (behaviorAnalyzer) phasesToSkip.add('analyze_behavior');
    if (countsRebuilder) phasesToSkip.add('rebuild_counts');

    const lepOpts: ImportAllLepOptions = {
      phasesToSkip,
      externalSessionsToAnalyze: sessionImporter?.getSessionsToAnalyze(),
      externalCounters: {
        imported: sessionImporter?.getCounters().imported ?? 0,
        skipped: sessionImporter?.getCounters().skipped ?? 0,
        commitsResolved: commitResolver?.getCommitsResolved() ?? 0,
        releasesResolved: releaseResolver?.getReleasesResolved() ?? 0,
        coverageImported: coverageImporter?.getCounters().coverageImported ?? 0,
        currentCoverageImported: coverageImporter?.getCounters().currentCoverageImported ?? 0,
      },
    };

    this.lastResult = await trailDb.importAll(
      onImportProgress,
      gitRoots,
      undefined,
      analyzeReleaseFn,
      importAllStatusFilePath || onImportPhase ? phaseHandler : undefined,
      lepOpts,
    );

    ctx.logger.info('[ImportAllLegacy] done');
  }

  /**
   * 直近 onRunEnd で得た importAll 結果。失敗時 (throw) は更新されず、
   * 前回成功時の値が残る。
   */
  getLastResult(): ImportAllResult | null {
    return this.lastResult;
  }
}
