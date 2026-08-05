import type { MemoryDbConnection, MemoryDbStatement, MemoryDbSqlValue as SqlValue } from '@anytime-markdown/memory-core';

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

export interface PersistedLogEntry extends LogEntry {
  id: number;
  source: LogSource;
}

export interface LogBroadcaster {
  notifyLog(entries: PersistedLogEntry[]): void;
}

export interface QueryParams {
  level?: LogLevel[];
  source?: LogSource[];
  q?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string | null;
}

export interface QueryResult {
  logs: PersistedLogEntry[];
  nextCursor: string | null;
}

export class LogService {
  private readonly insertStmt: MemoryDbStatement;

  constructor(
    private readonly db: MemoryDbConnection,
    private readonly broadcaster: LogBroadcaster,
    private readonly systemRunId: string,
  ) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO pipeline_run_logs (run_id, timestamp, level, source, component, message, metadata, stack)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  insertBatch(logs: LogEntry[], source: LogSource): void {
    if (logs.length === 0) return;
    const inserted: PersistedLogEntry[] = [];
    this.db.run('BEGIN');
    try {
      for (const e of logs) {
        const result = this.insertStmt.run(
          this.systemRunId,
          e.timestamp,
          e.level,
          source,
          e.component,
          e.message,
          e.metadata == null ? null : JSON.stringify(e.metadata),
          e.stack ?? null,
        );
        inserted.push({ ...e, id: Number(result.lastInsertRowid), source });
      }
      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    this.broadcaster.notifyLog(inserted);
  }

  private buildQueryConditions(params: QueryParams): { conds: string[]; args: SqlValue[] } {
    const conds: string[] = [];
    const args: SqlValue[] = [];

    if (params.level && params.level.length > 0) {
      conds.push(`level IN (${params.level.map(() => '?').join(',')})`);
      for (const l of params.level) args.push(l);
    }
    if (params.source && params.source.length > 0) {
      conds.push(`source IN (${params.source.map(() => '?').join(',')})`);
      for (const s of params.source) args.push(s);
    }
    if (params.q) {
      const like = `%${params.q}%`;
      conds.push(`(message LIKE ? OR component LIKE ?)`);
      args.push(like, like);
    }
    if (params.since) {
      conds.push(`timestamp >= ?`);
      args.push(params.since);
    }
    if (params.until) {
      conds.push(`timestamp < ?`);
      args.push(params.until);
    }
    if (params.cursor) {
      const [ts, idStr] = params.cursor.split('_');
      conds.push(`(timestamp < ? OR (timestamp = ? AND id < ?))`);
      args.push(ts, ts, Number(idStr));
    }

    return { conds, args };
  }

  queryLogs(params: QueryParams): QueryResult {
    const limit = Math.min(params.limit ?? 500, 1000);
    const { conds, args } = this.buildQueryConditions(params);

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const sql = `
      SELECT id, timestamp, level, source, component, message, metadata, stack
      FROM pipeline_run_logs
      ${where}
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
    `;
    args.push(limit + 1);

    const stmt = this.db.prepare(sql);
    let rows: ReturnType<MemoryDbStatement['all']>;
    try {
      rows = stmt.all(...args);
    } finally {
      stmt.free?.();
    }

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const logs: PersistedLogEntry[] = sliced.map((r) => ({
      id: Number(r.id),
      timestamp: String(r.timestamp),
      level: r.level as LogLevel,
      source: r.source as LogSource,
      component: String(r.component),
      message: String(r.message),
      metadata: r.metadata == null ? null : JSON.parse(String(r.metadata)),
      stack: r.stack == null ? null : String(r.stack),
    }));
    const last = sliced.at(-1);
    const nextCursor = hasMore && last ? `${String(last.timestamp)}_${Number(last.id)}` : null;
    return { logs, nextCursor };
  }
}
