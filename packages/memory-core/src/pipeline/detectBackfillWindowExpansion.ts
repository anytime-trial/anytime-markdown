import type { MemoryDbConnection } from '../db/connection/types';

export interface DetectBackfillWindowExpansionInput {
  /** memory-core.db への接続。trail DB が "trail" として ATTACH 済みであること。 */
  db: MemoryDbConnection;
  /** 現在 config が要求する backfill 期間 (日)。 */
  sinceDays: number;
}

export interface DetectBackfillWindowExpansionResult {
  /** カーソル reset が必要かどうか。 */
  shouldExpand: boolean;
  /** UI / ログ向けの理由文。 */
  reason: string;
}

/**
 * config の backfillDays が広がった結果、memory_episodes でカバーされていない
 * 過去メッセージが trail.db 側に存在するかを検出する。
 *
 * - memory_episodes.MIN(valid_from) を「現在カバー済みの最古地点」とみなす
 * - desired_start = now - sinceDays * 1day を「望むカバー開始地点」とする
 * - desired_start < earliest かつ trail.messages にその区間で
 *   未処理の user メッセージがあれば shouldExpand=true を返す
 *
 * これにより config の backfillDays を 30 → 60 へ広げただけで自動的に
 * カーソル reset → 再 backfill のフローが回せるようになる。一方
 * "install 後 3 日しか経っていない" 等の正当に過去データが無いケースでは
 * 誤検知しない (no unprocessed)。
 *
 * 純関数として副作用なし。実際の cursor reset 操作は caller の責務。
 */
export function detectBackfillWindowExpansion(
  input: DetectBackfillWindowExpansionInput,
): DetectBackfillWindowExpansionResult {
  const { db, sinceDays } = input;
  const desiredStart = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  // 現在カバー済みの最古 episode timestamp
  const earliestRows = db.exec(`SELECT MIN(valid_from) AS earliest FROM memory_episodes`);
  const earliest = (earliestRows[0]?.values?.[0]?.[0] as string | null) ?? null;

  if (earliest === null) {
    return {
      shouldExpand: false,
      reason: 'no persisted episodes (treated as fresh install / first run)',
    };
  }

  if (desiredStart >= earliest) {
    return {
      shouldExpand: false,
      reason: `desired_start ${desiredStart} >= earliest persisted ${earliest} (window did not widen)`,
    };
  }

  // 拡張区間 [desired_start, earliest) に未処理 user メッセージがあるか
  const countRows = db.exec(
    `SELECT COUNT(*) AS c
       FROM trail.messages
      WHERE timestamp >= ?
        AND timestamp < ?
        AND type = 'user'`,
    [desiredStart, earliest],
  );
  const unprocessedCount = (countRows[0]?.values?.[0]?.[0] as number) ?? 0;

  if (unprocessedCount === 0) {
    return {
      shouldExpand: false,
      reason: `no unprocessed user messages in [${desiredStart}, ${earliest})`,
    };
  }

  return {
    shouldExpand: true,
    reason: `${unprocessedCount} user messages in [${desiredStart}, ${earliest}) require backfill (window expanded)`,
  };
}
