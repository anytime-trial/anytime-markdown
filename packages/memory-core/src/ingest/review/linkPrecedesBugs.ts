import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkPrecedesBugsInput = {
  db: Database;
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
    recorded_at: string;
  }>;

  try {
    const result = db.exec(`
      SELECT id, finding_entity_id, target_file_path, target_symbol, recorded_at
      FROM memory_review_findings
      WHERE severity IN ('warn', 'error')
        AND (target_file_path IS NOT NULL OR target_symbol IS NOT NULL)
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
      recorded_at: String(r[4]),
    }));
  } catch (err) {
    logger.warn(
      `[memory-core] linkPrecedesBugs: failed to query review findings: ${String(err)}`
    );
    return { edges_inserted: 0 };
  }

  let edgesInserted = 0;

  for (const finding of findings) {
    try {
      // Query candidate bugs within the window
      const bugResult = db.exec(
        `SELECT bf.id, bf.bug_entity_id, bf.committed_at, bf.affected_file_paths_json, bf.subject_summary
         FROM memory_bug_fixes bf
         WHERE bf.committed_at > ?
           AND bf.committed_at <= datetime(?, '+' || ? || ' days')`,
        [finding.recorded_at, finding.recorded_at, effectiveWindowDays]
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
        `[memory-core] linkPrecedesBugs: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  return { edges_inserted: edgesInserted };
}
