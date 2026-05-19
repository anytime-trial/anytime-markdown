import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import type { ImportAllPhaseEvent, TrailDatabase } from '@anytime-markdown/trail-db';

export interface CoverageImporterOptions {
  readonly trailDb: TrailDatabase;
  /** primary gitRoot (gitRoots[0]) */
  readonly gitRoots: readonly string[];
  readonly onPhase?: (event: ImportAllPhaseEvent) => void;
  readonly onProgress?: (message: string, increment?: number) => void;
}

/**
 * Layer 2 Primary Analyzer: `coverage_report` event を購読し、Wave 末端で
 * `TrailDatabase.importCoverage()` + `importCurrentCoverage()` を 1 回 / gitRoot 呼ぶ。
 *
 * 既存 importAll Phase 4 の挙動を維持。event 自体は将来 (Step 2c+) で pkg 単位の
 * 細粒度処理に拡張可能だが、Step 2b では `coverage_report` の存在のみを集計し、Wave
 * 末端で従来通り 1 つの gitRoot にまとめて importCoverage を実行する。
 */
export class CoverageImporter implements Analyzer {
  readonly id = 'CoverageImporter';
  readonly tier = 2 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = ['coverage_report'];
  readonly emits: readonly AnalyzerEvent['kind'][] = [];

  private readonly seenRoots = new Set<string>();
  private coverageImported = 0;
  private currentCoverageImported = 0;

  constructor(private readonly opts: CoverageImporterOptions) {}

  getCounters(): { coverageImported: number; currentCoverageImported: number } {
    return {
      coverageImported: this.coverageImported,
      currentCoverageImported: this.currentCoverageImported,
    };
  }

  async onRunStart(_ctx: AnalyzerContext): Promise<void> {
    this.seenRoots.clear();
    this.coverageImported = 0;
    this.currentCoverageImported = 0;
  }

  async onEvent(e: AnalyzerEvent, _ctx: AnalyzerContext): Promise<void> {
    if (e.kind !== 'coverage_report') return;
    this.seenRoots.add(e.gitRoot);
  }

  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    const primary = this.opts.gitRoots[0];
    if (!primary) {
      this.opts.onPhase?.({ phase: 'import_coverage', action: 'skip', message: 'no gitRoot' });
      ctx.logger.info('[CoverageImporter] done (skip: no gitRoot)');
      return;
    }
    if (!this.seenRoots.has(primary)) {
      // coverage_report event がない = coverage-summary.json が存在しない
      this.opts.onPhase?.({ phase: 'import_coverage', action: 'skip', message: 'no coverage' });
      ctx.logger.info('[CoverageImporter] done (skip: no coverage)');
      return;
    }

    this.opts.onPhase?.({ phase: 'import_coverage', action: 'start' });
    let failed = false;
    try {
      this.opts.onProgress?.('Importing coverage data...', 0);
      this.coverageImported = this.opts.trailDb.importCoverage(primary);
      this.opts.onProgress?.(`Coverage imported: ${this.coverageImported} entries`, 0);
    } catch (err) {
      failed = true;
      this.opts.onPhase?.({
        phase: 'import_coverage',
        action: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      this.opts.onProgress?.('Importing current coverage snapshot...', 0);
      this.currentCoverageImported = this.opts.trailDb.importCurrentCoverage(
        primary,
        path.basename(primary),
      );
      this.opts.onProgress?.(
        `Current coverage imported: ${this.currentCoverageImported} entries`,
        0,
      );
    } catch (err) {
      if (!failed) {
        this.opts.onPhase?.({
          phase: 'import_coverage',
          action: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
        failed = true;
      }
    }
    if (!failed) {
      this.opts.onPhase?.({
        phase: 'import_coverage',
        action: 'finish',
        count: this.coverageImported + this.currentCoverageImported,
      });
    }
    ctx.logger.info(
      `[CoverageImporter] done (release=${this.coverageImported}, current=${this.currentCoverageImported})`,
    );
  }
}
