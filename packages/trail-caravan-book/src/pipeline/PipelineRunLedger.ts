import { createHash } from 'node:crypto';
import type { MemoryDbConnection, SqlValue } from '../db/connection/types';
import { type MemoryLogger, noopLogger } from '../logger';

/**
 * LEP の Wave 区分。`system` は analyzer に属さない daemon / 拡張本体の実行を指す。
 * migration 016 で `caravan_pipeline_runs.wave` の CHECK 制約と対応させている。
 */
export type PipelineWave = 'sources' | 'primary' | 'memory' | 'derived' | 'system';

export type PipelineRunStatus = 'running' | 'success' | 'partial' | 'error';

/** run 行の集計列。省略した列は直前の値を保つ（累積スナップショット）。 */
export interface PipelineRunTotals {
  readonly items_processed?: number;
  readonly entities_inserted?: number;
  readonly entities_updated?: number;
  readonly edges_inserted?: number;
  readonly edges_invalidated?: number;
  readonly drifts_detected?: number;
  readonly items_failed?: number;
}

export interface PipelineRunLedgerOptions {
  readonly db: MemoryDbConnection;
  /** 実行単位の識別子。Wave 3 は既存 scope 名、他 Wave は analyzer id を使う。 */
  readonly scope: string;
  readonly wave: PipelineWave;
  /** LEP tier。`system` は analyzer 階層に属さないため 0。 */
  readonly tier: number;
  readonly logger?: MemoryLogger;
}

const TOTAL_COLUMNS = [
  'items_processed',
  'entities_inserted',
  'entities_updated',
  'edges_inserted',
  'edges_invalidated',
  'drifts_detected',
  'items_failed',
] as const;

type TotalColumn = (typeof TOTAL_COLUMNS)[number];

function emptyTotals(): Record<TotalColumn, number> {
  return {
    items_processed: 0,
    entities_inserted: 0,
    entities_updated: 0,
    edges_inserted: 0,
    edges_invalidated: 0,
    drifts_detected: 0,
    items_failed: 0,
  };
}

/** 例外を error_detail 用の文字列へ落とす。Error なら stack、無ければ message。 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/**
 * LEP 全 Wave 共通の実行台帳ライター。`caravan_pipeline_runs` へ 1 実行 1 行を書く。
 *
 * 台帳は補助機構なので書き込み失敗は呼び出し元へ伝播させない (fail-open)。
 * 記録が落ちても ingest 本体は完走させ、原因追跡のためにログだけ残す。
 * ただし `status='running'` の行を残したまま落ちると次回実行が塞がるため、
 * その解放は `pipelineWatchdog` が `last_heartbeat_at` を見て担う。
 */
export class PipelineRunLedger {
  private readonly db: MemoryDbConnection;
  private readonly scope: string;
  private readonly wave: PipelineWave;
  private readonly tier: number;
  private readonly logger: MemoryLogger;

  private currentRunId: string | null = null;
  private startedAt: string | null = null;
  private totals: Record<TotalColumn, number> = emptyTotals();

  constructor(options: PipelineRunLedgerOptions) {
    this.db = options.db;
    this.scope = options.scope;
    this.wave = options.wave;
    this.tier = options.tier;
    this.logger = options.logger ?? noopLogger;
  }

  /** 進行中の run ID。`start()` 前と `finish()` 失敗時は null。 */
  get runId(): string | null {
    return this.currentRunId;
  }

  /**
   * run 行を `running` で作る。戻り値は run ID。
   *
   * nonce に高精度時刻を混ぜるのは、1 プロセス内の連続実行が同一ミリ秒へ着地して
   * 主キーが衝突した実績があるため（better-sqlite3 移行時に発生）。scope と
   * started_at だけでは一意にならない。
   *
   * `last_heartbeat_at` を `started_at` で種付けするのは、最初の heartbeat 前でも
   * watchdog が有効な進捗シグナルを読めるようにするため。
   */
  start(startedAt: string = new Date().toISOString()): string {
    const nonce = process.hrtime.bigint().toString(36);
    const runId = createHash('sha1')
      .update(`${this.scope}:${startedAt}:${nonce}`)
      .digest('hex')
      .slice(0, 16);

    this.currentRunId = runId;
    this.startedAt = startedAt;
    this.totals = emptyTotals();

    this.write('start', () => {
      this.db.run(
        `INSERT INTO caravan_pipeline_runs
           (id, scope, wave, tier, started_at, status,
            items_processed, entities_inserted, entities_updated,
            edges_inserted, edges_invalidated, drifts_detected,
            items_failed, duration_ms, error_detail, last_heartbeat_at)
         VALUES (?, ?, ?, ?, ?, 'running', 0, 0, 0, 0, 0, 0, 0, 0, '', ?)`,
        [runId, this.scope, this.wave, this.tier, startedAt, startedAt],
      );
    });

    return runId;
  }

  /**
   * 途中経過を記録し `last_heartbeat_at` を進める。長時間 run が watchdog の
   * タイムアウト窓で誤って失効させられるのを防ぐ。
   */
  heartbeat(totals: PipelineRunTotals = {}): void {
    const runId = this.currentRunId;
    if (!runId) return;
    this.mergeTotals(totals);

    this.write('heartbeat', () => {
      this.db.run(
        `UPDATE caravan_pipeline_runs SET
           last_heartbeat_at = ?,
           ${TOTAL_COLUMNS.map((c) => `${c} = ?`).join(',\n           ')}
         WHERE id = ?`,
        [new Date().toISOString(), ...this.totalValues(), runId],
      );
    });
  }

  /**
   * 進行中の run へ自由文ログを 1 行追記する。`metadata` は JSON として保存し、
   * 後続の調査で run 単位に読み戻せるようにする。
   */
  appendLog(
    level: 'debug' | 'info' | 'warn' | 'error',
    component: string,
    message: string,
    metadata?: unknown,
    stack?: string | null,
    source: 'extension' | 'daemon' = 'daemon',
  ): void {
    const runId = this.currentRunId;
    if (!runId) return;

    const metadataJson = metadata == null ? null : (JSON.stringify(metadata) ?? null);

    this.write('appendLog', () => {
      this.db.run(
        `INSERT INTO caravan_pipeline_run_logs
           (run_id, timestamp, level, source, component, message, metadata, stack)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          new Date().toISOString(),
          level,
          source,
          component,
          message,
          metadataJson,
          stack ?? null,
        ],
      );
    });
  }

  /**
   * run を確定する。`errorDetail` は status に関わらず記録するため、部分成功の
   * 理由も残せる。旧実装は UPDATE 文に error_detail を含めておらず、error 行の
   * 中身が常に空だった（scope 単位の caravan_pipeline_state は毎回上書きされる
   * ため、過去の失敗理由はどこにも残らなかった）。
   */
  finish(status: Exclude<PipelineRunStatus, 'running'>, totals: PipelineRunTotals = {}, errorDetail = ''): void {
    const runId = this.currentRunId;
    const startedAt = this.startedAt;
    if (!runId || !startedAt) return;
    this.mergeTotals(totals);

    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - new Date(startedAt).getTime());

    this.write('finish', () => {
      this.db.run(
        `UPDATE caravan_pipeline_runs SET
           finished_at  = ?,
           status       = ?,
           duration_ms  = ?,
           error_detail = ?,
           ${TOTAL_COLUMNS.map((c) => `${c} = ?`).join(',\n           ')}
         WHERE id = ?`,
        [finishedAt, status, durationMs, errorDetail, ...this.totalValues(), runId],
      );
    });

    // 確定した run を指したままにしない。使い回されたインスタンスの二重 finish や
    // finish 後の heartbeat が、既に閉じた行を静かに再 UPDATE するのを防ぐ。
    // 書き込みは fail-open で例外を出さないため、状態側で塞いでおく必要がある。
    this.currentRunId = null;
    this.startedAt = null;
  }

  /** 例外で終わった run を `error` として確定し、stack を error_detail へ残す。 */
  fail(err: unknown, totals: PipelineRunTotals = {}): void {
    this.finish('error', totals, describeError(err));
  }

  private mergeTotals(totals: PipelineRunTotals): void {
    for (const column of TOTAL_COLUMNS) {
      const value = totals[column];
      if (value !== undefined) this.totals[column] = value;
    }
  }

  private totalValues(): SqlValue[] {
    return TOTAL_COLUMNS.map((column) => this.totals[column]);
  }

  private write(operation: string, run: () => void): void {
    try {
      run();
    } catch (err) {
      this.logger.error(
        `[pipeline-run-ledger] ${operation} failed (scope=${this.scope}, wave=${this.wave})`,
        err,
      );
    }
  }
}
