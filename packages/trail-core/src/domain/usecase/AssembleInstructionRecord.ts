// Flight Record: 所属セッションの flight_reviews を「指示」1 行へ畳む純粋関数。
// DB アクセス・時刻取得は呼び出し側（trail-db / trail-server）が担う。
//
// 畳み方の要点:
//   - 所要時間は実働（duration_seconds）の合計で、startedAt〜endedAt の差ではない。
//     セッション間の空白（人が離席していた時間）を作業時間として計上しないため。
//   - 成否は最後のセッションを採るが unknown なら直近の非 unknown へ後退する。
//     Stop フックは常に行を作るため、最終セッションが自己評価を出さないだけで
//     達成済みの指示が「不明」に落ちるのを防ぐ。
//   - flight_reviews が 0 件でも行は成立させる。未記録（取込前）を「成果 0」に
//     見せないため、時間系は 0 ではなく null を返す。

import type { FlightOutcome, FlightOutcomeSource, FlightReview } from '../model/flightReview';
import type {
  Instruction,
  InstructionDeliverable,
  InstructionRecord,
  InstructionTokenUsage,
  InstructionVerificationRun,
} from '../model/instruction';

export interface AssembleInstructionRecordInput {
  instruction: Instruction;
  /** 所属セッションの flight_reviews。順序は問わない（本関数が endedAt で並べる）。 */
  reviews: readonly FlightReview[];
  /** instruction_sessions の件数。flight_reviews が未記録のセッションも数える。 */
  sessionCount: number;
  tokenUsage: InstructionTokenUsage;
  deliverables: readonly InstructionDeliverable[];
  /**
   * 所属セッションの検証実行（kind ごとに最新 1 件へ畳み済み）。
   * 省略可にしない: 渡し忘れが「検証を 1 つも実施していない指示」として画面に出てしまい、
   * 縮退と実データの区別がつかなくなるため。
   */
  verifications: readonly InstructionVerificationRun[];
}

/** JSON 配列文字列からタグ配列へ。壊れていれば空（他セッションのタグは残す）。 */
function parseTags(raw: string, sessionId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    console.warn(`[instruction] broken JSON in flight_reviews.tags (session=${sessionId})`);
    return [];
  }
}

function minIso(values: readonly (string | null)[]): string | null {
  const present = values.filter((v): v is string => v !== null && v !== '');
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a <= b ? a : b));
}

function maxIso(values: readonly (string | null)[]): string | null {
  const present = values.filter((v): v is string => v !== null && v !== '');
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a >= b ? a : b));
}

/** 成否は最終セッション優先。unknown なら直近の非 unknown へ後退する。 */
function foldOutcome(
  sortedByEndedAt: readonly FlightReview[],
): { outcome: FlightOutcome; outcomeSource: FlightOutcomeSource } {
  for (let i = sortedByEndedAt.length - 1; i >= 0; i -= 1) {
    const r = sortedByEndedAt[i];
    if (r !== undefined && r.outcome !== 'unknown') {
      return { outcome: r.outcome, outcomeSource: r.outcomeSource };
    }
  }
  return { outcome: 'unknown', outcomeSource: 'machine' };
}

/**
 * 同じファイルを指す 2 つの記録が同一のパス文字列になるとは限らない。
 *
 * コミット由来はリポジトリ相対（`spec/a.md`）、ツール呼出由来は絶対パス
 * （`/Shared/anytime-markdown-docs/spec/a.md`）で残るため、文字列の等値だけで畳むと
 * 同じ成果物が「コミット済み」と「未コミット」の 2 行に割れる（2026-08-05 実データで確認）。
 * 相対側が絶対側の末尾セグメント列と一致するかで同一判定する。
 */
function isSamePath(absoluteOrRelative: string, candidate: string): boolean {
  if (absoluteOrRelative === candidate) return true;
  const longer = absoluteOrRelative.length >= candidate.length ? absoluteOrRelative : candidate;
  const shorter = absoluteOrRelative.length >= candidate.length ? candidate : absoluteOrRelative;
  // セグメント境界で切れていることを要求する（'a/b.md' が 'xa/b.md' と一致しないように）
  return longer.endsWith(`/${shorter}`);
}

/**
 * 同一ファイルの重複を畳む。コミット済みを優先する（未コミットの痕跡で上書きしない）。
 * 取得側（trail-db）も同じ規則で畳む必要があるため公開する — 実装を 2 つ持つと
 * 片方だけ直したときに一覧と詳細で成果物の件数が食い違う。
 */
export function foldInstructionDeliverables(deliverables: readonly InstructionDeliverable[]): InstructionDeliverable[] {
  const kept: InstructionDeliverable[] = [];
  // コミット済みを先に確定させ、未コミットは同一ファイルが既にいなければ足す
  for (const d of deliverables) {
    if (!d.committed) continue;
    if (!kept.some((k) => isSamePath(k.filePath, d.filePath))) kept.push(d);
  }
  for (const d of deliverables) {
    if (d.committed) continue;
    if (!kept.some((k) => isSamePath(k.filePath, d.filePath))) kept.push(d);
  }
  return kept;
}

export function assembleInstructionRecord(input: AssembleInstructionRecordInput): InstructionRecord {
  const { instruction, reviews, sessionCount, tokenUsage, deliverables, verifications } = input;

  const sorted = [...reviews].sort((a, b) => (a.endedAt < b.endedAt ? -1 : a.endedAt > b.endedAt ? 1 : 0));

  const endedAt = maxIso(sorted.map((r) => r.endedAt));
  // startedAt が 1 件も無い場合、endedAt の最小へ縮退する（transcript 読取不能セッション）
  const startedAt = minIso(sorted.map((r) => r.startedAt)) ?? minIso(sorted.map((r) => r.endedAt));

  const durations = sorted.map((r) => r.durationSeconds).filter((d): d is number => d !== null);
  const durationSeconds = durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0);

  const tags: string[] = [];
  for (const r of sorted) {
    for (const tag of parseTags(r.tags, r.sessionId)) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }

  const { outcome, outcomeSource } = foldOutcome(sorted);

  return {
    instructionId: instruction.id,
    workspacePath: instruction.workspacePath,
    workspaceName: instruction.workspaceName,
    summary: instruction.summary,
    originPrompt: instruction.originPrompt,
    startedAt,
    endedAt,
    durationSeconds,
    outcome,
    outcomeSource,
    sessionCount,
    toolCallCount: sorted.reduce((sum, r) => sum + r.toolCallCount, 0),
    toolFailureCount: sorted.reduce((sum, r) => sum + r.toolFailureCount, 0),
    reworkCount: sorted.reduce((sum, r) => sum + r.reworkCount, 0),
    tags,
    closedAt: instruction.closedAt,
    tokenUsage,
    deliverables: foldInstructionDeliverables(deliverables),
    verifications: [...verifications],
  };
}
