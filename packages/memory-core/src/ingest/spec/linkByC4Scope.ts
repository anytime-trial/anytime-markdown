import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

export type LinkC4ScopeInput = {
  db: Database;
  specDocId: string;
  specEntityId: string;
  c4Scope: string[];
  recordedAt: string;
  logger: MemoryLogger;
};

export type LinkC4ScopeResult = {
  resolved_count: number;
  skipped_count: number;
  edges_inserted: number;
};

/**
 * c4Scope 配列の各要素を trail.c4_manual_elements テーブルで解決し、
 * memory_entities / memory_edges / memory_spec_doc_entities に INSERT OR IGNORE する。
 *
 * trail DB は呼び出し元により ATTACH 済みであること（AS trail）。
 */
export function linkByC4Scope(input: LinkC4ScopeInput): LinkC4ScopeResult {
  const { db, specDocId, specEntityId, c4Scope, recordedAt, logger } = input;
  let resolved_count = 0;
  let skipped_count = 0;
  let edges_inserted = 0;

  for (const scopeId of c4Scope) {
    try {
      // 1. プレフィックス判定
      let entityType: string;
      if (scopeId.startsWith('sys_')) {
        // System は memory_entities.type CHECK 制約に含まれないため Concept にマップ
        entityType = 'Concept';
      } else if (scopeId.startsWith('pkg_') && !scopeId.includes('/')) {
        entityType = 'Package';
      } else if (scopeId.startsWith('pkg_') && scopeId.includes('/')) {
        // Component は memory_entities.type CHECK 制約に含まれないため Concept にマップ
        entityType = 'Concept';
      } else {
        logger.warn?.(`[linkByC4Scope] [${recordedAt}] unknown c4Scope prefix, skipping: ${scopeId}`);
        skipped_count++;
        continue;
      }

      // 2. trail.c4_manual_elements から解決
      const rows = db.exec(`SELECT id, name FROM trail.c4_manual_elements WHERE id = ?`, [scopeId]);
      if (rows.length === 0 || rows[0].values.length === 0) {
        logger.warn?.(`[linkByC4Scope] [${recordedAt}] c4_manual_elements row not found, skipping: ${scopeId}`);
        skipped_count++;
        continue;
      }

      const row = rows[0].values[0];
      const c4Id = String(row[0]);
      const c4DisplayName = String(row[1]);

      // 3. entity id を決定（canonical_name として c4_id を使用）
      const c4EntityId = entityId(entityType, c4Id);

      // 4. memory_entities に INSERT OR IGNORE
      db.run(
        `INSERT OR IGNORE INTO memory_entities
          (id, type, canonical_name, display_name, attributes_json,
           first_seen_at, last_updated_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c4EntityId,
          entityType,
          c4Id,
          c4DisplayName,
          JSON.stringify({ c4_id: c4Id }),
          recordedAt,
          recordedAt,
          recordedAt,
        ],
      );

      // 5. memory_edges: specEntityId → mentioned_in → c4EntityId
      const edgeId1 = entityId('edge', `${specEntityId}:mentioned_in:${c4EntityId}`);
      db.run(
        `INSERT OR IGNORE INTO memory_edges
          (id, subject_entity_id, predicate, object_entity_id,
           valid_from, recorded_at, source_type, source_ref,
           confidence, confidence_label, modality, attributes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          edgeId1,
          specEntityId,
          'mentioned_in',
          c4EntityId,
          recordedAt,
          recordedAt,
          'spec',
          specDocId,
          1.0,
          'EXTRACTED',
          'asserted',
          '{}',
        ],
      );

      // 6. memory_edges: c4EntityId → relates_to → specEntityId
      const edgeId2 = entityId('edge', `${c4EntityId}:relates_to:${specEntityId}`);
      db.run(
        `INSERT OR IGNORE INTO memory_edges
          (id, subject_entity_id, predicate, object_entity_id,
           valid_from, recorded_at, source_type, source_ref,
           confidence, confidence_label, modality, attributes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          edgeId2,
          c4EntityId,
          'relates_to',
          specEntityId,
          recordedAt,
          recordedAt,
          'spec',
          specDocId,
          1.0,
          'EXTRACTED',
          'asserted',
          '{}',
        ],
      );

      // 7. memory_spec_doc_entities に INSERT OR IGNORE
      db.run(
        `INSERT OR IGNORE INTO memory_spec_doc_entities (spec_doc_id, entity_id)
         VALUES (?, ?)`,
        [specDocId, c4EntityId],
      );

      edges_inserted += 2;
      resolved_count++;
    } catch (err) {
      logger.error(
        `[linkByC4Scope] [${recordedAt}] failed to process c4Scope entry: ${scopeId}`,
        err,
      );
    }
  }

  return { resolved_count, skipped_count, edges_inserted };
}
