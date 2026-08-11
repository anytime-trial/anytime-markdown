// Phase 6 S2 (Lesson Candidate Extraction): 失敗ツール連鎖とユーザー訂正から学習候補を
// 簡易ルールで抽出する純粋関数。採否判断は人間（S3 UI で提示。自動 memory 反映はしない）。

import type { LessonCandidate } from '../model/flightReview';

const MIN_CHAIN_LENGTH = 2;
const MAX_CANDIDATES = 20;

interface TranscriptLine {
  type?: string;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface LessonCandidateInput {
  lines: Iterable<string>;
  feedbackEntries: ReadonlyArray<{ promptExcerpt: string; matchedPattern: string }>;
}

function blocks(entry: TranscriptLine): ContentBlock[] {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is ContentBlock => typeof b === 'object' && b !== null);
}

/** 失敗連鎖の走査中に持ち回る可変状態（呼び出し先での更新を捨てないよう 1 オブジェクトに束ねる） */
interface FailureChainState {
  nameByToolUseId: Map<string, string>;
  chains: LessonCandidate[];
  chainTools: string[];
}

/** transcript の 1 行を JSON オブジェクトとして解釈する。壊れた行・非オブジェクトは null（読み飛ばす）。 */
function parseTranscriptLine(raw: string): TranscriptLine | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as TranscriptLine;
  } catch {
    // 壊れた JSON 行は走査対象から外すだけで、抽出全体は続行する
    return null;
  }
}

/** 連続失敗が閾値以上なら候補を確定させ、連鎖バッファを空に戻す。 */
function flushChain(state: FailureChainState): void {
  if (state.chainTools.length >= MIN_CHAIN_LENGTH) {
    const uniqueTools = [...new Set(state.chainTools)];
    state.chains.push({
      kind: 'tool_failure_chain',
      summary: `ツール失敗が ${state.chainTools.length} 回連続した`,
      evidence: uniqueTools.join(', '),
    });
  }
  state.chainTools = [];
}

/** tool_use / tool_result ブロック 1 個を連鎖状態へ反映する。成功した tool_result は連鎖を切る。 */
function applyBlockToChain(state: FailureChainState, block: ContentBlock): void {
  if (block.type === 'tool_use' && typeof block.id === 'string') {
    state.nameByToolUseId.set(block.id, block.name ?? '(unknown)');
  } else if (block.type === 'tool_result') {
    if (block.is_error === true) {
      const toolUseId = block.tool_use_id ?? '';
      state.chainTools.push(state.nameByToolUseId.get(toolUseId) ?? '(unknown)');
    } else {
      flushChain(state);
    }
  }
}

function extractFailureChains(lines: Iterable<string>): LessonCandidate[] {
  const state: FailureChainState = {
    nameByToolUseId: new Map<string, string>(),
    chains: [],
    chainTools: [],
  };

  for (const raw of lines) {
    const entry = parseTranscriptLine(raw);
    if (entry === null) continue;
    if (entry.isSidechain === true) continue;
    for (const block of blocks(entry)) {
      applyBlockToChain(state, block);
    }
  }
  flushChain(state);
  return state.chains;
}

export function extractLessonCandidates(input: LessonCandidateInput): LessonCandidate[] {
  const candidates: LessonCandidate[] = extractFailureChains(input.lines);
  for (const entry of input.feedbackEntries) {
    candidates.push({
      kind: 'user_correction',
      summary: `ユーザー修正指示（${entry.matchedPattern}）`,
      evidence: entry.promptExcerpt,
    });
  }
  return candidates.slice(0, MAX_CANDIDATES);
}
