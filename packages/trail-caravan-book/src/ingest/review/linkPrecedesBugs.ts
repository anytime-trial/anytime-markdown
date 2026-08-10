import type { CaravanDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkPrecedesBugsInput = {
  db: CaravanDbConnection;
  windowDays?: number; // default 60
  logger: { warn: (msg: string) => void };
};

export type LinkPrecedesBugsResult = {
  edges_inserted: number;
};

// ── Private helpers ───────────────────────────────────────────────────────────

/** レビュー指摘 1 件（bug との突合対象）。 */
type Finding = {
  id: string;
  finding_entity_id: string;
  target_file_path: string | null;
  target_symbol: string | null;
  reviewed_at: string;
};

/** 突合候補の bug 修正 1 件。 */
type BugFix = {
  id: string;
  entityId: string;
  committedAt: string;
  affectedFilePathsJson: string;
  subjectSummary: string;
};

function resolveWindowDays(windowDays: number | undefined): number {
  const requested = windowDays ?? 60;
  return Number.isFinite(requested) && requested > 0 ? requested : 60;
}

/**
 * 突合対象の指摘を読み出す。取得できなければ空配列（呼び出し側は 0 件で終わる）。
 *
 * 「いつレビューが行われたか」は caravan_reviews.reviewed_at を使う。
 * caravan_review_findings.recorded_at は ingest 時刻なので、re-ingest 後に
 * 全 finding が「今日」付けとなり、過去の bug が future として検索されないため誤り。
 */
function loadFindings(db: CaravanDbConnection, logger: LinkPrecedesBugsInput['logger']): Finding[] {
  try {
    const result = db.exec(`
      SELECT rf.id, rf.finding_entity_id, rf.target_file_path, rf.target_symbol, r.reviewed_at
      FROM caravan_review_findings rf
      JOIN caravan_reviews r ON r.id = rf.review_id
      WHERE rf.severity IN ('warn', 'error')
        AND (rf.target_file_path IS NOT NULL OR rf.target_symbol IS NOT NULL)
    `);

    const rows = result[0];
    if (!rows) return [];

    return rows.values.map((r) => ({
      id: String(r[0]),
      finding_entity_id: String(r[1]),
      target_file_path: r[2] == null ? null : String(r[2]),
      target_symbol: r[3] == null ? null : String(r[3]),
      reviewed_at: String(r[4]),
    }));
  } catch (err) {
    logger.warn(
      `[anytime-memory] linkPrecedesBugs: failed to query review findings: ${String(err)}`
    );
    return [];
  }
}

/** reviewed_at 後 windowDays 日以内に commit された bug 修正。 */
function loadCandidateBugs(db: CaravanDbConnection, finding: Finding, windowDays: number): BugFix[] {
  const bugResult = db.exec(
    `SELECT bf.id, bf.bug_entity_id, bf.committed_at, bf.affected_file_paths_json, bf.subject_summary
     FROM caravan_bug_fixes bf
     WHERE bf.committed_at > ?
       AND bf.committed_at <= datetime(?, '+' || ? || ' days')`,
    [finding.reviewed_at, finding.reviewed_at, windowDays]
  );

  const bugRows = bugResult[0];
  if (!bugRows) return [];
  return bugRows.values.map((row) => ({
    id: String(row[0]),
    entityId: String(row[1]),
    committedAt: String(row[2]),
    affectedFilePathsJson: String(row[3]),
    subjectSummary: String(row[4]),
  }));
}

/** 指摘対象のファイルが bug 修正の変更ファイルに含まれるか。 */
function matchesFilePath(finding: Finding, bug: BugFix): boolean {
  if (finding.target_file_path == null) return false;
  try {
    const affectedPaths: unknown = JSON.parse(bug.affectedFilePathsJson);
    return Array.isArray(affectedPaths) && affectedPaths.includes(finding.target_file_path);
  } catch {
    // invalid JSON — skip file path match
    return false;
  }
}

/** 指摘対象のシンボル名が bug 修正の要約に現れるか。 */
function matchesSymbol(finding: Finding, bug: BugFix): boolean {
  const symbol = finding.target_symbol;
  if (symbol == null || symbol.length === 0) return false;
  return bug.subjectSummary.toLowerCase().includes(symbol.toLowerCase());
}

function insertPrecedesEdge(db: CaravanDbConnection, finding: Finding, bug: BugFix, now: string): boolean {
  const edgeId = entityId('edge', `precedes:${finding.finding_entity_id}:${bug.entityId}`);
  db.run(
    `INSERT OR IGNORE INTO caravan_edges
        (id, subject_entity_id, predicate, object_entity_id,
         valid_from, valid_to, recorded_at,
         source_type, source_ref,
         confidence, confidence_label, modality)
      VALUES (?, ?, 'precedes', ?, ?, NULL, ?, 'review', ?, 0.7, 'INFERRED', 'asserted')`,
    [edgeId, finding.finding_entity_id, bug.entityId, bug.committedAt, now, `review_finding#${finding.id}=>bug#${bug.id}`]
  );
  return db.getRowsModified() > 0;
}

/** 指摘 1 件について、突合した bug へ precedes エッジを張る。戻り値は挿入件数。 */
function linkFinding(db: CaravanDbConnection, finding: Finding, windowDays: number): number {
  const bugs = loadCandidateBugs(db, finding, windowDays);
  if (bugs.length === 0) return 0;

  const now = new Date().toISOString();
  let inserted = 0;
  for (const bug of bugs) {
    if (!matchesFilePath(finding, bug) && !matchesSymbol(finding, bug)) continue;
    if (insertPrecedesEdge(db, finding, bug, now)) inserted += 1;
  }
  return inserted;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function linkPrecedesBugs(input: LinkPrecedesBugsInput): LinkPrecedesBugsResult {
  const { db, windowDays, logger } = input;
  const effectiveWindowDays = resolveWindowDays(windowDays);

  let edgesInserted = 0;
  for (const finding of loadFindings(db, logger)) {
    try {
      edgesInserted += linkFinding(db, finding, effectiveWindowDays);
    } catch (err) {
      logger.warn(
        `[anytime-memory] linkPrecedesBugs: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  return { edges_inserted: edgesInserted };
}
