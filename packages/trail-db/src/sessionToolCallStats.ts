import { asText } from './sqlValue';

/**
 * セッションの `tool_calls` 行から、編集・やり直し・ビルド / テストの実行と失敗を数える純粋関数。
 *
 * 入力は `[session_id, tool_calls(JSON), tool_result]` の行配列（SQL の生値）。
 * 壊れた JSON や配列でない `tool_calls` は**行ごと捨てる**（例外を投げず集計を続ける）。
 *
 * 「やり直し」は同一セッション内で同じファイルを繰り返し編集した回数（2 回目以降）で、
 * セッションを跨いだ同名ファイルの編集は数えない。`file_path` の無い編集は編集回数には入るが
 * やり直し判定には入らない（どのファイルを直したか分からないため）。
 */

const BUILD_RE = /\b(npm run build|npx tsc|tsc\b|webpack|vite build|esbuild|rollup)\b/;
const TEST_RE = /\b(jest|vitest|npm run test|npm test|npx jest)\b/;
const FAIL_RE = /ERR!|exit code [1-9]|non-zero exit|Command failed/i;

export interface SessionToolCallStats {
  totalEdits: number;
  totalRetries: number;
  totalBuildRuns: number;
  totalBuildFails: number;
  totalTestRuns: number;
  totalTestFails: number;
}

interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
}

/** セッション → ファイル → 編集回数。やり直し数の算出にだけ使う。 */
type EditsBySession = Map<string, Map<string, number>>;

/** 壊れた JSON・配列でない値は null（＝その行を捨てる）。 */
function parseToolCalls(json: string): ToolCall[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return Array.isArray(parsed) ? (parsed as ToolCall[]) : null;
}

function stringInput(call: ToolCall, key: string): string {
  const value = call.input?.[key];
  return typeof value === 'string' ? value : '';
}

/** 行の tool_result が失敗を示すか。null（結果なし）は失敗にしない。 */
function isFailedResult(toolResult: unknown): boolean {
  if (toolResult == null) return false;
  return FAIL_RE.test(asText(toolResult));
}

function recordEdit(call: ToolCall, sessionId: string, edits: EditsBySession): void {
  const filePath = stringInput(call, 'file_path');
  if (!filePath) return;
  let fileMap = edits.get(sessionId);
  if (!fileMap) {
    fileMap = new Map();
    edits.set(sessionId, fileMap);
  }
  fileMap.set(filePath, (fileMap.get(filePath) ?? 0) + 1);
}

/** ビルド / テストは排他ではない（`npm run build && npm test` は両方に数える）。 */
function countBash(cmd: string, failed: boolean, stats: SessionToolCallStats): void {
  if (BUILD_RE.test(cmd)) {
    stats.totalBuildRuns++;
    if (failed) stats.totalBuildFails++;
  }
  if (TEST_RE.test(cmd)) {
    stats.totalTestRuns++;
    if (failed) stats.totalTestFails++;
  }
}

function countCall(
  call: ToolCall,
  sessionId: string,
  failed: boolean,
  stats: SessionToolCallStats,
  edits: EditsBySession,
): void {
  if (call.name === 'Edit' || call.name === 'Write') {
    stats.totalEdits++;
    recordEdit(call, sessionId, edits);
  }
  if (call.name === 'Bash') {
    countBash(stringInput(call, 'command'), failed, stats);
  }
}

/** 同一ファイルの 2 回目以降を「やり直し」として合算する。 */
function sumRetries(edits: EditsBySession): number {
  let retries = 0;
  for (const fileMap of edits.values()) {
    for (const count of fileMap.values()) {
      if (count > 1) retries += count - 1;
    }
  }
  return retries;
}

export function analyzeSessionToolCallRows(rows: unknown[][]): SessionToolCallStats {
  const stats: SessionToolCallStats = {
    totalEdits: 0,
    totalRetries: 0,
    totalBuildRuns: 0,
    totalBuildFails: 0,
    totalTestRuns: 0,
    totalTestFails: 0,
  };
  const edits: EditsBySession = new Map();

  for (const row of rows) {
    const calls = parseToolCalls(String(row[1]));
    if (!calls) continue;
    const sessionId = String(row[0]);
    // 失敗判定は行単位（同じ行の build と test は同じ tool_result を見る）。
    const failed = isFailedResult(row[2]);
    for (const call of calls) {
      countCall(call, sessionId, failed, stats, edits);
    }
  }

  stats.totalRetries = sumRetries(edits);
  return stats;
}
