// Phase 6 S2 (Post-flight Debrief): 機体（Claude Code セッション）が最終応答に出力した
// 構造化デブリーフブロック（```debrief フェンス内 JSON）を transcript から抽出する純粋関数。
// 偽ブロック対策: assistant メッセージ（sidechain 除外）のみ走査し、最後に出現した 1 ブロックだけを
// JSON / enum / 型検証のうえ採用する。不正は null（機械集計のみへ縮退・Fail-open）。

import type { SelfAssessment } from '../model/flightReview';

const DEBRIEF_FENCE = /```debrief\s*\n([\s\S]*?)```/g;

const SELF_OUTCOMES = new Set(['achieved', 'partial', 'unachieved']);

const MAX_ITEMS = 20;
const MAX_ITEM_LENGTH = 500;

interface TranscriptLine {
  type?: string;
  isSidechain?: boolean;
  message?: { content?: unknown };
}

function lastDebriefJson(lines: Iterable<string>): string | null {
  let last: string | null = null;
  for (const raw of lines) {
    let entry: TranscriptLine;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) continue;
      entry = parsed as TranscriptLine;
    } catch {
      continue;
    }
    if (entry.type !== 'assistant' || entry.isSidechain === true) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const { type, text } = block as { type?: string; text?: string };
      if (type !== 'text' || typeof text !== 'string') continue;
      for (const match of text.matchAll(DEBRIEF_FENCE)) {
        last = match[1];
      }
    }
  }
  return last;
}

function sanitizeItems(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, MAX_ITEMS)
    .map((item) => item.slice(0, MAX_ITEM_LENGTH));
}

export function extractSelfAssessment(lines: Iterable<string>): SelfAssessment | null {
  const json = lastDebriefJson(lines);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // 破損 debrief は自己評価なし扱い（機械集計のみで記録される）
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { outcome, unresolvedItems, nextConcerns } = parsed as Record<string, unknown>;
  if (typeof outcome !== 'string' || !SELF_OUTCOMES.has(outcome)) return null;
  const unresolved = sanitizeItems(unresolvedItems);
  const concerns = sanitizeItems(nextConcerns);
  if (unresolved === null || concerns === null) return null;
  return {
    outcome: outcome as SelfAssessment['outcome'],
    unresolvedItems: unresolved,
    nextConcerns: concerns,
  };
}
