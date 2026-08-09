import type { CaravanDbConnection } from '../../db/connection/types';
import { REMOVAL_DETAIL_PREFIX } from '../../pipeline/runSpecReconciliation';

export interface ReviveSpecDocValidityInput {
  db: CaravanDbConnection;
  specDocId: string;
  specEntityId: string;
}

export interface ReviveSpecDocValidityResult {
  revived_entities: number;
  revived_edges: number;
}

/**
 * 一度消えた設計書が戻ってきたときに、runSpecReconciliation が立てた
 * valid_until / valid_to を剥がす。
 *
 * entity id・edge id は rel_path から決まる決定的な sha1 なので、再 ingest 側の
 * `INSERT OR IGNORE` は既存行にヒットして何もしない。巻き戻しが無いと
 * caravan_spec_documents の行だけが復活し、その entity と edge は検索・drift から
 * 永久に見えないゴーストになる（エラーもログも出ない）。
 *
 * 剥がす対象は「設計書の消滅を理由に無効化された edge」に限る
 * （caravan_edge_invalidations の reason + detail 接頭辞で判別）。single_active
 * ルールで上書きされた edge まで復活させると、古い事実が現役に戻ってしまう。
 */
export function reviveSpecDocValidity(
  input: ReviveSpecDocValidityInput,
): ReviveSpecDocValidityResult {
  const { db, specDocId, specEntityId } = input;
  const result: ReviveSpecDocValidityResult = { revived_entities: 0, revived_edges: 0 };

  // 1. spec_doc entity
  db.run('UPDATE caravan_entities SET valid_until = NULL WHERE id = ? AND valid_until IS NOT NULL', [
    specEntityId,
  ]);
  result.revived_entities += db.getRowsModified();

  // 2. この設計書の消滅を理由に閉じられた edge
  const edgeStmt = db.prepare(
    `SELECT e.id AS id, e.subject_entity_id AS subject_entity_id, e.object_entity_id AS object_entity_id
       FROM caravan_edges e
       JOIN caravan_edge_invalidations i ON i.edge_id = e.id
      WHERE e.source_type = 'spec'
        AND e.valid_to IS NOT NULL
        AND e.source_ref IN (?, ?)
        AND i.detail LIKE ? || '%'`,
  );
  const endpoints = new Set<string>();
  let edgeIds: string[];
  try {
    const rows = edgeStmt.all(`spec_doc#${specDocId}`, specDocId, REMOVAL_DETAIL_PREFIX);
    edgeIds = rows.map((row) => String(row['id']));
    for (const row of rows) {
      endpoints.add(String(row['subject_entity_id']));
      const objectId = row['object_entity_id'];
      if (objectId !== null) endpoints.add(String(objectId));
    }
  } finally {
    edgeStmt.free?.();
  }

  for (const edgeId of edgeIds) {
    db.run('UPDATE caravan_edges SET valid_to = NULL WHERE id = ? AND valid_to IS NOT NULL', [edgeId]);
    result.revived_edges += db.getRowsModified();
  }

  // 3. 復活した edge の端点で、まだ無効化されたままの entity
  //    （孤立判定で valid_until を立てられたもの）
  for (const entityId of endpoints) {
    if (entityId === specEntityId) continue;
    db.run('UPDATE caravan_entities SET valid_until = NULL WHERE id = ? AND valid_until IS NOT NULL', [
      entityId,
    ]);
    result.revived_entities += db.getRowsModified();
  }

  return result;
}
