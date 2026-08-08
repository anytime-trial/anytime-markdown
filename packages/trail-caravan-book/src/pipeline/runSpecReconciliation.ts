import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { MemoryDbConnection, MemoryDbStatement } from '../db/connection/types';
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
  /** edge 無効化で根拠を失い無効化した entity 数（claim・c4 リンク由来を含む） */
  soft_deleted_orphan_entities: number;
  error_detail: string;
  duration_ms: number;
}

export interface SpecReconciliationInput {
  db: MemoryDbConnection;
  /** discoverChangedSpecs と同一の走査起点でなければならない */
  specRoot: string;
  recordedAt: string;
  /**
   * 消失率が {@link DEAD_RATIO_ABORT} を超えても中断せず掃除する。
   * specRoot の取り違えによる大量削除を防ぐガードの明示的な脱出口で、定期実行の
   * 呼び出し元は渡さない（初回の大掃除など、正当に超える場面でのみ true）。
   */
  allowBulkRemoval?: boolean;
  logger?: MemoryLogger;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * memory_edge_invalidations.reason の CHECK 制約が許す値のうち、spec 側の変更に
 * 対応するもの。
 *
 * SHORTCUT: 削除専用の reason を足さず既存の 'spec_updated' に相乗りする.
 * ceiling: 「更新で無効化」と「文書ごと消滅」を reason だけでは区別できず、
 * detail の接頭辞 REMOVAL_DETAIL_PREFIX に依存する. upgrade: 無効化理由を集計・
 * 分岐する読み手、または detail の接頭辞で絞り込む読み手が現れたら CHECK 制約に
 * 'spec_removed' を足す 12-step migration を行う.
 */
const INVALIDATION_REASON = 'spec_updated';

/**
 * 「設計書が消えたことによる無効化」の判別子。復活時の巻き戻し（reviveSpecDocValidity）が
 * これで対象を絞るため、文言を変えると復活経路が黙って効かなくなる。
 */
export const REMOVAL_DETAIL_PREFIX = 'spec doc removed: ';

/** 登録済みドキュメントのうち、これを超える割合が消えていたら異常とみなす */
const DEAD_RATIO_ABORT = 0.5;

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

/**
 * 消えたドキュメントだけにぶら下がる spec_doc entity を返す。
 *
 * memory_spec_doc_entities には upsertSpecDoc が作る spec_doc entity のほかに、
 * linkByC4Scope が解決した C4 要素 entity（Package / Concept）も入る。後者はコード
 * 由来の生きた根拠を持ちうるので、ここでは attributes_json の kind で spec_doc に
 * 限定し、それ以外は根拠チェック（hasRemainingEvidence）側へ委ねる。
 */
function exclusiveSpecDocEntityIds(
  db: MemoryDbConnection,
  deadDocIds: ReadonlySet<string>,
): string[] {
  const stmt = db.prepare(
    `SELECT sde.spec_doc_id AS spec_doc_id, sde.entity_id AS entity_id
       FROM memory_spec_doc_entities sde
       JOIN memory_entities e ON e.id = sde.entity_id
      WHERE json_extract(e.attributes_json, '$.kind') = 'spec_doc'`,
  );
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

/**
 * valid_until を立てる。last_updated_at は触らない —
 * runCodeReconciliation と揃えるため、および last_updated_at の時間窓で絞る読み手
 * （drift/recurringQuestions 等）へ無効 entity を押し込まないため。
 */
function softDeleteEntity(db: MemoryDbConnection, entityId: string, recordedAt: string): boolean {
  db.run('UPDATE memory_entities SET valid_until = ? WHERE id = ? AND valid_until IS NULL', [
    recordedAt,
    entityId,
  ]);
  return db.getRowsModified() > 0;
}

interface EvidenceStatements {
  edge: MemoryDbStatement;
  episode: MemoryDbStatement;
  spec: MemoryDbStatement;
}

/** entity が spec 以外の根拠（有効 edge・会話・生存 spec リンク）を持つか */
function hasRemainingEvidence(stmts: EvidenceStatements, entityId: string): boolean {
  if (stmts.edge.get(entityId, entityId)) return true;
  if (stmts.episode.get(entityId)) return true;
  if (stmts.spec.get(entityId)) return true;
  return false;
}

/**
 * 消えたドキュメント由来の有効な edge を閉じ、無効化を記録する。
 *
 * source_ref の書式は書き手によって 2 通りある（ingest/spec/persist.ts は
 * `spec_doc#<id>`、ingest/spec/linkByC4Scope.ts は接頭辞なしの生 id）。片方だけを
 * 見ると c4Scope 由来の edge が有効なまま残り、消えた設計書の主張が drift 判定の
 * 根拠として生き続ける。
 */
function invalidateSpecEdges(
  db: MemoryDbConnection,
  deadDocs: ReadonlyMap<string, string>,
  recordedAt: string,
): { count: number; touchedEntityIds: Set<string> } {
  const touchedEntityIds = new Set<string>();
  let count = 0;
  const stmt = db.prepare(
    `SELECT id, subject_entity_id, object_entity_id FROM memory_edges
      WHERE source_type = 'spec' AND valid_to IS NULL AND source_ref IN (?, ?)`,
  );
  try {
    for (const [docId, relPath] of deadDocs) {
      for (const row of stmt.all(`spec_doc#${docId}`, docId)) {
        const edgeId = String(row['id']);
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
          [invalidationId, edgeId, recordedAt, INVALIDATION_REASON, `${REMOVAL_DETAIL_PREFIX}${relPath}`],
        );
        count++;
        touchedEntityIds.add(String(row['subject_entity_id']));
        const objectId = row['object_entity_id'];
        if (objectId !== null) touchedEntityIds.add(String(objectId));
      }
    }
  } finally {
    stmt.free?.();
  }
  return { count, touchedEntityIds };
}

/** ドキュメント登録行を削除する（memory_spec_doc_entities は ON DELETE CASCADE） */
function removeSpecDocRows(db: MemoryDbConnection, deadDocIds: Iterable<string>): number {
  let removed = 0;
  for (const docId of deadDocIds) {
    db.run('DELETE FROM memory_spec_documents WHERE id = ?', [docId]);
    removed += db.getRowsModified();
  }
  return removed;
}

/** edge を失って根拠ゼロになった entity を無効化する */
function softDeleteOrphanEntities(
  db: MemoryDbConnection,
  candidateIds: Iterable<string>,
  excludeIds: ReadonlySet<string>,
  recordedAt: string,
): number {
  const stmts: EvidenceStatements = {
    edge: db.prepare(
      `SELECT 1 FROM memory_edges
        WHERE (subject_entity_id = ? OR object_entity_id = ?) AND valid_to IS NULL LIMIT 1`,
    ),
    episode: db.prepare('SELECT 1 FROM memory_episode_entities WHERE entity_id = ? LIMIT 1'),
    spec: db.prepare('SELECT 1 FROM memory_spec_doc_entities WHERE entity_id = ? LIMIT 1'),
  };
  let count = 0;
  try {
    for (const entityId of candidateIds) {
      if (excludeIds.has(entityId)) continue;
      if (hasRemainingEvidence(stmts, entityId)) continue;
      if (softDeleteEntity(db, entityId, recordedAt)) count++;
    }
  } finally {
    stmts.edge.free?.();
    stmts.episode.free?.();
    stmts.spec.free?.();
  }
  return count;
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
 * - spec_doc entity と根拠を失った entity に valid_until を立てる（soft delete）
 * - 該当 spec edge に valid_to を立て、memory_edge_invalidations へ記録する
 *
 * 実体（履歴）は entity / edge 側に残す。消すのはファイルシステムのミラーである
 * ドキュメント登録行だけ。**ファイルが戻ったときの巻き戻しは ingest 側
 * （ingest/spec/reviveValidity.ts）が担う** — 不変条件がこの 2 ファイルに分かれて
 * いるので、片方だけ変更しないこと。
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

  const abort = (detail: string): SpecReconciliationResult => {
    result.status = 'error';
    result.error_detail = detail;
    result.removed_docs = 0;
    result.soft_deleted_doc_entities = 0;
    result.invalidated_edges = 0;
    result.soft_deleted_orphan_entities = 0;
    logger.error(`[${recordedAt}] [ERROR] [anytime-memory] runSpecReconciliation: ${detail}`);
    return finish();
  };

  if (!specRootHasMarkdown(specRoot)) {
    return abort(`specRoot に Markdown が見つからない (${specRoot}) — 全件削除を避けるため中断`);
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

  const deadRatio = deadDocs.length / docs.length;
  if (deadRatio > DEAD_RATIO_ABORT && input.allowBulkRemoval !== true) {
    return abort(
      `登録 ${docs.length} 件中 ${deadDocs.length} 件 (${Math.round(deadRatio * 100)}%) が specRoot ` +
        `(${specRoot}) に無い — specRoot 取り違えの疑いがあるため中断（意図した大掃除なら allowBulkRemoval を渡す）`,
    );
  }

  const deadDocMap = new Map(deadDocs.map((d) => [d.id, d.rel_path]));
  const deadDocIds = new Set(deadDocMap.keys());
  const docEntityIds = exclusiveSpecDocEntityIds(db, deadDocIds);

  try {
    db.run('BEGIN');
    try {
      const edges = invalidateSpecEdges(db, deadDocMap, recordedAt);
      result.invalidated_edges = edges.count;

      result.removed_docs = removeSpecDocRows(db, deadDocIds);

      for (const entityId of docEntityIds) {
        if (softDeleteEntity(db, entityId, recordedAt)) result.soft_deleted_doc_entities++;
      }

      // 登録行の削除（CASCADE）後に評価する。消えた doc へのリンクは既に無いので、
      // 残っているリンクは生存 doc のものだけ = 根拠として数えてよい。
      result.soft_deleted_orphan_entities = softDeleteOrphanEntities(
        db,
        edges.touchedEntityIds,
        new Set(docEntityIds),
        recordedAt,
      );

      db.run('COMMIT');
    } catch (err) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `[${recordedAt}] [ERROR] [anytime-memory] runSpecReconciliation: ROLLBACK 自体が失敗`,
          rollbackErr,
        );
      }
      throw err;
    }
  } catch (err) {
    logger.error(
      `[${recordedAt}] [ERROR] [anytime-memory] runSpecReconciliation: 失敗したため巻き戻した`,
      err,
    );
    return abort(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
  }

  logger.info(
    `[${recordedAt}] [INFO] [anytime-memory] runSpecReconciliation: ` +
      `scanned=${result.scanned} removed_docs=${result.removed_docs} ` +
      `doc_entities=${result.soft_deleted_doc_entities} edges=${result.invalidated_edges} ` +
      `orphan_entities=${result.soft_deleted_orphan_entities}`,
  );
  return finish();
}
