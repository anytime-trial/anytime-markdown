import type { MemoryDbConnection } from '../db/connection/types';
import { createHash } from 'node:crypto';

export interface EdgeInput {
  id: string;
  subject_entity_id: string;
  predicate: string;
  object_entity_id?: string;
  object_literal?: string;
  recorded_at: string;
}

export function applySingleActiveRule(
  db: MemoryDbConnection,
  newEdge: EdgeInput
): { invalidated_edge_ids: string[] } {
  // 1. Check cardinality of predicate
  const cardStmt = db.prepare(
    `SELECT cardinality FROM memory_relation_types WHERE predicate = ?`
  );
  const cardRow = cardStmt.get(newEdge.predicate);
  const cardinality = cardRow ? (cardRow['cardinality'] as string | undefined) : undefined;
  cardStmt.free?.();

  if (cardinality !== 'single_active') {
    return { invalidated_edge_ids: [] };
  }

  // 2. Find existing active edges with same subject + predicate (exclude newEdge itself)
  const activeStmt = db.prepare(
    `SELECT id FROM memory_edges
     WHERE subject_entity_id = ? AND predicate = ? AND valid_to IS NULL AND id != ?`
  );
  const ids: string[] = [];
  for (const row of activeStmt.iterate(
    newEdge.subject_entity_id,
    newEdge.predicate,
    newEdge.id,
  )) {
    ids.push(row['id'] as string);
  }
  activeStmt.free?.();

  // 3. Invalidate each old edge
  for (const oldId of ids) {
    db.run(
      `UPDATE memory_edges SET valid_to = ? WHERE id = ?`,
      [newEdge.recorded_at, oldId]
    );
    const invalidationId = createHash('sha1')
      .update(`${oldId}:${newEdge.recorded_at}`)
      .digest('hex')
      .slice(0, 16);
    db.run(
      `INSERT INTO memory_edge_invalidations (id, edge_id, invalidated_at, reason, superseding_edge_id, detail)
       VALUES (?, ?, ?, 'rule_exclusive', ?, '')`,
      [invalidationId, oldId, newEdge.recorded_at, newEdge.id]
    );
  }

  return { invalidated_edge_ids: ids };
}
