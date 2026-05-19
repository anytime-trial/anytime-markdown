import { randomUUID } from 'node:crypto';

import type { Analyzer, AnalyzerContext, AnalyzerEvent } from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

import { ImportAllPhaseStatusWriter } from '../jobs/ImportAllPhaseStatusFile';

type ImportAllAnalyzeFn = NonNullable<Parameters<TrailDatabase['importAll']>[3]>;
type ImportAllResult = Awaited<ReturnType<TrailDatabase['importAll']>>;

export interface ImportAllLegacyAnalyzerOptions {
  trailDb: TrailDatabase;
  gitRoots: readonly string[];
  onImportProgress?: (message: string, increment?: number) => void;
  analyzeReleaseFn?: ImportAllAnalyzeFn;
  onImportPhase?: (event: ImportAllPhaseEvent) => void;
  importAllStatusFilePath?: string;
}

/**
 * 既存 `TrailDatabase.importAll()` を 1 個の Layer 2 analyzer として LEP に載せる。
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
    const { trailDb, gitRoots, onImportProgress, analyzeReleaseFn, onImportPhase, importAllStatusFilePath } =
      this.opts;

    ctx.logger.info(`[ImportAllLegacy] start (gitRoots=${gitRoots.length})`);

    const phaseWriter = importAllStatusFilePath
      ? new ImportAllPhaseStatusWriter(importAllStatusFilePath, randomUUID())
      : null;
    phaseWriter?.initialize();

    const phaseHandler = (event: ImportAllPhaseEvent): void => {
      phaseWriter?.applyEvent(event);
      onImportPhase?.(event);
    };

    this.lastResult = await trailDb.importAll(
      onImportProgress,
      gitRoots,
      undefined,
      analyzeReleaseFn,
      importAllStatusFilePath || onImportPhase ? phaseHandler : undefined,
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
