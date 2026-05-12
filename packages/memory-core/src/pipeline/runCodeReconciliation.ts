import type { Database } from 'sql.js';
import { noopLogger, type MemoryLogger } from '../logger';

export interface CodeReconciliationResult {
  status: 'success' | 'error';
  scanned: number;
  soft_deleted: number;
  duration_ms: number;
}

/**
 * Reconcile memory_entities of type 'Function' and 'File' against a current
 * snapshot from the latest code graph. Entities present in DB but missing from
 * the snapshot are soft-deleted by setting valid_until to recordedAt.
 *
 * This addresses the "delete" case in the entity lifecycle:
 * - Function removed from source → soft-deleted
 * - File deleted from source → soft-deleted
 *
 * Rename is handled as delete + insert (old soft-deleted, new created). True
 * rename detection (preserving edges) is deferred to a future phase.
 */
export function runCodeReconciliation(opts: {
  db: Database;
  repoName: string;
  currentEntityIds: Set<string>;
  recordedAt: string;
  logger?: MemoryLogger;
}): CodeReconciliationResult {
  const start = Date.now();
  const logger = opts.logger ?? noopLogger;

  let scanned = 0;
  const toDelete: string[] = [];

  // Scan all Function/File entities for this repo that are not already soft-deleted.
  const stmt = opts.db.prepare(
    `SELECT id FROM memory_entities
     WHERE repo_name = ?
       AND type IN ('Function','File')
       AND valid_until IS NULL`
  );
  try {
    stmt.bind([opts.repoName]);
    while (stmt.step()) {
      const id = stmt.getAsObject()['id'] as string;
      scanned += 1;
      if (!opts.currentEntityIds.has(id)) {
        toDelete.push(id);
      }
    }
  } finally {
    stmt.free();
  }

  let softDeleted = 0;
  for (const id of toDelete) {
    try {
      opts.db.run(
        `UPDATE memory_entities SET valid_until = ? WHERE id = ? AND valid_until IS NULL`,
        [opts.recordedAt, id]
      );
      softDeleted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] runCodeReconciliation: failed to soft-delete id=${id}`,
        err
      );
    }
  }

  logger.info(
    `[memory-core] code reconciliation: repo="${opts.repoName}" ` +
      `scanned=${scanned} soft_deleted=${softDeleted}`
  );

  return {
    status: 'success',
    scanned,
    soft_deleted: softDeleted,
    duration_ms: Date.now() - start,
  };
}
