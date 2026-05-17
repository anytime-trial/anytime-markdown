import type { MemoryDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkPrecedesBugsInput = {
  db: MemoryDbConnection;
  windowDays?: number; // default 60
  logger: { warn: (msg: string) => void };
};

export type LinkPrecedesBugsResult = {
  edges_inserted: number;
};

// ── Main function ─────────────────────────────────────────────────────────────

export function linkPrecedesBugs(input: LinkPrecedesBugsInput): LinkPrecedesBugsResult {
  const { db, windowDays, logger } = input;
  const effectiveWindowDays =
    Number.isFinite(windowDays ?? 60) && (windowDays ?? 60) > 0
      ? (windowDays ?? 60)
      : 60;

  let findings: Array<{
    id: string;
    finding_entity_id: string;
    target_file_path: string | null;
    target_symbol: string | null;
    reviewed_at: string;
  }>;

  try {
    // 「いつレビューが行われたか」は memory_reviews.reviewed_at を使う。
    // memory_review_findings.recorded_at は ingest 時刻なので、re-ingest 後に
    // 全 finding が「今日」付けとなり、過去の bug が future として検索されないため誤り。
    const result = db.exec(`
      SELECT rf.id, rf.finding_entity_id, rf.target_file_path, rf.target_symbol, r.reviewed_at
      FROM memory_review_findings rf
      JOIN memory_reviews r ON r.id = rf.review_id
      WHERE rf.severity IN ('warn', 'error')
        AND (rf.target_file_path IS NOT NULL OR rf.target_symbol IS NOT NULL)
    `);

    const rows = result[0];
    if (!rows) {
      return { edges_inserted: 0 };
    }

    findings = rows.values.map((r) => ({
      id: String(r[0]),
      finding_entity_id: String(r[1]),
      target_file_path: r[2] != null ? String(r[2]) : null,
      target_symbol: r[3] != null ? String(r[3]) : null,
      reviewed_at: String(r[4]),
    }));
  } catch (err) {
    logger.warn(
      `[anytime-memory] linkPrecedesBugs: failed to query review findings: ${String(err)}`
    );
    return { edges_inserted: 0 };
  }

  let edgesInserted = 0;

  for (const finding of findings) {
    try {
      // Query candidate bugs within the window (reviewed_at 後 windowDays 日以内に commit された bug)
      const bugResult = db.exec(
        `SELECT bf.id, bf.bug_entity_id, bf.committed_at, bf.affected_file_paths_json, bf.subject_summary
         FROM memory_bug_fixes bf
         WHERE bf.committed_at > ?
           AND bf.committed_at <= datetime(?, '+' || ? || ' days')`,
        [finding.reviewed_at, finding.reviewed_at, effectiveWindowDays]
      );

      const bugRows = bugResult[0];
      if (!bugRows) {
        continue;
      }

      for (const row of bugRows.values) {
        const bugId = String(row[0]);
        const bugEntityId = String(row[1]);
        const committedAt = String(row[2]);
        const affectedFilePathsJson = String(row[3]);
        const subjectSummary = String(row[4]);

        // Check linkage conditions
        let matches = false;

        // File path match: finding.target_file_path is in the affected_file_paths array
        if (finding.target_file_path != null) {
          try {
            const affectedPaths: unknown = JSON.parse(affectedFilePathsJson);
            if (Array.isArray(affectedPaths) && affectedPaths.includes(finding.target_file_path)) {
              matches = true;
            }
          } catch {
            // invalid JSON — skip file path match
          }
        }

        // Symbol match: finding.target_symbol (non-null, non-empty) appears as substring in subject_summary
        if (!matches && finding.target_symbol != null && finding.target_symbol.length > 0) {
          if (subjectSummary.toLowerCase().includes(finding.target_symbol.toLowerCase())) {
            matches = true;
          }
        }

        if (!matches) {
          continue;
        }

        const edgeId = entityId('edge', `precedes:${finding.finding_entity_id}:${bugEntityId}`);
        const now = new Date().toISOString();

        db.run(
          `INSERT OR IGNORE INTO memory_edges
              (id, subject_entity_id, predicate, object_entity_id,
               valid_from, valid_to, recorded_at,
               source_type, source_ref,
               confidence, confidence_label, modality)
            VALUES (?, ?, 'precedes', ?, ?, NULL, ?, 'review', ?, 0.7, 'INFERRED', 'asserted')`,
          [
            edgeId,
            finding.finding_entity_id,
            bugEntityId,
            committedAt,
            now,
            `review_finding#${finding.id}=>bug#${bugId}`,
          ]
        );

        const edgeInserted = db.getRowsModified() > 0;
        if (edgeInserted) {
          edgesInserted += 1;
        }
      }
    } catch (err) {
      logger.warn(
        `[anytime-memory] linkPrecedesBugs: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  return { edges_inserted: edgesInserted };
}
