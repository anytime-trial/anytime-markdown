// domain/usecase/BackfillMessageCommits.ts — match JSONL messages to git commits

import type { TrailMessage, TrailSessionCommit, MessageCommitMatchConfidence } from '../model/session';

export interface MessageCommitMatch {
  readonly messageUuid: string;
  readonly commitHash: string;
  readonly matchConfidence: MessageCommitMatchConfidence;
}

const HIGH_THRESHOLD_MS = 10_000;
const MEDIUM_THRESHOLD_MS = 10_000;
const LOW_THRESHOLD_MS = 30_000;

function hasGitCommitInBash(msg: TrailMessage): boolean {
  return (msg.toolCalls ?? []).some(
    (tc) => tc.name === 'Bash' && typeof tc.input?.command === 'string'
      && tc.input.command.includes('git commit'),
  );
}

function hasBashTool(msg: TrailMessage): boolean {
  return (msg.toolCalls ?? []).some((tc) => tc.name === 'Bash');
}

// assistant の親チェーンを遡って最初の user メッセージ UUID を返す。
// Why: message_commits.message_uuid は DORA 指標（Lead Time / Success Rate）の計算で
// 「user プロンプトの UUID」と突き合わされる。assistant UUID のまま保存すると照合が常に
// 失敗し、成功率 0 / サンプル数 0 になる（指標バグ）。
function resolveUserAncestorUuid(
  startUuid: string,
  messageByUuid: ReadonlyMap<string, TrailMessage>,
): string | null {
  const visited = new Set<string>();
  let cursor: TrailMessage | undefined = messageByUuid.get(startUuid);
  while (cursor && !visited.has(cursor.uuid)) {
    if (cursor.type === 'user') return cursor.uuid;
    visited.add(cursor.uuid);
    if (!cursor.parentUuid) return null;
    cursor = messageByUuid.get(cursor.parentUuid);
  }
  return null;
}

type AssistantMatch = {
  readonly assistantUuid: string;
  readonly confidence: MessageCommitMatchConfidence;
};

/**
 * Search assistant messages in reverse-chronological order within the given
 * time window. Returns the first message that satisfies `predicate`, or null.
 */
function findLatestInWindow(
  commitMs: number,
  thresholdMs: number,
  assistantMessages: readonly TrailMessage[],
  predicate: (m: TrailMessage) => boolean,
): TrailMessage | null {
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const m = assistantMessages[i];
    const msgMs = Date.parse(m.timestamp);
    if (Number.isNaN(msgMs) || msgMs > commitMs) continue;
    if (commitMs - msgMs > thresholdMs) break;
    if (predicate(m)) return m;
  }
  return null;
}

function findAssistantMatch(
  commitMs: number,
  assistantMessages: readonly TrailMessage[],
): AssistantMatch | null {
  // 優先度1: git commit を含む Bash
  const highMatch = findLatestInWindow(commitMs, HIGH_THRESHOLD_MS, assistantMessages, hasGitCommitInBash);
  if (highMatch) return { assistantUuid: highMatch.uuid, confidence: 'high' };

  // 優先度2: Bash を含む
  const medMatch = findLatestInWindow(commitMs, MEDIUM_THRESHOLD_MS, assistantMessages, hasBashTool);
  if (medMatch) return { assistantUuid: medMatch.uuid, confidence: 'medium' };

  // 優先度3: 任意の assistant メッセージ
  const lowMatch = findLatestInWindow(commitMs, LOW_THRESHOLD_MS, assistantMessages, () => true);
  if (lowMatch) return { assistantUuid: lowMatch.uuid, confidence: 'low' };

  return null;
}

export function matchCommitsToMessages(
  messages: readonly TrailMessage[],
  commits: readonly TrailSessionCommit[],
): readonly MessageCommitMatch[] {
  const messageByUuid = new Map(messages.map((m) => [m.uuid, m]));
  const assistantMessages = messages
    .filter((m) => m.type === 'assistant')
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const matches: MessageCommitMatch[] = [];

  for (const commit of commits) {
    const commitMs = Date.parse(commit.committedAt);
    if (Number.isNaN(commitMs)) continue;

    const assistantMatch = findAssistantMatch(commitMs, assistantMessages);
    if (!assistantMatch) continue;

    const userUuid = resolveUserAncestorUuid(assistantMatch.assistantUuid, messageByUuid);
    if (!userUuid) continue;

    matches.push({
      messageUuid: userUuid,
      commitHash: commit.commitHash,
      matchConfidence: assistantMatch.confidence,
    });
  }

  return matches;
}
