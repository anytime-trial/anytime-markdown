import type { Database } from 'sql.js';
import type { MemoryLogger } from '../logger';
import { entityId } from '../canonical/entityId';

export type LinkReviewToCommitInput = {
  db: Database;
  finding_id: string;
  commit_sha: string;
  addressed_at?: string;
  override_auto?: boolean;
  logger: MemoryLogger;
};

export type LinkReviewToCommitResult = {
  linked: boolean;
  previous_commit?: string;
};

export function linkReviewToCommit(input: LinkReviewToCommitInput): LinkReviewToCommitResult {
  const { db, finding_id, commit_sha, override_auto = false, logger } = input;
  const addressed_at = input.addressed_at ?? new Date().toISOString();

  let findingRows: ReturnType<Database['exec']>;
  try {
    findingRows = db.exec(
      `SELECT addressed_commit_sha, finding_entity_id
       FROM memory_review_findings WHERE id = ?`,
      [finding_id],
    );
  } catch (err) {
    logger.error(
      `[linkReviewToCommit] fetch failed finding=${finding_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return { linked: false };
  }

  if (!findingRows[0]?.values?.length) {
    logger.error(`[linkReviewToCommit] finding not found: ${finding_id}`);
    return { linked: false };
  }

  const [existingSha, findingEntityId] = findingRows[0].values[0] as [string | null, string];
  if (existingSha != null && !override_auto) {
    return { linked: false, previous_commit: existingSha };
  }

  try {
    db.run(
      `UPDATE memory_review_findings
       SET addressed_commit_sha = ?, addressed_at = ?
       WHERE id = ?`,
      [commit_sha, addressed_at, finding_id],
    );
  } catch (err) {
    logger.error(
      `[linkReviewToCommit] update failed finding=${finding_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
    return { linked: false };
  }

  // Insert or ignore the Commit → addresses → ReviewFinding edge
  try {
    const commitEntityId = entityId('Commit', commit_sha);
    const edgeId = entityId('edge', `addresses:${commitEntityId}:${findingEntityId}`);
    const now = new Date().toISOString();
    db.run(
      `INSERT OR IGNORE INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref, confidence, confidence_label, modality)
       VALUES (?, ?, 'addresses', ?, ?, NULL, ?, 'manual', ?, 1.0, 'CONFIRMED', 'asserted')`,
      [edgeId, commitEntityId, findingEntityId, now, now, commit_sha],
    );
  } catch (err) {
    logger.error(
      `[linkReviewToCommit] edge insert failed finding=${finding_id}: ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`,
    );
  }

  return { linked: true, previous_commit: existingSha ?? undefined };
}
