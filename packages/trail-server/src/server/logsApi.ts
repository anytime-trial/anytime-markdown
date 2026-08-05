import type { LogEntry, LogLevel, LogService } from '../services/LogService';

const TS_REGEX = /^\d{4}-[0-1]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
const VALID_LEVELS: ReadonlySet<string> = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);
const MAX_BATCH = 200;

export interface ApiResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

function validateLogEntry(item: unknown): { entry: LogEntry } | { error: string } {
  if (!item || typeof item !== 'object') return { error: 'invalid entry' };
  const e = item as Record<string, unknown>;
  if (typeof e.timestamp !== 'string' || !TS_REGEX.test(e.timestamp)) return { error: 'invalid timestamp' };
  if (typeof e.level !== 'string' || !VALID_LEVELS.has(e.level)) return { error: 'invalid level' };
  if (typeof e.component !== 'string') return { error: 'invalid component' };
  if (typeof e.message !== 'string') return { error: 'invalid message' };
  if (e.stack != null && typeof e.stack !== 'string') return { error: 'invalid stack' };
  return {
    entry: {
      timestamp: e.timestamp,
      level: e.level as LogLevel,
      component: e.component,
      message: e.message,
      metadata: e.metadata ?? null,
      stack: (e.stack as string | undefined) ?? null,
    },
  };
}

export function handlePostLogs(rawBody: string, svc: LogService): ApiResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: 'invalid json' };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { logs?: unknown }).logs)) {
    return { status: 400, body: 'logs[] required' };
  }
  const logs = (parsed as { logs: unknown[] }).logs;
  if (logs.length > MAX_BATCH) return { status: 400, body: 'batch too large' };

  const validated: LogEntry[] = [];
  for (const item of logs) {
    const result = validateLogEntry(item);
    if ('error' in result) return { status: 400, body: result.error };
    validated.push(result.entry);
  }

  try {
    svc.insertBatch(validated, 'extension');
  } catch (err) {
    return { status: 500, body: `db error: ${(err as Error).message}` };
  }
  return { status: 204 };
}
