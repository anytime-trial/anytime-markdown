import type { TrailMessage, TrailSession, TrailToolCall, ToolMetrics } from '../parser/types';

export const LANE_TOOL_CATS = ['bash', 'edit', 'write', 'read', 'task', 'other'] as const;
export type LaneTool = (typeof LANE_TOOL_CATS)[number];

export type ChartEntry = {
  date: string; fullDate: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  actualCost: number; skillCost: number;
  linesAdded: number; linesDeleted: number;
  overlayValue: number | null;
};

const MAX_STACKED_SERIES = 10;
const OTHERS_LABEL = 'Others';

export function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const rawStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const step = Math.max(1, rawStep);
  const values: number[] = [];
  const end = Math.ceil(max / step) * step;
  for (let v = 0; v <= end + step / 2; v += step) values.push(v);
  return values;
}

export function sessionCost(s: TrailSession): number {
  return s.estimatedCostUsd ?? 0;
}

export function countCompactDrops(msgs: readonly TrailMessage[]): number {
  const MIN_BEFORE = 50_000;
  const DROP_RATIO = 0.3;
  let count = 0;
  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1].usage?.cacheReadTokens ?? 0;
    const cur = msgs[i].usage?.cacheReadTokens ?? 0;
    if (prev >= MIN_BEFORE && cur <= prev * DROP_RATIO) count++;
  }
  return count;
}

export function parseCommitSubject(cmd: string): string {
  const heredocMatch = /<<'?EOF'?\n([\s\S]+?)\n\s*EOF/.exec(cmd);
  if (heredocMatch) return heredocMatch[1].trim().split('\n')[0].trim();
  const simpleMatch = /-m\s+"((?:[^"\\]|\\.)*)"/.exec(cmd);
  if (simpleMatch) return simpleMatch[1].replace(/\\n/g, '\n').split('\n')[0].trim();
  return '';
}

export function extractPrefixWithScope(subject: string): string {
  const match = /^([a-z]+(?:\([^)]*\))?!?):/i.exec(subject);
  return match ? match[1] : subject.slice(0, 40);
}

export function laneClassifyTool(name: string): LaneTool {
  if (name === 'Bash') return 'bash';
  if (name === 'Edit' || name === 'MultiEdit') return 'edit';
  if (name === 'Write') return 'write';
  if (name === 'Read' || name === 'Glob' || name === 'Grep') return 'read';
  if (name === 'Task' || name.startsWith('mcp__')) return 'task';
  return 'other';
}

export function mergeRuns<T>(values: readonly T[]): Array<{ value: T; start: number; end: number }> {
  const runs: Array<{ value: T; start: number; end: number }> = [];
  for (let i = 0; i < values.length; i++) {
    const last = runs.at(-1);
    if (last && last.value === values[i]) {
      last.end = i;
    } else {
      runs.push({ value: values[i], start: i, end: i });
    }
  }
  return runs;
}

export function dominantTool(toolCalls: readonly TrailToolCall[] | undefined): LaneTool | '' {
  if (!toolCalls || toolCalls.length === 0) return '';
  for (const cat of LANE_TOOL_CATS) {
    if (toolCalls.some((tc) => laneClassifyTool(tc.name) === cat)) return cat;
  }
  return '';
}

export function mergeToolMetrics(metrics: readonly (ToolMetrics | null)[]): ToolMetrics | null {
  const valid = metrics.filter((m): m is ToolMetrics => m !== null);
  if (valid.length === 0) return null;

  function mergeUsage<T extends { count: number; tokens: number; durationMs: number }>(
    arrays: readonly (readonly T[] | undefined)[],
    getKey: (e: T) => string,
    makeEntry: (key: string, acc: { count: number; tokens: number; durationMs: number }) => T,
  ): T[] {
    const map = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const arr of arrays) {
      for (const e of arr ?? []) {
        const k = getKey(e);
        const acc = map.get(k) ?? { count: 0, tokens: 0, durationMs: 0 };
        acc.count += e.count;
        acc.tokens += e.tokens;
        acc.durationMs += e.durationMs;
        map.set(k, acc);
      }
    }
    return [...map.entries()].map(([k, acc]) => makeEntry(k, acc));
  }

  const errMap = new Map<string, number>();
  for (const m of valid) {
    for (const e of m.errorsByTool ?? []) {
      errMap.set(e.tool, (errMap.get(e.tool) ?? 0) + e.count);
    }
  }

  return {
    totalRetries: valid.reduce((s, m) => s + m.totalRetries, 0),
    totalEdits: valid.reduce((s, m) => s + m.totalEdits, 0),
    totalBuildRuns: valid.reduce((s, m) => s + m.totalBuildRuns, 0),
    totalBuildFails: valid.reduce((s, m) => s + m.totalBuildFails, 0),
    totalTestRuns: valid.reduce((s, m) => s + m.totalTestRuns, 0),
    totalTestFails: valid.reduce((s, m) => s + m.totalTestFails, 0),
    toolUsage: mergeUsage(valid.map((m) => m.toolUsage), (e) => e.tool, (tool, acc) => ({ tool, ...acc })),
    skillUsage: mergeUsage(valid.map((m) => m.skillUsage), (e) => e.skill, (skill, acc) => ({ skill, ...acc })),
    errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })),
    modelUsage: mergeUsage(valid.map((m) => m.modelUsage), (e) => e.model, (model, acc) => ({ model, ...acc })),
  };
}

export function toFridayWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay();
  const daysSinceFri = (dow + 2) % 7;
  const friday = new Date(d);
  friday.setDate(d.getDate() - daysSinceFri);
  const y = friday.getFullYear();
  const m = String(friday.getMonth() + 1).padStart(2, '0');
  const day = String(friday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupByWeek(entries: readonly ChartEntry[]): ChartEntry[] {
  const map = new Map<string, ChartEntry & { _overlayCount: number }>();
  for (const d of entries) {
    const key = toFridayWeekKey(d.fullDate);
    const e = map.get(key) ?? { date: key.slice(5), fullDate: key, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, actualCost: 0, skillCost: 0, linesAdded: 0, linesDeleted: 0, overlayValue: null, _overlayCount: 0 };
    e.inputTokens += d.inputTokens;
    e.outputTokens += d.outputTokens;
    e.cacheReadTokens += d.cacheReadTokens;
    e.cacheCreationTokens += d.cacheCreationTokens;
    e.actualCost += d.actualCost;
    e.skillCost += d.skillCost;
    e.linesAdded += d.linesAdded;
    e.linesDeleted += d.linesDeleted;
    if (d.overlayValue != null) {
      e.overlayValue = (e.overlayValue ?? 0) + d.overlayValue;
      e._overlayCount += 1;
    }
    map.set(key, e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => {
    const { _overlayCount, overlayValue, ...rest } = v;
    return { ...rest, overlayValue: _overlayCount > 0 && overlayValue != null ? overlayValue / _overlayCount : null };
  });
}

export function capTopN(
  totals: ReadonlyMap<string, number>,
  topN = MAX_STACKED_SERIES,
): { displayKeys: string[]; keyMap: Map<string, string> } {
  const sorted = [...totals.entries()].sort(([, a], [, b]) => b - a).map(([k]) => k);
  const keyMap = new Map<string, string>();
  if (sorted.length <= topN) {
    for (const k of sorted) keyMap.set(k, k);
    return { displayKeys: sorted, keyMap };
  }
  const top = sorted.slice(0, topN);
  const topSet = new Set(top);
  for (const k of sorted) keyMap.set(k, topSet.has(k) ? k : OTHERS_LABEL);
  return { displayKeys: [...top, OTHERS_LABEL], keyMap };
}
