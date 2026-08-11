import type { CaravanDbConnection } from '../db/connection/types';
import type { CaravanLogger } from '../logger';

export type ReviewFindingSummary = {
  finding_id: string;
  finding_index: number;
  category: string;
  severity: string;
  finding_text: string;
  suggestion_text: string;
  target_file_path: string | null;
  target_symbol: string | null;
  addressed_commit_sha: string | null;
  addressed_at: string | null;
  recorded_at: string;
  precedes_bug_entity_ids: string[];
};

export type ReviewHistoryEntry = {
  review_id: string;
  source_kind: string;
  source_ref: string;
  target_kind: string;
  title: string;
  reviewer: string;
  severity_overall: string;
  reviewed_at: string;
  findings: ReviewFindingSummary[];
};

type QueryRows = ReturnType<CaravanDbConnection['exec']>;

/** 絞り込み条件を WHERE 句とバインド値へ組み立てる（LIMIT は末尾に付く）。 */
function buildHistoryQuery(
  input: { target_file_path?: string; category?: string },
  limit: number,
): { where: string; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (input.target_file_path != null) {
    conditions.push('rf.target_file_path = ?');
    params.push(input.target_file_path);
  }
  if (input.category != null) {
    conditions.push('rf.category = ?');
    params.push(input.category);
  }
  params.push(limit);

  return { where: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '', params };
}

/** レビュー行と指摘行の join 結果を、レビュー単位へ畳み込む。 */
function foldReviewRows(rows: QueryRows): {
  reviewMap: Map<string, ReviewHistoryEntry>;
  findingEntityIds: Map<string, string>;
} {
  const reviewMap = new Map<string, ReviewHistoryEntry>();
  const findingEntityIds = new Map<string, string>();

  for (const row of rows[0]?.values ?? []) {
    const reviewId = row[0] as string;
    let entry = reviewMap.get(reviewId);
    if (entry === undefined) {
      entry = {
        review_id: reviewId,
        source_kind: row[1] as string,
        source_ref: row[2] as string,
        target_kind: row[3] as string,
        title: row[4] as string,
        reviewer: row[5] as string,
        severity_overall: row[6] as string,
        reviewed_at: row[7] as string,
        findings: [],
      };
      reviewMap.set(reviewId, entry);
    }

    const findingId = row[8] as string;
    findingEntityIds.set(findingId, row[19] as string);

    entry.findings.push({
      finding_id: findingId,
      finding_index: row[9] as number,
      category: row[10] as string,
      severity: row[11] as string,
      finding_text: row[12] as string,
      suggestion_text: row[13] as string,
      target_file_path: row[14] as string | null,
      target_symbol: row[15] as string | null,
      addressed_commit_sha: row[16] as string | null,
      addressed_at: row[17] as string | null,
      recorded_at: row[18] as string,
      precedes_bug_entity_ids: [],
    });
  }

  return { reviewMap, findingEntityIds };
}

/** 各指摘に precedes（後続バグ）の entity id を載せる。取得失敗した指摘は空のまま進む。 */
function attachPrecedesBugs(
  db: CaravanDbConnection,
  args: { reviewMap: ReadonlyMap<string, ReviewHistoryEntry>; findingEntityIds: ReadonlyMap<string, string> },
  logger: CaravanLogger,
): void {
  // Build a flat index of finding_id → finding object across all review entries
  const findingById = new Map<string, ReviewFindingSummary>();
  for (const entry of args.reviewMap.values()) {
    for (const f of entry.findings) {
      findingById.set(f.finding_id, f);
    }
  }

  for (const [findingId, entityId] of args.findingEntityIds) {
    let edgeRows: QueryRows;
    try {
      edgeRows = db.exec(
        `SELECT object_entity_id FROM caravan_edges
         WHERE subject_entity_id = ? AND predicate = 'precedes' AND valid_to IS NULL`,
        [entityId],
      );
    } catch (err) {
      logger.error(`[getReviewHistory] precedes fetch failed entity=${entityId}: ${String(err)}`);
      continue;
    }
    const bugEntityIds = (edgeRows[0]?.values ?? []).map((r) => r[0] as string);
    if (bugEntityIds.length === 0) continue;
    const f = findingById.get(findingId);
    if (f) f.precedes_bug_entity_ids = bugEntityIds;
  }
}

export function getReviewHistory(input: {
  db: CaravanDbConnection;
  target_file_path?: string;
  package?: string;
  category?: string;
  include_precedes_bugs?: boolean;
  limit?: number;
  logger: CaravanLogger;
}): ReviewHistoryEntry[] {
  const { db, limit = 20, include_precedes_bugs = false, logger } = input;
  const { where, params } = buildHistoryQuery(input, limit);

  let rows: QueryRows;
  try {
    rows = db.exec(
      `SELECT r.id, r.source_kind, r.source_ref, r.target_kind,
              r.title, r.reviewer, r.severity_overall, r.reviewed_at,
              rf.id, rf.finding_index, rf.category, rf.severity,
              rf.finding_text, rf.suggestion_text,
              rf.target_file_path, rf.target_symbol,
              rf.addressed_commit_sha, rf.addressed_at, rf.recorded_at,
              rf.finding_entity_id
       FROM caravan_reviews r
       JOIN caravan_review_findings rf ON rf.review_id = r.id
       ${where}
       ORDER BY r.reviewed_at DESC, rf.finding_index ASC
       LIMIT ?`,
      params,
    );
  } catch (err) {
    logger.error(
      `[getReviewHistory] query failed: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return [];
  }

  const { reviewMap, findingEntityIds } = foldReviewRows(rows);

  if (include_precedes_bugs && findingEntityIds.size > 0) {
    attachPrecedesBugs(db, { reviewMap, findingEntityIds }, logger);
  }

  return Array.from(reviewMap.values());
}
