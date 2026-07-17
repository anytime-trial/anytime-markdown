// Phase 6 S1 (Flight Review): transcript JSONL 行からセッションの機械集計
// （所要時間・ツール呼出/失敗数・手戻り指標）を算出する純粋関数。
// ファイル I/O・DB は呼び出し側（trail-server）が担う。
// 手戻りは「同一ファイルへの 2 回目以降の Edit/Write」+「revert 系 Bash」の提示値であり、
// 成否判定には使わない（Level 3.5: 判断は人間。outcome は S1 では 'unknown' 固定）。

export interface FlightOutcomeAggregate {
  /** UTC ISO 8601。timestamp を持つ行が無ければ null */
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  toolCallCount: number;
  toolFailureCount: number;
  reworkCount: number;
}

const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'NotebookEdit']);

// 作業ツリーを過去状態へ戻す操作のみを対象にする（ブランチ切替の checkout は除外）
const REVERT_COMMAND_PATTERN = /\bgit\s+(?:restore|reset)\b|\bgit\s+checkout\s+(?:--|\.)/;

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

interface ContentBlock {
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
  is_error?: boolean;
}

function parseLine(raw: string): TranscriptLine | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as TranscriptLine;
  } catch {
    // transcript 末尾の書きかけ行・非 JSON 行は集計対象外として読み飛ばす
    return null;
  }
}

function contentBlocks(entry: TranscriptLine): ContentBlock[] {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is ContentBlock => typeof b === 'object' && b !== null);
}

export function computeFlightOutcome(lines: Iterable<string>): FlightOutcomeAggregate {
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let toolCallCount = 0;
  let toolFailureCount = 0;
  let reworkCount = 0;
  const editCountByFile = new Map<string, number>();

  for (const raw of lines) {
    const entry = parseLine(raw);
    if (!entry) continue;
    // サブエージェント（sidechain）の行はメインセッションの集計に含めない
    if (entry.isSidechain === true) continue;

    if (typeof entry.timestamp === 'string' && entry.timestamp !== '') {
      startedAt ??= entry.timestamp;
      endedAt = entry.timestamp;
    }

    for (const block of contentBlocks(entry)) {
      if (block.type === 'tool_use') {
        toolCallCount += 1;
        reworkCount += countRework(block, editCountByFile);
      } else if (block.type === 'tool_result' && block.is_error === true) {
        toolFailureCount += 1;
      }
    }
  }

  return {
    startedAt,
    endedAt,
    durationSeconds: computeDurationSeconds(startedAt, endedAt),
    toolCallCount,
    toolFailureCount,
    reworkCount,
  };
}

function countRework(block: ContentBlock, editCountByFile: Map<string, number>): number {
  const name = block.name ?? '';
  if (EDIT_TOOL_NAMES.has(name)) {
    const filePath = block.input?.file_path;
    if (typeof filePath !== 'string' || filePath === '') return 0;
    const next = (editCountByFile.get(filePath) ?? 0) + 1;
    editCountByFile.set(filePath, next);
    return next >= 2 ? 1 : 0;
  }
  if (name === 'Bash') {
    const command = block.input?.command;
    if (typeof command === 'string' && REVERT_COMMAND_PATTERN.test(command)) return 1;
  }
  return 0;
}

function computeDurationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (startedAt === null || endedAt === null) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}
