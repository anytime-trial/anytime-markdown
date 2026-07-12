// agent-core `src/codex/parseCodexRollout.ts` のローカルミラー（同期必須）。
//
// vscode-common は agent-core を import しない（agent-core のバレルは node:sqlite を含み、
// CommonJS では vscode-common を消費する全拡張のバンドルに node:sqlite を巻き込むため。
// types.ts の AgentStatusSource コメント参照）。この純粋関数群は FS 非依存・依存ゼロのため、
// 境界を跨がず複製する。仕様の正本は agent-core 側（TDD 済み）。rollout 形式が変わったら両方更新する。

export interface CodexSessionMeta {
  readonly sessionId: string;
  readonly cwd: string;
  /** UTC ISO 8601。セッション開始時刻 */
  readonly startedAt: string;
}

export type CodexUsageSeverity = 'normal' | 'warn' | 'critical';

export interface CodexRateLimitRow {
  readonly key: string;
  readonly label: string;
  readonly percent: number;
  readonly severity: CodexUsageSeverity;
  readonly resetsAt: string | null;
}

export interface CodexRateLimitSnapshot {
  readonly observedAt: string;
  readonly rows: readonly CodexRateLimitRow[];
}

const WARN_PERCENT = 80;
const CRITICAL_PERCENT = 95;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const SECONDS_TO_MS = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeParseLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** 先頭 `session_meta` 行から sessionId / cwd / startedAt を抽出。入力契約は改行まで含む完全な先頭行。 */
export function parseCodexSessionMeta(firstLine: string): CodexSessionMeta | null {
  const parsed = safeParseLine(firstLine);
  if (!isRecord(parsed) || parsed.type !== 'session_meta') return null;
  const payload = parsed.payload;
  if (!isRecord(payload)) return null;
  const sessionId = payload.id;
  const cwd = payload.cwd;
  if (typeof sessionId !== 'string' || sessionId === '' || typeof cwd !== 'string' || cwd === '') {
    return null;
  }
  const payloadTs = typeof payload.timestamp === 'string' ? payload.timestamp : '';
  const lineTs = typeof parsed.timestamp === 'string' ? parsed.timestamp : '';
  return { sessionId, cwd, startedAt: payloadTs || lineTs };
}

function extractInputTokens(parsed: unknown): number | null {
  if (!isRecord(parsed) || parsed.type !== 'event_msg') return null;
  const payload = parsed.payload;
  if (!isRecord(payload) || payload.type !== 'token_count') return null;
  const info = payload.info;
  if (!isRecord(info)) return null;
  const last = info.last_token_usage;
  if (!isRecord(last)) return null;
  const input = last.input_tokens;
  return typeof input === 'number' ? input : null;
}

function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(value)));
}

function severityFromPercent(percent: number): CodexUsageSeverity {
  if (percent >= CRITICAL_PERCENT) return 'critical';
  if (percent >= WARN_PERCENT) return 'warn';
  return 'normal';
}

function normalizeEpochSeconds(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value * SECONDS_TO_MS);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatWindowDuration(minutes: number): string {
  if (minutes > 0 && minutes % MINUTES_PER_DAY === 0) return `${minutes / MINUTES_PER_DAY}d`;
  if (minutes > 0 && minutes % MINUTES_PER_HOUR === 0) return `${minutes / MINUTES_PER_HOUR}h`;
  return `${minutes}min`;
}

function normalizeWindowMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function parseRateLimitRow(source: unknown, key: string, labelPrefix: string): CodexRateLimitRow | null {
  if (!isRecord(source)) return null;
  const percent = clampPercent(source.used_percent);
  const windowMinutes = normalizeWindowMinutes(source.window_minutes);
  if (percent === null || windowMinutes === null) return null;
  return {
    key,
    label: `${labelPrefix} (${formatWindowDuration(windowMinutes)})`,
    percent,
    severity: severityFromPercent(percent),
    resetsAt: normalizeEpochSeconds(source.resets_at),
  };
}

function extractRateLimits(parsed: unknown): CodexRateLimitSnapshot | null {
  if (!isRecord(parsed) || parsed.type !== 'event_msg' || typeof parsed.timestamp !== 'string') return null;
  const payload = parsed.payload;
  if (!isRecord(payload) || payload.type !== 'token_count') return null;
  const rateLimits = payload.rate_limits;
  if (!isRecord(rateLimits)) return null;
  const rows = [
    parseRateLimitRow(rateLimits.primary, 'session', 'Session'),
    parseRateLimitRow(rateLimits.secondary, 'weekly_all', 'Weekly'),
  ].filter((row): row is CodexRateLimitRow => row !== null);
  return rows.length > 0 ? { observedAt: parsed.timestamp, rows } : null;
}

function extractTotalTokens(parsed: unknown): number | null {
  if (!isRecord(parsed) || parsed.type !== 'event_msg') return null;
  const payload = parsed.payload;
  if (!isRecord(payload) || payload.type !== 'token_count') return null;
  const info = payload.info;
  if (!isRecord(info)) return null;
  const total = info.total_token_usage;
  if (!isRecord(total)) return null;
  const tokens = total.total_tokens;
  return typeof tokens === 'number' && Number.isFinite(tokens) ? tokens : null;
}

/** tail を走査し最後の token_count の last_token_usage.input_tokens を返す。無ければ null（不明）。 */
export function extractCodexContextTokens(tailText: string): number | null {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const tokens = extractInputTokens(safeParseLine(lines[i]));
    if (tokens !== null) return tokens;
  }
  return null;
}

export function extractCodexRateLimits(tailText: string): CodexRateLimitSnapshot | null {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const snapshot = extractRateLimits(safeParseLine(lines[i]));
    if (snapshot !== null) return snapshot;
  }
  return null;
}

export function extractCodexTotalTokens(tailText: string): number | null {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const tokens = extractTotalTokens(safeParseLine(lines[i]));
    if (tokens !== null) return tokens;
  }
  return null;
}

/** tail の最後に現れる timestamp（最終アクティビティ）を返す。無ければ空文字。 */
export function extractCodexLastActivity(tailText: string): string {
  const lines = tailText.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = safeParseLine(lines[i]);
    if (isRecord(parsed) && typeof parsed.timestamp === 'string' && parsed.timestamp !== '') {
      return parsed.timestamp;
    }
  }
  return '';
}
