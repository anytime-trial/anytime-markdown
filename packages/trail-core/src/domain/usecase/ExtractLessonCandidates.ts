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

function extractFailureChains(lines: Iterable<string>): LessonCandidate[] {
  const nameByToolUseId = new Map<string, string>();
  const chains: LessonCandidate[] = [];
  let chainTools: string[] = [];

  const flush = (): void => {
    if (chainTools.length >= MIN_CHAIN_LENGTH) {
      const uniqueTools = [...new Set(chainTools)];
      chains.push({
        kind: 'tool_failure_chain',
        summary: `ツール失敗が ${chainTools.length} 回連続した`,
        evidence: uniqueTools.join(', '),
      });
    }
    chainTools = [];
  };

  for (const raw of lines) {
    let entry: TranscriptLine;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) continue;
      entry = parsed as TranscriptLine;
    } catch {
      continue;
    }
    if (entry.isSidechain === true) continue;
    for (const block of blocks(entry)) {
      if (block.type === 'tool_use' && typeof block.id === 'string') {
        nameByToolUseId.set(block.id, block.name ?? '(unknown)');
      } else if (block.type === 'tool_result') {
        if (block.is_error === true) {
          const toolUseId = block.tool_use_id ?? '';
          chainTools.push(nameByToolUseId.get(toolUseId) ?? '(unknown)');
        } else {
          flush();
        }
      }
    }
  }
  flush();
  return chains;
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
