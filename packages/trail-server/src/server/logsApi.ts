import type { LogEntry, LogLevel, LogService, LogSource } from '../services/LogService';

const TS_REGEX = /^\d{4}-[0-1]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
const VALID_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error'];
const VALID_SOURCES: ReadonlyArray<LogSource> = ['extension', 'daemon'];
const MAX_BATCH = 200;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

export interface ApiResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
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
    if (!item || typeof item !== 'object') return { status: 400, body: 'invalid entry' };
    const e = item as Record<string, unknown>;
    if (typeof e.timestamp !== 'string' || !TS_REGEX.test(e.timestamp)) {
      return { status: 400, body: 'invalid timestamp' };
    }
    if (typeof e.level !== 'string' || !VALID_LEVELS.includes(e.level as LogLevel)) {
      return { status: 400, body: 'invalid level' };
    }
    if (typeof e.component !== 'string') return { status: 400, body: 'invalid component' };
    if (typeof e.message !== 'string') return { status: 400, body: 'invalid message' };
    if (e.stack != null && typeof e.stack !== 'string') return { status: 400, body: 'invalid stack' };
    validated.push({
      timestamp: e.timestamp,
      level: e.level as LogLevel,
      component: e.component,
      message: e.message,
      metadata: e.metadata ?? null,
      stack: (e.stack as string | undefined) ?? null,
    });
  }

  try {
    svc.insertBatch(validated, 'extension');
  } catch (err) {
    return { status: 500, body: `db error: ${(err as Error).message}` };
  }
  return { status: 204 };
}

function splitCsv(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function handleGetLogs(qs: URLSearchParams, svc: LogService): ApiResponse {
  const levelRaw = splitCsv(qs.get('level'));
  const sourceRaw = splitCsv(qs.get('source'));
  if (levelRaw?.some((l) => !VALID_LEVELS.includes(l as LogLevel))) {
    return { status: 400, body: 'invalid level' };
  }
  if (sourceRaw?.some((s) => !VALID_SOURCES.includes(s as LogSource))) {
    return { status: 400, body: 'invalid source' };
  }

  const rawLimit = qs.get('limit');
  const parsedLimit = rawLimit != null ? Number.parseInt(rawLimit, 10) : DEFAULT_LIMIT;
  const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT, MAX_LIMIT);

  const result = svc.queryLogs({
    level: levelRaw as LogLevel[] | undefined,
    source: sourceRaw as LogSource[] | undefined,
    q: qs.get('q') ?? undefined,
    since: qs.get('since') ?? undefined,
    until: qs.get('until') ?? undefined,
    limit,
    cursor: qs.get('cursor'),
  });
  return {
    status: 200,
    body: JSON.stringify(result),
    headers: { 'content-type': 'application/json' },
  };
}
