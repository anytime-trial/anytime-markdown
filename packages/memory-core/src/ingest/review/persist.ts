import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';
import type { ParsedFinding } from './findingHelpers';
import type { ParsedReviewDoc } from './parseReviewDoc';
import type { ParsedReviewSession } from './parseReviewSession';
import type { MemoryLogger } from '../../logger';

export type PersistReviewStats = {
  reviews_inserted: number;
  findings_inserted: number;
  edges_inserted: number;
};

/**
 * Convert a date string (YYYY-MM-DD or ISO 8601) to ISO 8601 UTC format.
 * If already in ISO 8601 + Z format, returns as-is.
 * If YYYY-MM-DD, appends T00:00:00.000Z.
 */
function toReviewedAt(dateStr: string): string {
  if (!dateStr) {
    return new Date().toISOString();
  }
  // Already full ISO 8601 + Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    if (dateStr.endsWith('Z')) {
      return dateStr;
    }
    return new Date(dateStr).toISOString();
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T00:00:00.000Z`;
  }
  // fallback
  return new Date(dateStr).toISOString();
}

/**
 * Upsert a ReviewFinding entity + memory_review_findings row + flagged edge.
 */
export function upsertReviewFinding(
  db: Database,
  reviewEntityId: string,
  finding: ParsedFinding,
  recordedAt: string,
  logger: MemoryLogger,
): { finding_entity_id: string; inserted: boolean } {
  const findingCanonicalName = `${reviewEntityId}:${finding.finding_index}`;
  const findingEntityId = entityId('ReviewFinding', findingCanonicalName);

  try {
    // 1. INSERT OR IGNORE entity
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        findingEntityId,
        findingCanonicalName,
        finding.finding_text.slice(0, 100),
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );

    // 2. INSERT OR IGNORE memory_review_findings
    const findingId = entityId('finding_row', `${reviewEntityId}:${finding.finding_index}`);
    db.run(
      `INSERT OR IGNORE INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_symbol, target_line_start, target_line_end,
          category, severity, finding_text, suggestion_text,
          recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        findingId,
        reviewEntityId,
        findingEntityId,
        finding.finding_index,
        finding.target_file_path ?? null,
        finding.target_symbol ?? null,
        finding.target_line_start ?? null,
        finding.target_line_end ?? null,
        finding.category,
        finding.severity,
        finding.finding_text,
        finding.suggestion_text,
        recordedAt,
      ],
    );
    const findingInserted = db.getRowsModified() > 0;

    // 3. INSERT OR IGNORE edge: Review → flagged → ReviewFinding
    const edgeId = entityId('edge', `flagged:${reviewEntityId}:${findingEntityId}`);
    db.run(
      `INSERT OR IGNORE INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'flagged', ?, ?, NULL, ?, 'review', ?, 1.0, 'EXTRACTED', 'asserted')`,
      [
        edgeId,
        reviewEntityId,
        findingEntityId,
        recordedAt,
        recordedAt,
        `review_finding#${findingEntityId}`,
      ],
    );

    return { finding_entity_id: findingEntityId, inserted: findingInserted };
  } catch (err) {
    logger.error(
      `[memory-core] upsertReviewFinding: failed for finding_index=${finding.finding_index} review=${reviewEntityId}`,
      err,
    );
    return { finding_entity_id: findingEntityId, inserted: false };
  }
}

/**
 * Upsert a review document into memory_reviews + memory_entities + findings + edges.
 */
export function upsertReviewDoc(
  db: Database,
  doc: ParsedReviewDoc,
  relPath: string,
  sourceHash: string,
  recordedAt: string,
  logger: MemoryLogger,
): { review_id: string; is_new: boolean; findings_inserted: number; edges_inserted: number } {
  const reviewEntityId = entityId('Review', relPath);
  const reviewedAt = toReviewedAt(doc.frontmatter.date);
  let findingsInserted = 0;
  let edgesInserted = 0;

  try {
    // INSERT OR IGNORE avoids DELETE+INSERT (which would CASCADE-delete edges/findings)
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        reviewEntityId,
        relPath,
        doc.frontmatter.title ?? relPath,
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );
    db.run(
      `UPDATE memory_entities SET display_name=?, last_updated_at=? WHERE id=? AND type='Review'`,
      [doc.frontmatter.title ?? relPath, recordedAt, reviewEntityId],
    );

    // Check existing source_hash
    const existingRows = db.exec(
      `SELECT source_hash FROM memory_reviews WHERE source_kind='review_doc' AND source_ref=?`,
      [relPath],
    );
    const existingHash =
      existingRows[0]?.values?.[0]?.[0] != null
        ? String(existingRows[0].values[0][0])
        : null;

    if (existingHash !== null && existingHash === sourceHash) {
      return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
    }

    // INSERT OR IGNORE into memory_reviews
    db.run(
      `INSERT OR IGNORE INTO memory_reviews
         (id, source_kind, source_ref, source_hash, review_entity_id,
          target_kind, target_refs_json, title,
          reviewed_at, recorded_at)
       VALUES (?, 'review_doc', ?, ?, ?,
               ?, ?, ?,
               ?, ?)`,
      [
        reviewEntityId,
        relPath,
        sourceHash,
        reviewEntityId,
        doc.targetRefs.length > 0 ? 'code' : 'mixed',
        JSON.stringify(doc.targetRefs),
        doc.frontmatter.title ?? relPath,
        reviewedAt,
        recordedAt,
      ],
    );
    const reviewInserted = db.getRowsModified() > 0;

    // If the row already existed but hash changed, update source_hash
    if (!reviewInserted && existingHash !== null && existingHash !== sourceHash) {
      db.run(
        `UPDATE memory_reviews SET source_hash=? WHERE source_kind='review_doc' AND source_ref=?`,
        [sourceHash, relPath],
      );
    }

    // Insert findings
    for (const finding of doc.findings) {
      const result = upsertReviewFinding(db, reviewEntityId, finding, recordedAt, logger);
      if (result.inserted) {
        findingsInserted += 1;
        edgesInserted += 1; // flagged edge
      }
    }

    // Insert reviewed_by edges for target refs
    for (const targetRef of doc.targetRefs) {
      const targetEntityId = entityId('File', targetRef);
      // Ensure File entity exists
      db.run(
        `INSERT OR IGNORE INTO memory_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'File', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
        [targetEntityId, targetRef, targetRef, recordedAt, recordedAt, recordedAt],
      );

      const edgeId = entityId('edge', `reviewed_by:${targetEntityId}:${reviewEntityId}`);
      db.run(
        `INSERT OR IGNORE INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id,
            valid_from, valid_to, recorded_at,
            source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, 'reviewed_by', ?, ?, NULL, ?, 'review', ?, 1.0, 'EXTRACTED', 'asserted')`,
        [
          edgeId,
          targetEntityId,
          reviewEntityId,
          recordedAt,
          recordedAt,
          `review_doc#${relPath}`,
        ],
      );
      if (db.getRowsModified() > 0) {
        edgesInserted += 1;
      }
    }

    return { review_id: reviewEntityId, is_new: reviewInserted, findings_inserted: findingsInserted, edges_inserted: edgesInserted };
  } catch (err) {
    logger.error(
      `[memory-core] upsertReviewDoc: failed for relPath=${relPath}`,
      err,
    );
    return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
  }
}

/**
 * Upsert a review session into memory_reviews + memory_entities + findings.
 */
export function upsertReviewSession(
  db: Database,
  session: ParsedReviewSession,
  recordedAt: string,
  logger: MemoryLogger,
): { review_id: string; is_new: boolean; findings_inserted: number; edges_inserted: number } {
  const sourceRef = `${session.session_id}#${session.message_uuid_start}`;
  const reviewEntityId = entityId('Review', sourceRef);
  let findingsInserted = 0;
  let edgesInserted = 0;

  try {
    // Upsert entity
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        reviewEntityId,
        sourceRef,
        `Session review ${session.session_id.slice(0, 8)}`,
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );

    // INSERT OR IGNORE into memory_reviews
    db.run(
      `INSERT OR IGNORE INTO memory_reviews
         (id, source_kind, source_ref, source_hash, review_entity_id,
          target_kind, target_refs_json, title,
          reviewed_at, recorded_at)
       VALUES (?, 'session', ?, '', ?,
               ?, ?, ?,
               ?, ?)`,
      [
        reviewEntityId,
        sourceRef,
        reviewEntityId,
        session.target_kind,
        JSON.stringify(session.target_refs),
        `Session review ${session.session_id.slice(0, 8)}`,
        session.reviewed_at,
        recordedAt,
      ],
    );
    const reviewInserted = db.getRowsModified() > 0;

    // Insert findings
    for (const finding of session.findings) {
      const result = upsertReviewFinding(db, reviewEntityId, finding, recordedAt, logger);
      if (result.inserted) {
        findingsInserted += 1;
        edgesInserted += 1;
      }
    }

    return { review_id: reviewEntityId, is_new: reviewInserted, findings_inserted: findingsInserted, edges_inserted: edgesInserted };
  } catch (err) {
    logger.error(
      `[memory-core] upsertReviewSession: failed for session_id=${session.session_id}`,
      err,
    );
    return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
  }
}
