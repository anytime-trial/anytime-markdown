export type UsageSeverity = 'normal' | 'warn' | 'critical';

export interface UsageLimitRow {
  readonly key: string;
  readonly label: string;
  readonly percent: number;
  readonly severity: UsageSeverity;
  readonly resetsAt: string | null;
}

const WARN_PERCENT = 80;
const CRITICAL_PERCENT = 95;
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

type KnownLimitKind = 'session' | 'weekly_all' | 'weekly_scoped';

interface LimitSpec {
  readonly key: string;
  readonly label: string;
}

const LIMIT_SPECS: Record<Exclude<KnownLimitKind, 'weekly_scoped'>, LimitSpec> = {
  session: { key: 'session', label: 'Session (5h)' },
  weekly_all: { key: 'weekly_all', label: 'Weekly (all)' },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.round(value)));
}

function normalizeReset(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function severityRank(severity: UsageSeverity): number {
  if (severity === 'critical') return 2;
  if (severity === 'warn') return 1;
  return 0;
}

function severityFromPercent(percent: number): UsageSeverity {
  if (percent >= CRITICAL_PERCENT) return 'critical';
  if (percent >= WARN_PERCENT) return 'warn';
  return 'normal';
}

function normalizeSeverity(rawSeverity: unknown, percent: number): UsageSeverity {
  const responseSeverity: UsageSeverity = rawSeverity === 'normal' ? 'normal' : 'warn';
  const thresholdSeverity = severityFromPercent(percent);
  return severityRank(thresholdSeverity) > severityRank(responseSeverity)
    ? thresholdSeverity
    : responseSeverity;
}

function scopedModelName(limit: Record<string, unknown>): string | null {
  const scope = limit.scope;
  if (!isRecord(scope)) return null;
  const model = scope.model;
  if (!isRecord(model)) return null;
  const displayName = model.display_name;
  return typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;
}

function parseLimit(limit: unknown): UsageLimitRow | null {
  if (!isRecord(limit)) {
    return null;
  }
  const kind = limit.kind;
  if (kind !== 'session' && kind !== 'weekly_all' && kind !== 'weekly_scoped') {
    return null;
  }
  const percent = clampPercent(limit.percent);
  if (percent === null) {
    return null;
  }
  if (kind === 'weekly_scoped') {
    const modelName = scopedModelName(limit) ?? 'scoped';
    return {
      key: `weekly_scoped:${modelName}`,
      label: `Weekly (${modelName})`,
      percent,
      severity: normalizeSeverity(limit.severity, percent),
      resetsAt: normalizeReset(limit.resets_at),
    };
  }
  const spec = LIMIT_SPECS[kind];
  return {
    key: spec.key,
    label: spec.label,
    percent,
    severity: normalizeSeverity(limit.severity, percent),
    resetsAt: normalizeReset(limit.resets_at),
  };
}

function parseLimits(value: unknown): UsageLimitRow[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const rows = value
    .map(parseLimit)
    .filter((row): row is UsageLimitRow => row !== null);
  return rows.length > 0 ? rows : null;
}

function parseFallbackRow(
  source: unknown,
  key: Exclude<KnownLimitKind, 'weekly_scoped'>,
): UsageLimitRow | null {
  if (!isRecord(source)) {
    return null;
  }
  const percent = clampPercent(source.utilization);
  if (percent === null) {
    return null;
  }
  const spec = LIMIT_SPECS[key];
  return {
    key: spec.key,
    label: spec.label,
    percent,
    severity: severityFromPercent(percent),
    resetsAt: normalizeReset(source.resets_at),
  };
}

function parseFallback(input: Record<string, unknown>): UsageLimitRow[] | null {
  const rows = [
    parseFallbackRow(input.five_hour, 'session'),
    parseFallbackRow(input.seven_day, 'weekly_all'),
  ].filter((row): row is UsageLimitRow => row !== null);
  return rows.length > 0 ? rows : null;
}

export function parseClaudeUsage(input: unknown): UsageLimitRow[] | null {
  if (!isRecord(input)) {
    return null;
  }
  const rows = parseLimits(input.limits);
  if (rows !== null) {
    return rows;
  }
  // kind の改名・新種追加で limits を 1 行も解釈できなくなっても、five_hour / seven_day が
  // 残っていれば劣化表示で持ちこたえる（枠が丸ごと消えるより、粒度が粗くても出るほうが有用）。
  return parseFallback(input);
}
