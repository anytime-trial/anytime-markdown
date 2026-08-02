import type { MemoryDbConnection } from '../db/connection/types';
import type { MemoryLogger } from '../logger';

export type ReviewTargetHint = {
  target_ref: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
};

type Priority = ReviewTargetHint['priority'];

const PRIORITY_ORDER: readonly Priority[] = ['high', 'medium', 'low'];

// 優先度ごとの枠の比率。high 候補（未対処レビュー指摘 + 直近 30 日の regression fix）は
// 実 DB で数百件に達するため、素直に上から詰めると medium / low が一度も返らない。
// 呼び出し側からは「該当なし」と区別が付かないので、優先度ごとに枠を割り当てる。
const QUOTA_RATIO: Record<Priority, number> = { high: 0.5, medium: 0.35, low: 0.15 };

// 時刻比較は strftime('%Y-%m-%dT%H:%M:%SZ', ...) で ISO 8601 の閾値を作る（列は T/Z 付きで
// 格納されるため datetime() の 'YYYY-MM-DD HH:MM:SS' とは比較できない）。閾値にミリ秒が
// 付かないため、境界の 1 秒内にあるミリ秒付きの行は文字列比較で「小さい」と判定され得る
// （'.' < 'Z'）。日単位の窓では影響が無いため、既知の不精度として許容する。
export function listReviewTargetHints(input: {
  db: MemoryDbConnection;
  limit?: number;
  logger: MemoryLogger;
}): ReviewTargetHint[] {
  const { db, limit: requestedLimit = 20, logger } = input;
  // 非整数・負値は枠計算（Math.floor(limit * ratio)）と slice を壊す。負値は枠が負に
  // なって配分が破綻し、変更前は slice(0, -n) が「末尾 n 件を落とした全件」を返していた。
  const limit = Math.max(0, Math.floor(requestedLimit));
  const buckets: Record<Priority, ReviewTargetHint[]> = { high: [], medium: [], low: [] };
  const seen = new Set<string>();

  function add(ref: string, priority: Priority, reason: string) {
    if (!seen.has(ref)) {
      seen.add(ref);
      buckets[priority].push({ target_ref: ref, priority, reason });
    }
  }

  function addScalarRows(
    sql: string,
    priority: Priority,
    reason: string,
    onError: string,
  ): void {
    try {
      const rows = db.exec(sql);
      for (const row of rows[0]?.values ?? []) {
        const ref = row[0] as string;
        if (ref) add(ref, priority, reason);
      }
    } catch (err) {
      logger.error(`[listReviewTargetHints] ${onError}: ${String(err)}`);
    }
  }

  // High: files from unresolved review_unfixed / recurring_review_finding drift events
  try {
    const driftRows = db.exec(
      `SELECT DISTINCT detail_json FROM memory_drift_events
       WHERE drift_type IN ('review_unfixed', 'recurring_review_finding')
         AND resolved_at IS NULL`,
    );
    for (const row of driftRows[0]?.values ?? []) {
      try {
        const detail = JSON.parse(row[0] as string);
        const ref: string | undefined = detail.target_file_path ?? detail.grouping_value;
        if (ref) add(ref, 'high', 'unresolved review finding drift');
      } catch {
        /* skip malformed detail_json */
      }
    }
  } catch (err) {
    logger.error(`[listReviewTargetHints] drift query failed: ${String(err)}`);
  }

  // High: files with regression fixes in the last 30 days
  // category を絞らないと通常の fix コミットまで high に入り、仕様（memory-core.ja.md §6.5.2
  // 「直近 30 日に regression fix が発生した file」）から外れて high が数百件に膨らむ。
  addScalarRows(
    `SELECT DISTINCT je.value
     FROM memory_bug_fixes bf, json_each(bf.affected_file_paths_json) je
     WHERE bf.category = 'regression'
       AND bf.committed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')`,
    'high',
    'regression fix in last 30 days',
    'bug query failed',
  );

  // Medium: spec/code files changed in the last 7 days (memory_code_facts)
  addScalarRows(
    `SELECT DISTINCT file_path FROM memory_code_facts
     WHERE recorded_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
     LIMIT 50`,
    'medium',
    'code changed in last 7 days',
    'code query failed',
  );

  // Low: files without a review in the last 90 days
  addScalarRows(
    `SELECT DISTINCT je.value
     FROM memory_code_facts cf, json_each('["' || REPLACE(cf.file_path, ',', '","') || '"]') je
     WHERE cf.file_path NOT IN (
       SELECT DISTINCT rf.target_file_path FROM memory_review_findings rf
       WHERE rf.recorded_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days')
         AND rf.target_file_path IS NOT NULL
     )
     LIMIT 50`,
    'low',
    'no review in last 90 days',
    'unreviewed query failed',
  );

  return selectWithinQuota(buckets, limit);
}

/**
 * 優先度ごとの枠で詰め、余った枠を優先度順に再配分する。
 * 候補が枠に満たない優先度があっても総数は `limit` を下回らない（候補総数が足りない場合を除く）。
 */
function selectWithinQuota(
  buckets: Record<Priority, ReviewTargetHint[]>,
  limit: number,
): ReviewTargetHint[] {
  const taken: Record<Priority, number> = { high: 0, medium: 0, low: 0 };
  let total = 0;

  for (const priority of PRIORITY_ORDER) {
    const quota = Math.floor(limit * QUOTA_RATIO[priority]);
    const n = Math.min(quota, buckets[priority].length, limit - total);
    taken[priority] = n;
    total += n;
  }

  for (const priority of PRIORITY_ORDER) {
    if (total >= limit) break;
    const extra = Math.min(buckets[priority].length - taken[priority], limit - total);
    taken[priority] += extra;
    total += extra;
  }

  return PRIORITY_ORDER.flatMap((priority) => buckets[priority].slice(0, taken[priority]));
}
