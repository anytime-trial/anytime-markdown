import type { MemoryDbConnection } from '../db/connection/types';
import type { PipelineRunLedgerFactory } from '../lep/LepOrchestrator';
import { type MemoryLogger, noopLogger } from '../logger';
import { PipelineRunLedger } from './PipelineRunLedger';

export interface CreatePipelineRunLedgerFactoryOptions {
  /** Wave 3 のセッションと同じ memory-core.db 接続。migration はここで走らせない。 */
  readonly db: MemoryDbConnection;
  readonly logger?: MemoryLogger;
}

/**
 * Wave 1/2/4 の実行台帳ファクトリを作る。
 *
 * `pipeline_runs` が未作成の間 (migration 前の memory-core.db) は null を返して記録を諦める。
 * 台帳は補助機構であり、その不在で ingest 本体を止めないため (fail-open)。
 *
 * ホスト (CLI / daemon) ごとに書き起こさず本関数へ集約するのは、**production 経路である
 * daemon 側だけ配線が漏れていた**ため。Wave 1/2/4 は走っているのに `pipeline_runs` へ 1 行も
 * 残らず、Trail Pipeline の Runs 画面では sources / primary / derived が恒久的に空に見えた
 * (2026-08-05 実測: 24 行すべて wave='memory' か 'system')。同じ配線を 2 箇所で書く限り
 * 片方だけ落ちる事故は再発するので、注入する値そのものを共有する。
 */
export function createPipelineRunLedgerFactory(
  options: CreatePipelineRunLedgerFactoryOptions,
): PipelineRunLedgerFactory {
  const { db } = options;
  const logger = options.logger ?? noopLogger;

  const hasPipelineRunsTable = (): boolean => {
    try {
      const rows = db.exec(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pipeline_runs'`,
      );
      return (rows[0]?.values.length ?? 0) > 0;
    } catch (err) {
      logger.error('[pipeline-run-ledger] pipeline_runs table probe failed', err);
      return false;
    }
  };

  return (scope, wave, tier) =>
    hasPipelineRunsTable() ? new PipelineRunLedger({ db, scope, wave, tier, logger }) : null;
}
