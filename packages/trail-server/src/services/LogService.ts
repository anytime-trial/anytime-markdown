import type Database from 'better-sqlite3';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'extension' | 'daemon';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: unknown | null;
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
  private readonly insertStmt;

  constructor(
    private readonly db: Database.Database,
    private readonly broadcaster: LogBroadcaster,
  ) {
    this.insertStmt = db.prepare(`
      INSERT INTO extension_logs (timestamp, level, source, component, message, metadata, stack)
      VALUES (@timestamp, @level, @source, @component, @message, @metadata, @stack)
    `);
  }

  insertBatch(logs: LogEntry[], source: LogSource): void {
    if (logs.length === 0) return;
    const tx = this.db.transaction((entries: LogEntry[]) => {
      const inserted: PersistedLogEntry[] = [];
      for (const e of entries) {
        const info = this.insertStmt.run({
          timestamp: e.timestamp,
          level: e.level,
          source,
          component: e.component,
          message: e.message,
          metadata: e.metadata != null ? JSON.stringify(e.metadata) : null,
          stack: e.stack ?? null,
        });
        inserted.push({ ...e, id: Number(info.lastInsertRowid), source });
      }
      return inserted;
    });
    const inserted = tx(logs);
    this.broadcaster.notifyLog(inserted);
  }

  queryLogs(params: QueryParams): QueryResult {
    const limit = Math.min(params.limit ?? 500, 1000);
    const conds: string[] = [];
    const args: Record<string, unknown> = {};

    if (params.level && params.level.length > 0) {
      conds.push(`level IN (${params.level.map((_, i) => `@level${i}`).join(',')})`);
      params.level.forEach((l, i) => { args[`level${i}`] = l; });
    }
    if (params.source && params.source.length > 0) {
      conds.push(`source IN (${params.source.map((_, i) => `@source${i}`).join(',')})`);
      params.source.forEach((s, i) => { args[`source${i}`] = s; });
    }
    if (params.q) {
      conds.push(`(message LIKE @q OR component LIKE @q)`);
      args.q = `%${params.q}%`;
    }
    if (params.since) { conds.push(`timestamp >= @since`); args.since = params.since; }
    if (params.until) { conds.push(`timestamp < @until`); args.until = params.until; }
    if (params.cursor) {
      const [ts, idStr] = params.cursor.split('_');
      conds.push(`(timestamp < @cursorTs OR (timestamp = @cursorTs AND id < @cursorId))`);
      args.cursorTs = ts;
      args.cursorId = Number(idStr);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const sql = `
      SELECT id, timestamp, level, source, component, message, metadata, stack
      FROM extension_logs
      ${where}
      ORDER BY timestamp DESC, id DESC
      LIMIT @limit
    `;
    args.limit = limit + 1;
    const rows = this.db.prepare(sql).all(args) as Array<{
      id: number; timestamp: string; level: LogLevel; source: LogSource;
      component: string; message: string; metadata: string | null; stack: string | null;
    }>;

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const logs: PersistedLogEntry[] = sliced.map((r) => ({
      ...r,
      metadata: r.metadata != null ? JSON.parse(r.metadata) : null,
    }));
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last ? `${last.timestamp}_${last.id}` : null;
    return { logs, nextCursor };
  }

  cleanup(now: Date = new Date()): void {
    const debugCutoff = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();
    const infoCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    const errCutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
    this.db.prepare(`DELETE FROM extension_logs WHERE level = 'debug' AND timestamp < ?`).run(debugCutoff);
    this.db.prepare(`DELETE FROM extension_logs WHERE level = 'info' AND timestamp < ?`).run(infoCutoff);
    this.db.prepare(`DELETE FROM extension_logs WHERE level IN ('warn','error') AND timestamp < ?`).run(errCutoff);

    const HARD_LIMIT = 1_000_000;
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM extension_logs`).get() as { n: number };
    if (row.n > HARD_LIMIT) {
      const excess = row.n - HARD_LIMIT;
      this.db.prepare(`
        DELETE FROM extension_logs WHERE id IN (
          SELECT id FROM extension_logs ORDER BY timestamp ASC, id ASC LIMIT ?
        )
      `).run(excess);
    }
  }
}
