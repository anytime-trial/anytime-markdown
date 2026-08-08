import type { MemoryDbConnection, MemoryDbStatement } from '@anytime-markdown/memory-core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'extension' | 'daemon';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: unknown;
  stack?: string | null;
}

/** system run に溜まる live ログの総件数上限。超過分を古い順に落とす。 */
const HARD_LIMIT = 1_000_000;

export class LogService {
  private readonly insertStmt: MemoryDbStatement;

  constructor(
    private readonly db: MemoryDbConnection,
    private readonly systemRunId: string,
  ) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message, metadata, stack)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  insertBatch(logs: LogEntry[], source: LogSource): void {
    if (logs.length === 0) return;
    this.db.run('BEGIN');
    try {
      for (const e of logs) {
        this.insertStmt.run(
          this.systemRunId,
          e.timestamp,
          e.level,
          source,
          e.component,
          e.message,
          e.metadata == null ? null : JSON.stringify(e.metadata),
          e.stack ?? null,
        );
      }
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  /**
   * live ログ（daemon / 拡張本体の垂れ流し）だけを刈り込む。
   *
   * 保持ポリシーを `run_id = systemRunId` に限定するのが要点。analyzer の run に
   * 紐づく調査用ログは run 件数で自然に上限が付き、かつ「あとから失敗理由を追う」
   * という本機能の目的そのものなので消さない。一方 system run は daemon が動いて
   * いる限り全ログを集約し続けるため、無制限だと memory-core.db が肥大化する
   * （旧 extension_logs が保持期限を持っていた理由）。
   */
  cleanup(now: Date = new Date()): void {
    const cutoff = (days: number): string =>
      new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();

    this.db.run(
      `DELETE FROM pipeline_run_logs
       WHERE run_id = ? AND level = 'debug' AND timestamp < ?`,
      [this.systemRunId, cutoff(3)],
    );
    this.db.run(
      `DELETE FROM pipeline_run_logs
       WHERE run_id = ? AND level = 'info' AND timestamp < ?`,
      [this.systemRunId, cutoff(30)],
    );
    this.db.run(
      `DELETE FROM pipeline_run_logs
       WHERE run_id = ? AND level IN ('warn','error') AND timestamp < ?`,
      [this.systemRunId, cutoff(90)],
    );

    const countStmt = this.db.prepare(
      `SELECT COUNT(*) AS n FROM pipeline_run_logs WHERE run_id = ?`,
    );
    let total = 0;
    try {
      const row = countStmt.get(this.systemRunId);
      total = Number(row?.n ?? 0);
    } finally {
      countStmt.free?.();
    }
    if (total > HARD_LIMIT) {
      this.db.run(
        `DELETE FROM pipeline_run_logs WHERE id IN (
          SELECT id FROM pipeline_run_logs WHERE run_id = ?
          ORDER BY timestamp ASC, id ASC LIMIT ?
        )`,
        [this.systemRunId, total - HARD_LIMIT],
      );
    }
  }
}
