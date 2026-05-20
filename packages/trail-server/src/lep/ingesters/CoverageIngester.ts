import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';

export interface CoverageIngesterOptions {
  /** 監視対象 gitRoot 群。各 root の `packages/<pkg>/coverage/coverage-summary.json` をスキャンする */
  readonly gitRoots: readonly string[];
}

/**
 * Layer 1 Ingester: 各 gitRoot 配下の `packages/<pkg>/coverage/coverage-summary.json`
 * を発見し `coverage_report` event を emit する。
 *
 * Step 2a 時点では subscriber が不在。Step 2b の `CoverageImporter` が購読して
 * `release_coverage` / `current_coverage` テーブルに書き込む。
 *
 * ファイル存在判定のみで内容パースは行わない (パースは CoverageImporter の責務)。
 */
export class CoverageIngester implements Analyzer {
  readonly id = 'CoverageIngester';
  readonly tier = 1 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['coverage_report'];

  constructor(private readonly opts: CoverageIngesterOptions) {}

  // Ingester は Wave 実行フェーズ (onRunEnd) で emit する (消費側は orchestrator Pass 1 で初期化済み)。
  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    let emitted = 0;
    for (const gitRoot of this.opts.gitRoots) {
      const packagesDir = path.join(gitRoot, 'packages');
      let entries: string[];
      try {
        entries = fs.readdirSync(packagesDir);
      } catch {
        continue;
      }
      for (const pkg of entries) {
        const summaryPath = path.join(packagesDir, pkg, 'coverage', 'coverage-summary.json');
        let exists = false;
        try {
          exists = fs.statSync(summaryPath).isFile();
        } catch {
          // ファイル無しは skip
        }
        if (!exists) continue;

        await ctx.bus.publish({
          kind: 'coverage_report',
          pkg,
          filePath: summaryPath,
          gitRoot,
        });
        emitted++;
      }
    }
    ctx.logger.info(`[CoverageIngester] emitted ${emitted} coverage reports`);
  }
}
