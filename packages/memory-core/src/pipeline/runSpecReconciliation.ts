import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { MemoryDbConnection } from '../db/connection/types';
import { noopLogger, type MemoryLogger } from '../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpecReconciliationResult {
  status: 'success' | 'error';
  /** memory_spec_documents に登録されていた件数 */
  scanned: number;
  /** specRoot から消えていて削除した memory_spec_documents 行数 */
  removed_docs: number;
  /** 無効化した spec_doc Concept entity 数 */
  soft_deleted_doc_entities: number;
  /** valid_to を立てた spec 由来 edge 数 */
  invalidated_edges: number;
  /** edge 無効化で参照を失い無効化した claim entity 数 */
  soft_deleted_orphan_entities: number;
  error_detail: string;
  duration_ms: number;
}

export interface SpecReconciliationInput {
  db: MemoryDbConnection;
  /** discoverChangedSpecs と同一の走査起点でなければならない */
  specRoot: string;
  recordedAt: string;
  logger?: MemoryLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * memory_edge_invalidations.reason の CHECK 制約が許す値のうち、spec 側の変更に
 * 対応するもの。
 *
 * SHORTCUT: 削除専用の reason を足さず既存の 'spec_updated' に相乗りする.
 * ceiling: 「更新で無効化」と「文書ごと消滅」を reason だけでは区別できず、
 * detail の文字列に依存する. upgrade: 無効化理由を集計・分岐する読み手が現れたら
 * CHECK 制約に 'spec_removed' を足す 12-step migration を行う.
 */
const INVALIDATION_REASON = 'spec_updated';

// ── Private helpers ───────────────────────────────────────────────────────────

interface SpecDocRow {
  id: string;
  rel_path: string;
}

/**
 * specRoot 配下に .md が 1 件でもあるかを確かめる。
 *
 * 掃除の前提が「ファイルが消えた」であるため、specRoot 自体が読めない・空である
 * ケース（マウント切れ・設定ミス）を「全ドキュメントが消えた」と解釈すると、
 * 生きているデータを全消しする。走査結果が空なら削除へ進まない（fail-closed）。
 */
function specRootHasMarkdown(specRoot: string): boolean {
  let entries: string[];
  try {
    entries = readdirSync(specRoot, { recursive: true }) as string[];
  } catch {
    return false;
  }
  return entries.some((e) => typeof e === 'string' && extname(e) === '.md');
}

function listSpecDocs(db: MemoryDbConnection): SpecDocRow[] {
  const stmt = db.prepare('SELECT id, rel_path FROM memory_spec_documents');
  try {
    return stmt.all().map((row) => ({
      id: String(row['id']),
      rel_path: String(row['rel_path']),
    }));
  } finally {
    stmt.free?.();
  }
}

/** 生存ドキュメントと共有されていない entity だけを返す */
function exclusiveEntityIds(
  db: MemoryDbConnection,
  deadDocIds: ReadonlySet<string>,
): string[] {
  const stmt = db.prepare('SELECT spec_doc_id, entity_id FROM memory_spec_doc_entities');
  const deadOnly = new Set<string>();
  const shared = new Set<string>();
  try {
    for (const row of stmt.iterate()) {
      const docId = String(row['spec_doc_id']);
      const entityId = String(row['entity_id']);
      if (deadDocIds.has(docId)) deadOnly.add(entityId);
      else shared.add(entityId);
    }
  } finally {
    stmt.free?.();
  }
  return [...deadOnly].filter((id) => !shared.has(id));
}

function softDeleteEntity(db: MemoryDbConnection, entityId: string, recordedAt: string): boolean {
  db.run(
    'UPDATE memory_entities SET valid_until = ?, last_updated_at = ? WHERE id = ? AND valid_until IS NULL',
    [recordedAt, recordedAt, entityId],
  );
  return db.getRowsModified() > 0;
}

/** entity が spec 以外の根拠（有効 edge・会話・生存 spec）を持つか */
function hasRemainingEvidence(db: MemoryDbConnection, entityId: string): boolean {
  const edge = db.prepare(
    `SELECT 1 FROM memory_edges
      WHERE (subject_entity_id = ? OR object_entity_id = ?) AND valid_to IS NULL LIMIT 1`,
  );
  try {
    if (edge.get(entityId, entityId)) return true;
  } finally {
    edge.free?.();
  }
  const episode = db.prepare('SELECT 1 FROM memory_episode_entities WHERE entity_id = ? LIMIT 1');
  try {
    if (episode.get(entityId)) return true;
  } finally {
    episode.free?.();
  }
  const spec = db.prepare('SELECT 1 FROM memory_spec_doc_entities WHERE entity_id = ? LIMIT 1');
  try {
    if (spec.get(entityId)) return true;
  } finally {
    spec.free?.();
  }
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * memory_spec_documents を specRoot の実ファイルと突き合わせ、消えたドキュメントと
 * その派生データを掃除する。
 *
 * discoverChangedSpecs は「今あるファイル」しか見ないため、リネーム・削除された
 * ドキュメントの行は放置され、検索・drift・alignment が存在しない設計書を根拠に
 * 判定し続ける。本関数がその削除側を担う。
 *
 * 副作用（永続化あり）:
 * - memory_spec_documents の行を DELETE（memory_spec_doc_entities は CASCADE）
 * - spec_doc entity と孤立 claim entity に valid_until を立てる（soft delete）
 * - 該当 spec edge に valid_to を立て、memory_edge_invalidations へ記録する
 *
 * 実体（履歴）は entity / edge 側に残す。消すのはファイルシステムのミラーである
 * ドキュメント登録行だけ。
 *
 * FTS インデックス（memory_entities_fts）には触れない。hybridSearchMemory が
 * MATCH の結果を `valid_until IS NULL` で絞るため無効化した entity は検索結果へ
 * 出ず、contentless FTS5 への大量 rowid 差分削除は DB を破損させた実績がある
 * （2026-08-06）。索引の掃除が要るなら全再構築（runRagFtsRebuild）で行う。
 */
export function runSpecReconciliation(input: SpecReconciliationInput): SpecReconciliationResult {
  const { db, specRoot, recordedAt } = input;
  const logger = input.logger ?? noopLogger;
  const start = Date.now();

  const result: SpecReconciliationResult = {
    status: 'success',
    scanned: 0,
    removed_docs: 0,
    soft_deleted_doc_entities: 0,
    invalidated_edges: 0,
    soft_deleted_orphan_entities: 0,
    error_detail: '',
    duration_ms: 0,
  };

  const finish = (): SpecReconciliationResult => {
    result.duration_ms = Date.now() - start;
    return result;
  };

  if (!specRootHasMarkdown(specRoot)) {
    result.status = 'error';
    result.error_detail = `specRoot に Markdown が見つからない (${specRoot}) — 全件削除を避けるため中断`;
    logger.error(
      `[${recordedAt}] [ERROR] [anytime-memory] runSpecReconciliation: ${result.error_detail}`,
    );
    return finish();
  }

  const docs = listSpecDocs(db);
  result.scanned = docs.length;
  const deadDocs = docs.filter((doc) => !existsSync(join(specRoot, doc.rel_path)));
  if (deadDocs.length === 0) {
    logger.info(
      `[${recordedAt}] [INFO] [anytime-memory] runSpecReconciliation: scanned=${result.scanned} removed=0`,
    );
    return finish();
  }

  const deadDocIds = new Set(deadDocs.map((d) => d.id));
  const relPathById = new Map(deadDocs.map((d) => [d.id, d.rel_path]));
  const docEntityIds = exclusiveEntityIds(db, deadDocIds);

  db.run('BEGIN');
  try {
    // 1. 消えたドキュメント由来の有効な edge を閉じる
    const touchedEntityIds = new Set<string>();
    const edgeStmt = db.prepare(
      `SELECT id, subject_entity_id, object_entity_id, source_ref FROM memory_edges
        WHERE source_type = 'spec' AND valid_to IS NULL AND source_ref = ?`,
    );
    try {
      for (const docId of deadDocIds) {
        for (const row of edgeStmt.all(`spec_doc#${docId}`)) {
          const edgeId = String(row['id']);
          const subjectId = String(row['subject_entity_id']);
          const objectId = row['object_entity_id'] === null ? null : String(row['object_entity_id']);

          db.run('UPDATE memory_edges SET valid_to = ? WHERE id = ? AND valid_to IS NULL', [
            recordedAt,
            edgeId,
          ]);
          if (db.getRowsModified() === 0) continue;

          const invalidationId = createHash('sha1')
            .update(`spec_removed:${edgeId}:${recordedAt}`)
            .digest('hex')
            .slice(0, 16);
          db.run(
            `INSERT INTO memory_edge_invalidations
               (id, edge_id, invalidated_at, reason, superseding_edge_id, detail)
             VALUES (?, ?, ?, ?, NULL, ?)`,
            [
              invalidationId,
              edgeId,
              recordedAt,
              INVALIDATION_REASON,
              `spec doc removed: ${relPathById.get(docId) ?? docId}`,
            ],
          );
          result.invalidated_edges++;
          touchedEntityIds.add(subjectId);
          if (objectId !== null) touchedEntityIds.add(objectId);
        }
      }
    } finally {
      edgeStmt.free?.();
    }

    // 2. ドキュメント登録行を削除（memory_spec_doc_entities は ON DELETE CASCADE）
    for (const docId of deadDocIds) {
      db.run('DELETE FROM memory_spec_documents WHERE id = ?', [docId]);
      result.removed_docs += db.getRowsModified();
    }

    // 3. 消えたドキュメントの spec_doc entity を無効化
    for (const entityId of docEntityIds) {
      if (softDeleteEntity(db, entityId, recordedAt)) result.soft_deleted_doc_entities++;
    }

    // 4. edge を失って根拠ゼロになった claim entity を無効化
    //    （手順 2 で CASCADE 削除された後に判定するため、消えた doc へのリンクは残っていない）
    const docEntitySet = new Set(docEntityIds);
    for (const entityId of touchedEntityIds) {
      if (docEntitySet.has(entityId)) continue;
      if (hasRemainingEvidence(db, entityId)) continue;
      if (softDeleteEntity(db, entityId, recordedAt)) result.soft_deleted_orphan_entities++;
    }

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    logger.error(
      `[${recordedAt}] [ERROR] [anytime-memory] runSpecReconciliation: 失敗したため巻き戻した`,
      err,
    );
    result.status = 'error';
    result.error_detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    // ROLLBACK 済みなので、途中まで数えた件数は DB に残っていない
    result.removed_docs = 0;
    result.soft_deleted_doc_entities = 0;
    result.invalidated_edges = 0;
    result.soft_deleted_orphan_entities = 0;
    return finish();
  }

  logger.info(
    `[${recordedAt}] [INFO] [anytime-memory] runSpecReconciliation: ` +
      `scanned=${result.scanned} removed_docs=${result.removed_docs} ` +
      `doc_entities=${result.soft_deleted_doc_entities} edges=${result.invalidated_edges} ` +
      `orphan_entities=${result.soft_deleted_orphan_entities}`,
  );
  return finish();
}
